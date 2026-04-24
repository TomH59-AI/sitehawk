import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-scan";
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const ARCGIS_FLORIDA_URL = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";

// Florida bounding box
const FL_LAT_MIN = 24.4, FL_LAT_MAX = 31.1;
const FL_LON_MIN = -87.7, FL_LON_MAX = -79.9;

function isInFlorida(lat, lon) {
  return lat >= FL_LAT_MIN && lat <= FL_LAT_MAX && lon >= FL_LON_MIN && lon <= FL_LON_MAX;
}

// DOR Use Code → zoning-like label
function dorUcToZoning(dorUc) {
  const code = parseInt(dorUc);
  if (code >= 0 && code <= 9) return "Vacant";
  if (code >= 10 && code <= 19) return "Single Family";
  if (code >= 20 && code <= 29) return "Multi-Family";
  if (code >= 30 && code <= 39) return "Vacant Commercial";
  if (code >= 40 && code <= 49) return "Industrial";
  if (code >= 50 && code <= 59) return "Agricultural";
  if (code >= 60 && code <= 69) return "Institutional";
  if (code >= 70 && code <= 79) return "Government";
  if (code >= 80 && code <= 89) return "Leasehold";
  return `DOR-${dorUc}`;
}

// Simple match score for tower site suitability based on Florida parcel data
function computeMatchScore(props, distMeters) {
  let score = 70; // baseline

  // Prefer larger parcels
  const sqft = props.LND_SQFOOT || 0;
  if (sqft >= 100000) score += 15;
  else if (sqft >= 43560) score += 8;
  else if (sqft < 10000) score -= 15;

  // Prefer vacant / agricultural / commercial land use
  const dor = parseInt(props.DOR_UC || 99);
  if (dor >= 0 && dor <= 9) score += 10;   // Vacant
  if (dor >= 50 && dor <= 59) score += 8;  // Agricultural
  if (dor >= 30 && dor <= 39) score += 5;  // Vacant commercial

  // Penalize residential
  if (dor >= 10 && dor <= 19) score -= 10;
  if (dor >= 20 && dor <= 29) score -= 10;

  // Penalize government / institutional
  if (dor >= 60 && dor <= 79) score -= 20;

  // Closer to search center = better
  const distMiles = distMeters / 1609.344;
  if (distMiles <= 0.1) score += 5;
  else if (distMiles > 0.4) score -= 5;

  return Math.max(10, Math.min(99, Math.round(score)));
}

// Haversine distance in meters
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Get centroid of a GeoJSON polygon
function getCentroid(geometry) {
  if (!geometry || geometry.type !== "Polygon") return null;
  const coords = geometry.coordinates[0];
  let latSum = 0, lonSum = 0;
  for (const [lon, lat] of coords) { lonSum += lon; latSum += lat; }
  return { lat: latSum / coords.length, lon: lonSum / coords.length };
}

async function searchFlorida(lat, lon, radiusMiles, offset) {
  const radiusMeters = radiusMiles * 1609.344;

  // Query ArcGIS with a spatial filter (point + distance)
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    distance: radiusMeters.toString(),
    units: "esriSRUnit_Meter",
    inSR: "4326",
    outSR: "4326",
    outFields: "PARCEL_ID,OWN_NAME,OWN_ADDR1,OWN_ADDR2,OWN_CITY,OWN_STATE,OWN_ZIPCD,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,LND_SQFOOT,DOR_UC,CO_NO,STATE_PAR_",
    f: "geojson",
    resultOffset: (offset || 0).toString(),
    resultRecordCount: "20",
  });

  const res = await fetch(`${ARCGIS_FLORIDA_URL}?${params}`);
  const data = await res.json();

  if (!data.features || data.features.length === 0) {
    return { candidates: [], ordinance: null };
  }

  // Map features to candidate shape, compute scores, sort, slice top 5
  const candidates = data.features
    .map((feature) => {
      const p = feature.properties;
      const centroid = getCentroid(feature.geometry);
      if (!centroid) return null;

      const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
      const acres = p.LND_SQFOOT ? (p.LND_SQFOOT / 43560) : null;
      const zoning = dorUcToZoning(p.DOR_UC);
      const mailingAddr = [p.OWN_ADDR1, p.OWN_CITY, p.OWN_STATE, p.OWN_ZIPCD].filter(Boolean).join(", ");
      const physAddr = [p.PHY_ADDR1, p.PHY_CITY, "FL", p.PHY_ZIPCD].filter(Boolean).join(", ");

      return {
        site_name: physAddr || `FL Parcel ${p.PARCEL_ID}`,
        owner_name: p.OWN_NAME || "Unknown Owner",
        parcel_address: physAddr || "—",
        parcel_id: p.PARCEL_ID || p.STATE_PAR_ || "—",
        parcel_size_acres: acres ? parseFloat(acres.toFixed(2)) : null,
        zoning,
        owner_mailing_address: mailingAddr || null,
        latitude: centroid.lat,
        longitude: centroid.lon,
        fema_risk: null,
        phone: null,
        email: null,
        match_score: computeMatchScore(p, distMeters),
        match_reason: `Florida cadastral data · ${zoning} · ${acres ? acres.toFixed(1) + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi from center`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 5);

  return { candidates, ordinance: null };
}

// Rate limiting
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 5;

function isRateLimited(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= MAX_REQUESTS_PER_MINUTE) return true;
  entry.count++;
  rateLimitMap.set(userId, entry);
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tier = user.tier || 'blind';
    if (tier === 'blind' || tier === 'free') {
      return Response.json({ error: 'Upgrade required' }, { status: 403 });
    }

    if (isRateLimited(user.id)) {
      console.warn(`Rate limit hit for user: ${user.email}`);
      return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const body = await req.json();
    const { lat, lon, radius_miles, offset } = body;

    if (!lat || !lon) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    const radiusMiles = radius_miles || 0.5;

    // Route Florida searches to ArcGIS (free, no key needed)
    if (isInFlorida(lat, lon)) {
      console.log(`FL ArcGIS scan: user=${user.email} tier=${tier} lat=${lat} lon=${lon} offset=${offset || 0}`);
      const result = await searchFlorida(lat, lon, radiusMiles, offset || 0);
      return Response.json(result);
    }

    // All other states → Supabase/Regrid
    console.log(`Supabase scan: user=${user.email} tier=${tier} lat=${lat} lon=${lon} offset=${offset || 0}`);
    const res = await fetch(SUPABASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ lat, lon, radius_miles: radiusMiles, offset: offset || 0 }),
    });

    const data = await res.json();
    return Response.json(data);

  } catch (error) {
    console.error('siteSearch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});