import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-scan";
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// ── ArcGIS Endpoints (free, no key) ─────────────────────────────────────────
const ARCGIS_FL  = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";
const ARCGIS_NC  = "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/0/query";
const ARCGIS_MA  = "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/MassGIS_L3_Parcels/FeatureServer/1/query";
const ARCGIS_MD  = "https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0/query";

// ── Bounding boxes ────────────────────────────────────────────────────────────
const BBOX = {
  FL: { latMin: 24.4, latMax: 31.1, lonMin: -87.7, lonMax: -79.9 },
  NC: { latMin: 33.8, latMax: 36.6, lonMin: -84.4, lonMax: -75.4 },
  MA: { latMin: 41.2, latMax: 42.9, lonMin: -73.5, lonMax: -69.9 },
  MD: { latMin: 37.9, latMax: 39.7, lonMin: -79.5, lonMax: -74.9 },
};

function inState(lat, lon, state) {
  const b = BBOX[state];
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCentroid(geometry) {
  if (!geometry) return null;
  const ring = geometry.type === "Polygon"
    ? geometry.coordinates[0]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates[0][0]
      : null;
  if (!ring) return null;
  let latSum = 0, lonSum = 0;
  for (const [lon, lat] of ring) { lonSum += lon; latSum += lat; }
  return { lat: latSum / ring.length, lon: lonSum / ring.length };
}

// Generic score based on acres and distance — used when use-code isn't well known
function genericScore(acres, distMeters, zoningBonus = 0) {
  let score = 65;
  if (acres >= 5) score += 15;
  else if (acres >= 2) score += 8;
  else if (acres < 0.25) score -= 15;
  const distMiles = distMeters / 1609.344;
  if (distMiles <= 0.1) score += 5;
  else if (distMiles > 0.4) score -= 5;
  score += zoningBonus;
  return Math.max(10, Math.min(99, Math.round(score)));
}

async function queryArcGIS(url, lat, lon, radiusMiles, outFields, offset) {
  const radiusMeters = radiusMiles * 1609.344;
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    distance: radiusMeters.toString(),
    units: "esriSRUnit_Meter",
    inSR: "4326",
    outSR: "4326",
    outFields,
    f: "geojson",
    resultOffset: (offset || 0).toString(),
    resultRecordCount: "20",
  });
  const res = await fetch(`${url}?${params}`);
  return res.json();
}

// ── Florida ───────────────────────────────────────────────────────────────────
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

function flMatchScore(props, distMeters) {
  let score = 70;
  const sqft = props.LND_SQFOOT || 0;
  if (sqft >= 100000) score += 15;
  else if (sqft >= 43560) score += 8;
  else if (sqft < 10000) score -= 15;
  const dor = parseInt(props.DOR_UC || 99);
  if (dor >= 0 && dor <= 9) score += 10;
  if (dor >= 50 && dor <= 59) score += 8;
  if (dor >= 30 && dor <= 39) score += 5;
  if (dor >= 10 && dor <= 19) score -= 10;
  if (dor >= 20 && dor <= 29) score -= 10;
  if (dor >= 60 && dor <= 79) score -= 20;
  const distMiles = distMeters / 1609.344;
  if (distMiles <= 0.1) score += 5;
  else if (distMiles > 0.4) score -= 5;
  return Math.max(10, Math.min(99, Math.round(score)));
}

