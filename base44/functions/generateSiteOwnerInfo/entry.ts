/**
 * generateSiteOwnerInfo — Target A only.
 *
 * Fills the SCIP "SITE INFORMATION" + "OWNER INFORMATION" block by combining:
 *   - Realie API   → parcel facts (county, APN, owner, address, acreage, lat/lon)
 *   - USGS EPQS    → ground elevation (ft AMSL)
 *   - Enformion    → phone number (via existing skipTrace fn, which carries user auth)
 *   - Geometry     → parcel dimensions (sqrt of acres→sqft) + distance from ring center
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const REALIE_URL = "https://app.realie.ai/api/public/property/location/";
const EPQS_URL = "https://epqs.nationalmap.gov/v1/json";

// ─── Helpers ───────────────────────────────────────────────────────────────
function normalize(p) {
  return {
    apn: p.apn || p.parcelId || p.parcel_id || p.parcel_number || null,
    owner_name: p.ownerName || p.owner_name || p.owner || null,
    mailing_address:
      p.ownerMailingAddress ||
      [p.owner_mailing_address, p.owner_mailing_city, p.owner_mailing_state, p.owner_mailing_zip]
        .filter(Boolean).join(", ") || null,
    parcel_address: p.address || p.fullAddress || p.site_address || null,
    parcel_city: p.city || p.site_city || null,
    parcel_state: p.state || p.site_state || null,
    parcel_zip: p.zip || p.zipcode || p.site_zip || null,
    county: p.county || p.countyName || null,
    acreage: p.acres || p.acreage || p.lotSizeAcres || null,
    land_use: p.landUse || p.land_use || p.useDescription || null,
    zoning: p.zoning || p.zoning_code || null,
    latitude: p.latitude || p.lat || null,
    longitude: p.longitude || p.lon || p.lng || null,
  };
}

// "STREET, CITY, ST 12345" → { street, city, state, zip }
function parseAddress(full) {
  if (!full) return {};
  const parts = String(full).split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return { street: parts[0] || "" };
  const last = parts[parts.length - 1];
  const m = last.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (m) {
    return { street: parts[0], city: parts[1] || "", state: m[1].toUpperCase(), zip: m[2] };
  }
  return { street: parts[0], city: parts[1] || "", state: parts[2] || "", zip: parts[3] || "" };
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function computeParcelDimensionsFt(acres) {
  if (!acres) return null;
  const sqFt = Number(acres) * 43560;
  const side = Math.round(Math.sqrt(sqFt));
  return `${side} ft × ${side} ft (approx)`;
}

async function fetchTargetAFromRealie(lat, lon, key) {
  const url = `${REALIE_URL}?latitude=${lat}&longitude=${lon}&radius=1&limit=100`;
  const r = await fetch(url, { headers: { Authorization: key } });
  if (!r.ok) throw new Error(`Realie HTTP ${r.status}`);
  const data = await r.json();
  const items = data.properties || data.results || (Array.isArray(data) ? data : []);
  // Pick the closest non-tiny parcel (>= 5 acres) so we don't return a residential lot
  const candidates = items.map(normalize)
    .filter(p => p.latitude && p.longitude && (Number(p.acreage) || 0) >= 5)
    .map(p => ({ ...p, _dist: haversineMiles(lat, lon, p.latitude, p.longitude) }))
    .sort((a, b) => a._dist - b._dist);
  return candidates[0] || null;
}

async function fetchElevation(lat, lon) {
  try {
    const r = await fetch(`${EPQS_URL}?x=${lon}&y=${lat}&units=Feet&wkid=4326&includeDate=false`);
    if (!r.ok) return null;
    const d = await r.json();
    const v = d?.value;
    return (v != null && v > -100000) ? parseFloat(parseFloat(v).toFixed(1)) : null;
  } catch (_) { return null; }
}

async function fetchCounty(lat, lon) {
  try {
    const r = await fetch(`https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`);
    const d = await r.json();
    return d?.County?.name ? d.County.name.replace(/\s+County$/i, "").trim() : null;
  } catch (_) { return null; }
}

async function fetchPhone(base44, owner_name, mailing_address) {
  try {
    const res = await base44.functions.invoke("skipTrace", { owner_name, mailing_address });
    const data = res?.data || res || {};
    const phones = data?.phones || data?.result?.phones || [];
    const first = phones[0];
    return first?.number || (typeof first === "string" ? first : null);
  } catch (e) {
    console.warn("skipTrace failed:", e?.message);
    return null;
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const {
      lat,                 // search ring center
      lon,
      target_lat,          // optional: lat/lon of the chosen Target A parcel (if already known)
      target_lon,
      tower_height_ft = 199,
    } = await req.json();

    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon (ring center) required" }, { status: 400 });
    }

    const realieKey = Deno.env.get("REALIE_API_KEY");
    if (!realieKey) return Response.json({ error: "REALIE_API_KEY not set" }, { status: 500 });

    // 1. Pull Target A from Realie (closest qualifying parcel to ring center, OR explicit lat/lon)
    const searchLat = target_lat ?? lat;
    const searchLon = target_lon ?? lon;
    const parcel = await fetchTargetAFromRealie(searchLat, searchLon, realieKey);
    if (!parcel) {
      return Response.json({ error: "No qualifying Target A parcel found from Realie." }, { status: 404 });
    }

    // 2. Parse address + run enrichment calls in parallel
    const parsed = parseAddress(parcel.parcel_address);
    const [elevation_ft, fccCounty, phone] = await Promise.all([
      fetchElevation(parcel.latitude, parcel.longitude),
      parcel.county ? Promise.resolve(parcel.county) : fetchCounty(parcel.latitude, parcel.longitude),
      fetchPhone(base44, parcel.owner_name, parcel.mailing_address),
    ]);

    const distance_miles = haversineMiles(lat, lon, parcel.latitude, parcel.longitude);

    const result = {
      site_information: {
        parcel_county:        fccCounty || parcel.county || "—",
        parcel_id:            parcel.apn || "—",
        owner_name_on_deed:   parcel.owner_name || "—",
        parcel_street_address: parcel.parcel_address ? parsed.street || parcel.parcel_address : "—",
        parcel_city:          parcel.parcel_city || parsed.city || "—",
        parcel_state:         parcel.parcel_state || parsed.state || "—",
        parcel_zip:           parcel.parcel_zip || parsed.zip || "—",
        parcel_size_acres:    parcel.acreage != null ? `${parcel.acreage} acres MOL` : "—",
        latitude:             parcel.latitude != null ? Number(parcel.latitude).toFixed(6) : "—",
        longitude:            parcel.longitude != null ? Number(parcel.longitude).toFixed(6) : "—",
        tower_height:         `${tower_height_ft} ft`,
        parcel_dimensions_ft: computeParcelDimensionsFt(parcel.acreage) || "—",
        ground_elevation:     elevation_ft != null ? `${elevation_ft} ft AMSL` : "—",
        distance_from_ring_center: `${distance_miles.toFixed(2)} mi`,
      },
      owner_information: {
        names:           parcel.owner_name || "—",
        contact_person:  parcel.owner_name ? parcel.owner_name.split(/[;&]/)[0].trim() : "—",
        mailing_address: parcel.mailing_address || "—",
        phone_number:    phone || "Not found",
      },
      sources: {
        realie: true,
        usgs_epqs: elevation_ft != null,
        enformion: !!phone,
        fcc_geo: !!fccCounty,
      },
    };

    console.log(`generateSiteOwnerInfo: user=${user.email} apn=${parcel.apn} owner=${parcel.owner_name} phone=${!!phone} elev=${elevation_ft}`);
    return Response.json(result);
  } catch (error) {
    console.error("generateSiteOwnerInfo error:", error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});