async function searchFlorida(lat, lon, radiusMiles, offset) {
  const fields = "PARCEL_ID,OWN_NAME,OWN_ADDR1,OWN_CITY,OWN_STATE,OWN_ZIPCD,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,LND_SQFOOT,DOR_UC,STATE_PAR_";
  const data = await queryArcGIS(ARCGIS_FL, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.LND_SQFOOT ? parseFloat((p.LND_SQFOOT / 43560).toFixed(2)) : null;
    const zoning = dorUcToZoning(p.DOR_UC);
    const mailingAddr = [p.OWN_ADDR1, p.OWN_CITY, p.OWN_STATE, p.OWN_ZIPCD].filter(Boolean).join(", ");
    const physAddr = [p.PHY_ADDR1, p.PHY_CITY, "FL", p.PHY_ZIPCD].filter(Boolean).join(", ");
    return {
      site_name: physAddr || `FL Parcel ${p.PARCEL_ID}`,
      owner_name: p.OWN_NAME || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: p.PARCEL_ID || p.STATE_PAR_ || "—",
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: flMatchScore(p, distMeters),
      match_reason: `Florida cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// ── North Carolina ────────────────────────────────────────────────────────────
function ncUseToZoning(desc) {
  if (!desc) return "Unknown";
  const d = desc.toUpperCase();
  if (d.includes("VACANT") || d.includes("UNDEVELOPED")) return "Vacant";
  if (d.includes("AGRICUL") || d.includes("FARM") || d.includes("TIMBER")) return "Agricultural";
  if (d.includes("COMMERCIAL") || d.includes("RETAIL") || d.includes("OFFICE")) return "Commercial";
  if (d.includes("INDUSTRIAL") || d.includes("WAREHOUSE") || d.includes("MANUFACTUR")) return "Industrial";
  if (d.includes("SINGLE") || d.includes("RESID") || d.includes("DWELLING")) return "Residential";
  if (d.includes("MULTIFAM") || d.includes("APARTMENT") || d.includes("CONDO")) return "Multi-Family";
  if (d.includes("GOVERNMENT") || d.includes("MUNICIPAL") || d.includes("COUNTY")) return "Government";
  if (d.includes("CHURCH") || d.includes("RELIGIOUS") || d.includes("SCHOOL")) return "Institutional";
  return desc.length > 30 ? desc.substring(0, 30) : desc;
}

function ncZoningBonus(desc) {
  const z = ncUseToZoning(desc);
  if (z === "Vacant") return 10;
  if (z === "Agricultural") return 8;
  if (z === "Commercial") return 5;
  if (z === "Industrial") return 3;
  if (z === "Residential") return -8;
  if (z === "Government" || z === "Institutional") return -15;
  return 0;
}

async function searchNorthCarolina(lat, lon, radiusMiles, offset) {
  const fields = "parno,ownname,mailadd,mcity,mstate,mzip,siteadd,sitecity,gisacres,usedscrp,parval";
  const data = await queryArcGIS(ARCGIS_NC, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.gisacres ? parseFloat(parseFloat(p.gisacres).toFixed(2)) : null;
    const zoning = ncUseToZoning(p.usedscrp);
    const mailingAddr = [p.mailadd, p.mcity, p.mstate, p.mzip].filter(Boolean).join(", ");
    const physAddr = [p.siteadd, p.sitecity, "NC"].filter(Boolean).join(", ");
    return {
      site_name: physAddr || `NC Parcel ${p.parno}`,
      owner_name: p.ownname || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: p.parno || "—",
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, ncZoningBonus(p.usedscrp)),
      match_reason: `NC OneMap cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// ── Massachusetts ─────────────────────────────────────────────────────────────
// MassGIS Land Use codes → zoning label
function maUseToZoning(useCode) {
  const c = parseInt(useCode) || 0;
  if (c === 0) return "Unknown";
  if (c >= 1 && c <= 10) return "Residential";
  if (c >= 11 && c <= 19) return "Multi-Family";
  if (c >= 30 && c <= 39) return "Commercial";
  if (c >= 40 && c <= 49) return "Industrial";
  if (c >= 60 && c <= 69) return "Agricultural";
  if (c >= 70 && c <= 79) return "Recreational";
  if (c >= 90 && c <= 99) return "Vacant";
  if (c >= 100 && c <= 109) return "Government";
  return `MA-${useCode}`;
}

function maZoningBonus(useCode) {
  const z = maUseToZoning(useCode);
  if (z === "Vacant") return 10;
  if (z === "Agricultural") return 8;
  if (z === "Industrial") return 5;
  if (z === "Commercial") return 4;
  if (z === "Residential" || z === "Multi-Family") return -8;
  if (z === "Government") return -15;
  return 0;
}

async function searchMassachusetts(lat, lon, radiusMiles, offset) {
  const fields = "MAP_PAR_ID,OWNER1,OWN_ADDR,OWN_CITY,OWN_STATE,OWN_ZIP,SITE_ADDR,SITE_CITY,LOT_SIZE,USE_CODE,TOTAL_VAL,ZONING";
  const data = await queryArcGIS(ARCGIS_MA, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    // LOT_SIZE is in square feet for MassGIS L3
    const acres = p.LOT_SIZE ? parseFloat((p.LOT_SIZE / 43560).toFixed(2)) : null;
    const zoning = p.ZONING || maUseToZoning(p.USE_CODE);
    const mailingAddr = [p.OWN_ADDR, p.OWN_CITY, p.OWN_STATE, p.OWN_ZIP].filter(Boolean).join(", ");
    const physAddr = [p.SITE_ADDR, p.SITE_CITY, "MA"].filter(Boolean).join(", ");
    return {
      site_name: physAddr || `MA Parcel ${p.MAP_PAR_ID}`,
      owner_name: p.OWNER1 || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: p.MAP_PAR_ID || "—",
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, maZoningBonus(p.USE_CODE)),
      match_reason: `MassGIS cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// ── Maryland ──────────────────────────────────────────────────────────────────
function mdUseToZoning(landuse) {
  if (!landuse) return "Unknown";
  const d = landuse.toUpperCase();
  if (d.includes("VACANT") || d.includes("UNIMPROVED")) return "Vacant";
  if (d.includes("FARM") || d.includes("AGRICUL") || d.includes("FOREST") || d.includes("TIMBER")) return "Agricultural";
  if (d.includes("COMMERCIAL") || d.includes("RETAIL") || d.includes("OFFICE")) return "Commercial";
  if (d.includes("INDUSTRIAL") || d.includes("MANUFACTUR") || d.includes("WAREHOUSE")) return "Industrial";
  if (d.includes("RESIDENTIAL") || d.includes("SINGLE") || d.includes("DWELLING")) return "Residential";
  if (d.includes("APARTMENT") || d.includes("CONDO") || d.includes("MULTI")) return "Multi-Family";
  if (d.includes("GOVERNMENT") || d.includes("MUNICIPAL") || d.includes("PUBLIC")) return "Government";
  if (d.includes("CHURCH") || d.includes("SCHOOL") || d.includes("INSTITUTIONAL")) return "Institutional";
  return landuse.length > 30 ? landuse.substring(0, 30) : landuse;
}

function mdZoningBonus(landuse) {
  const z = mdUseToZoning(landuse);
  if (z === "Vacant") return 10;
  if (z === "Agricultural") return 8;
  if (z === "Commercial") return 5;
  if (z === "Industrial") return 4;
  if (z === "Residential" || z === "Multi-Family") return -8;
  if (z === "Government" || z === "Institutional") return -15;
  return 0;
}

async function searchMaryland(lat, lon, radiusMiles, offset) {
  const fields = "ACCTID,ADDRESS,FULLADDRESS,CITY,STATE,ZIPCODE,OWNADD1,OWNCITY,OWNSTATE,OWNZIP,ACRES,ZONING,LANDUSE,NFMLNDVL,YEARBLT";
  const data = await queryArcGIS(ARCGIS_MD, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.ACRES ? parseFloat(parseFloat(p.ACRES).toFixed(2)) : null;
    const zoning = p.ZONING || mdUseToZoning(p.LANDUSE);
    const mailingAddr = [p.OWNADD1, p.OWNCITY, p.OWNSTATE, p.OWNZIP].filter(Boolean).join(", ");
    const physAddr = [p.FULLADDRESS || p.ADDRESS, p.CITY, "MD", p.ZIPCODE].filter(Boolean).join(", ");
    return {
      site_name: physAddr || `MD Parcel ${p.ACCTID}`,
      owner_name: "—", // MD iMAP parcel layer doesn't expose owner name publicly
      parcel_address: physAddr || "—",
      parcel_id: p.ACCTID || "—",
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, mdZoningBonus(p.LANDUSE)),
      match_reason: `Maryland iMAP cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// ── Coordinate cache (Regrid fallback only) ───────────────────────────────────
// Keyed by "lat4,lon4" (4 decimal places ≈ ~11m grid), TTL 24 hours
const regridCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(lat, lon) {
  return `${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;
}

function getCached(lat, lon) {
  const key = getCacheKey(lat, lon);
  const entry = regridCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    regridCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(lat, lon, data) {
  regridCache.set(getCacheKey(lat, lon), { data, ts: Date.now() });
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
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

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tier = user.tier || 'blind';
    const isFreeTrialEligible = (tier === 'blind' || tier === 'free') && !user.free_trial_used;

    if ((tier === 'blind' || tier === 'free') && !isFreeTrialEligible) {
      return Response.json({ error: 'Upgrade required' }, { status: 403 });
    }

    // Consume the free trial scan slot
    if (isFreeTrialEligible) {
      console.log(`Free trial scan: user=${user.email}`);
      const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
      if (users.length) {
        await base44.asServiceRole.entities.User.update(users[0].id, { free_trial_used: true });
      }
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

    // ── Free ArcGIS routes (no token cost) ───────────────────────────────────
    if (inState(lat, lon, "FL")) {
      console.log(`FL ArcGIS scan: user=${user.email} lat=${lat} lon=${lon}`);
      return Response.json(await searchFlorida(lat, lon, radiusMiles, offset || 0));
    }

    if (inState(lat, lon, "NC")) {
      console.log(`NC ArcGIS scan: user=${user.email} lat=${lat} lon=${lon}`);
      return Response.json(await searchNorthCarolina(lat, lon, radiusMiles, offset || 0));
    }

    if (inState(lat, lon, "MA")) {
      console.log(`MA ArcGIS scan: user=${user.email} lat=${lat} lon=${lon}`);
      return Response.json(await searchMassachusetts(lat, lon, radiusMiles, offset || 0));
    }

    if (inState(lat, lon, "MD")) {
      console.log(`MD ArcGIS scan: user=${user.email} lat=${lat} lon=${lon}`);
      return Response.json(await searchMaryland(lat, lon, radiusMiles, offset || 0));
    }

    // ── Fallback: Supabase/Regrid (token-based) ───────────────────────────────
    // Check cache first — skip Regrid if we have a recent result for this location
    const cached = getCached(lat, lon);
    if (cached) {
      console.log(`Regrid cache HIT: user=${user.email} lat=${lat} lon=${lon}`);
      return Response.json(cached);
    }

    console.log(`Regrid fallback: user=${user.email} lat=${lat} lon=${lon}`);
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
    // Cache the result to avoid repeat Regrid calls for the same area
    if (data && !data.error) {
      setCache(lat, lon, data);
      console.log(`Regrid result cached for lat=${lat} lon=${lon}`);
    }
    return Response.json(data);

  } catch (error) {
    console.error('siteSearch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});