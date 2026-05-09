import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-scan";
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// ── ArcGIS Endpoints (free, no key) ─────────────────────────────────────────
const ARCGIS_FL  = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";
const ARCGIS_NC  = "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1/query";
const ARCGIS_MA  = "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0/query";
const ARCGIS_MD  = "https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0/query";
const ARCGIS_CT  = "https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0/query";
const ARCGIS_VT  = "https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0/query";

// ── Bounding boxes ────────────────────────────────────────────────────────────
const BBOX = {
  FL: { latMin: 24.4, latMax: 31.1, lonMin: -87.7, lonMax: -79.9 },
  NC: { latMin: 33.8, latMax: 36.6, lonMin: -84.4, lonMax: -75.4 },
  MA: { latMin: 41.2, latMax: 42.9, lonMin: -73.5, lonMax: -69.9 },
  MD: { latMin: 37.9, latMax: 39.7, lonMin: -79.5, lonMax: -74.9 },
  CT: { latMin: 40.95, latMax: 42.05, lonMin: -73.73, lonMax: -71.78 },
  VT: { latMin: 42.72, latMax: 45.02, lonMin: -73.43, lonMax: -71.46 },
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

// ── scip_parcels Supabase cache (universal pre-Regrid fallback) ──────────────
const HAWK_PARCELS_URL = "https://skpxeouvikzgsaurkohf.supabase.co/rest/v1/scip_parcels";
const HAWK_RES_FILTERS = ["R", "RES", "RESI", "SFR", "MFR", "APT", "CONDO"];

function isHawkResidential(zoning) {
  if (!zoning) return false;
  const z = zoning.toUpperCase();
  return HAWK_RES_FILTERS.some((p) => z.includes(p));
}

function scoreHawkParcel(p, distMeters) {
  const distanceScore = distMeters ? Math.max(0, 100 - (distMeters / 8)) : 70;
  const zoningScore = p.zoning?.startsWith("C") ? 100 :
                      p.zoning?.startsWith("I") ? 95 : 60;
  const acreageScore = p.acreage ? Math.min(100, p.acreage * 12) : 40;
  return Math.round(distanceScore * 0.4 + zoningScore * 0.4 + acreageScore * 0.2);
}

async function searchHawkParcels(lat, lon, radiusMiles) {
  const radiusMeters = radiusMiles * 1609.344;
  const latDelta = 0.00725;
  const lonDelta = 0.00725;

  const params = new URLSearchParams({ select: "*" });
  params.append("latitude", `gte.${lat - latDelta}`);
  params.append("latitude", `lte.${lat + latDelta}`);
  params.append("longitude", `gte.${lon - lonDelta}`);
  params.append("longitude", `lte.${lon + lonDelta}`);
  params.append("limit", "50");

  const res = await fetch(`${HAWK_PARCELS_URL}?${params}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) return { candidates: [], ordinance: null };

  const rows = await res.json();
  if (!rows?.length) return { candidates: [], ordinance: null };

  const candidates = rows
    .filter((p) => !isHawkResidential(p.zoning))
    .map((p) => {
      if (p.latitude == null || p.longitude == null) return null;
      const distMeters = haversineMeters(lat, lon, p.latitude, p.longitude);
      if (distMeters > radiusMeters) return null;
      const score = scoreHawkParcel(p, distMeters);
      return {
        site_name: p.parcel_address || `${p.state} Parcel ${p.parcel_id}`,
        owner_name: p.owner_name || "Unknown Owner",
        parcel_address: p.parcel_address || "—",
        parcel_id: p.parcel_id || "—",
        parcel_size_acres: p.acreage ?? null,
        zoning: p.zoning || "Unknown",
        owner_mailing_address: p.mailing_address || null,
        latitude: p.latitude,
        longitude: p.longitude,
        parcel_geometry: p.parcel_geometry || null,
        fema_risk: null, phone: null, email: null,
        match_score: score,
        match_reason: `hawk_parcels cache · ${p.zoning || "Unknown"} · ${p.acreage ? p.acreage + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 5);

  return { candidates, ordinance: null };
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
  const d = desc.toUpperCase().trim();
  // NC OneMap single-letter parusedesc codes (used by many counties incl. Wake)
  if (d.length <= 2) {
    const codeMap = {
      V: "Vacant",
      R: "Residential",
      A: "Agricultural",
      C: "Commercial",
      I: "Industrial",
      M: "Multi-Family",
      G: "Government",
      P: "Institutional",
      E: "Exempt",
    };
    if (codeMap[d]) return codeMap[d];
  }
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

// Best-effort cache write into the NCParcelRecord entity. Non-blocking — any
// failure (duplicate, schema mismatch, transient error) is swallowed so it
// never breaks a live scan.
async function cacheNCParcels(base44, rawFeatures) {
  if (!base44 || !rawFeatures?.length) return;
  for (const f of rawFeatures) {
    try {
      const p = f.properties || {};
      if (!p.parno) continue;
      const centroid = getCentroid(f.geometry);
      if (!centroid) continue;
      const acres = p.gisacres ? parseFloat(parseFloat(p.gisacres).toFixed(2)) : null;
      const mailingAddr = [p.mailadd, p.mcity, p.mstate, p.mzip].filter(Boolean).join(", ");
      const physAddr = [p.siteadd, p.scity, "NC"].filter(Boolean).join(", ");

      // Skip if we've already cached this parcel_id
      const existing = await base44.asServiceRole.entities.NCParcelRecord
        .filter({ parcel_id: String(p.parno) }, null, 1)
        .catch(() => []);
      if (existing?.length) continue;

      await base44.asServiceRole.entities.NCParcelRecord.create({
        state: "NC",
        county: p.scity || null,
        parcel_id: String(p.parno),
        owner_name: p.ownname || null,
        parcel_address: physAddr || null,
        mailing_address: mailingAddr || null,
        acreage: acres,
        zoning: ncUseToZoning(p.parusedesc),
        land_use: p.parusedesc || null,
        land_value: p.landval != null ? Number(p.landval) : null,
        improvement_value: p.improvval != null ? Number(p.improvval) : null,
        total_value: p.parval != null ? Number(p.parval) : null,
        sale_date: p.saledatetx || null,
        latitude: centroid.lat,
        longitude: centroid.lon,
        parcel_geometry: f.geometry || null,
        source: "NC-HAWK",
      });
    } catch (_) { /* swallow */ }
  }
}

async function searchNorthCarolina(lat, lon, radiusMiles, offset, base44) {
  // NC OneMap field names (FeatureServer/1 — polygons): parno, ownname, mailadd, mcity, mstate, mzip,
  // siteadd, scity, gisacres, parusedesc (NOT usedscrp), parval, landval, improvval, saledatetx
  const fields = "parno,ownname,mailadd,mcity,mstate,mzip,siteadd,scity,gisacres,parusedesc,parval,landval,improvval,saledatetx";
  const data = await queryArcGIS(ARCGIS_NC, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  // Fire-and-forget: cache the raw NC parcel features into the entity store.
  // Awaited so the writes happen during the request, but errors don't bubble up.
  if (base44) {
    cacheNCParcels(base44, data.features).catch(() => {});
  }

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.gisacres ? parseFloat(parseFloat(p.gisacres).toFixed(2)) : null;
    const zoning = ncUseToZoning(p.parusedesc);
    const mailingAddr = [p.mailadd, p.mcity, p.mstate, p.mzip].filter(Boolean).join(", ");
    const physAddr = [p.siteadd, p.scity, "NC"].filter(Boolean).join(", ");
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
      match_score: genericScore(acres || 0, distMeters, ncZoningBonus(p.parusedesc)),
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

function ctZoningBonus(zone, landuse) {
  const t = ((zone || "") + " " + (landuse || "")).toUpperCase();
  if (/VACANT|UNDEVELOP/.test(t)) return 10;
  if (/AGRI|FARM|FOREST|TIMBER/.test(t)) return 8;
  if (/INDUSTRIAL|MANUFACTUR|WAREHOUSE/.test(t)) return 5;
  if (/COMMERCIAL|BUSINESS|RETAIL/.test(t)) return 4;
  if (/RESIDENTIAL|SINGLE FAMILY|MULTI/.test(t)) return -8;
  if (/MUNICIPAL|GOVERNMENT|TAX EXEMPT/.test(t)) return -15;
  return 0;
}

function vtZoningBonus(descprop, cat) {
  const t = ((descprop || "") + " " + (cat || "")).toUpperCase();
  if (/VACANT|MISC/.test(t)) return 10;
  if (/FARM|AGRI|WOODLAND|FOREST|TIMBER/.test(t)) return 8;
  if (/INDUSTRIAL/.test(t)) return 5;
  if (/COMMERCIAL/.test(t)) return 4;
  if (/RESIDENTIAL|MOBILE HOME|CAMP/.test(t)) return -8;
  if (/UTILITY|MUNICIPAL|GOVERNMENT/.test(t)) return -15;
  return 0;
}

function cobbZoningBonus(luc, cls) {
  const t = ((luc || "") + " " + (cls || "")).toUpperCase();
  if (/VAC|UNIMPRO/.test(t)) return 10;
  if (/AGR|FARM|FOREST|TIMBER/.test(t)) return 8;
  if (/INDUS|MANU|WAREHOUSE/.test(t)) return 5;
  if (/COMM|BUSINESS|RETAIL|OFFICE/.test(t)) return 4;
  if (/RESIDEN|R-/.test(t)) return -8;
  if (/PUBLIC|GOVT|EXEMPT/.test(t)) return -15;
  return 0;
}

function tnZoningBonus(landuseDesc) {
  if (!landuseDesc) return 0;
  const t = landuseDesc.toUpperCase();
  if (/VACANT|UNIMPROVED/.test(t)) return 10;
  if (/AGRI|FARM|FOREST|GREENBELT/.test(t)) return 8;
  if (/INDUSTRIAL|WAREHOUSE/.test(t)) return 5;
  if (/COMMERCIAL|RETAIL|OFFICE/.test(t)) return 4;
  if (/RESIDENTIAL|DUPLEX|CONDO/.test(t)) return -8;
  if (/PUBLIC|EXEMPT|GOVERNMENT/.test(t)) return -15;
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

// ── County-level endpoints (TX, GA) ───────────────────────────────────────────
// These are county appraisal-district feeds with full owner/mailing/acres
// attribution. Each entry has its own bounding box so we only call the
// endpoint when the search point is inside the county.

const COUNTY_BBOX = {
  // Texas
  TX_TRAVIS:    { latMin: 30.02, latMax: 30.63, lonMin: -98.13, lonMax: -97.37 },
  TX_BEXAR:     { latMin: 29.18, latMax: 29.81, lonMin: -98.92, lonMax: -98.21 },
  TX_DFW:       { latMin: 32.50, latMax: 33.30, lonMin: -97.40, lonMax: -96.30 }, // Dallas/Collin/Denton/Kaufman/Rockwall (DCAD shared feed)
  // Georgia
  GA_FULTON:    { latMin: 33.45, latMax: 34.30, lonMin: -84.80, lonMax: -84.20 },
  GA_DEKALB:    { latMin: 33.62, latMax: 34.02, lonMin: -84.37, lonMax: -84.05 },
  // Tennessee
  TN_DAVIDSON: { latMin: 36.00, latMax: 36.40, lonMin: -87.05, lonMax: -86.50 },
  // Georgia (cont.)
  GA_COBB:      { latMin: 33.78, latMax: 34.18, lonMin: -84.78, lonMax: -84.30 },
};

function inCountyBox(lat, lon, key) {
  const b = COUNTY_BBOX[key];
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
}

// ── Travis County, TX (TCAD) ──────────────────────────────────────────────────
async function searchTravisTX(lat, lon, radiusMiles, offset) {
  const url = "https://taxmaps.traviscountytx.gov/arcgis/rest/services/Parcels/FeatureServer/0/query";
  const fields = "PROP_ID,py_owner_name,py_address,situs_address,situs_zip,GIS_acres,land_type_desc,legal_desc";
  const data = await queryArcGIS(url, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.GIS_acres ? parseFloat(parseFloat(p.GIS_acres).toFixed(2)) : null;
    const zoning = p.land_type_desc || "Unknown";
    const physAddr = p.situs_address ? `${p.situs_address}${p.situs_zip ? ", " + p.situs_zip : ""}, Travis County, TX` : null;
    return {
      site_name: physAddr || `Travis Parcel ${p.PROP_ID}`,
      owner_name: p.py_owner_name || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: String(p.PROP_ID || "—"),
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: p.py_address || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, /vacant|agricul|farm/i.test(zoning) ? 8 : 0),
      match_reason: `Travis County (TCAD) cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// ── Bexar County, TX (BCAD) ───────────────────────────────────────────────────
async function searchBexarTX(lat, lon, radiusMiles, offset) {
  const url = "https://maps.bexar.org/arcgis/rest/services/Parcels/MapServer/0/query";
  const fields = "PropID,Situs,Owner,AddrLn1,AddrLn2,AddrCity,AddrSt,Zip,Acres,LglAcres,State_cd,PropUse";
  const data = await queryArcGIS(url, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.Acres ? parseFloat(parseFloat(p.Acres).toFixed(2)) : (p.LglAcres ? parseFloat(parseFloat(p.LglAcres).toFixed(2)) : null);
    const zoning = p.State_cd || p.PropUse || "Unknown";
    const mailingAddr = [p.AddrLn1, p.AddrLn2, p.AddrCity, p.AddrSt, p.Zip].filter(Boolean).join(", ");
    const physAddr = p.Situs ? `${p.Situs}, Bexar County, TX` : null;
    return {
      site_name: physAddr || `Bexar Parcel ${p.PropID}`,
      owner_name: p.Owner || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: String(p.PropID || "—"),
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, 0),
      match_reason: `Bexar County (BCAD) cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// ── Dallas / Collin / Denton / Kaufman / Rockwall, TX (DCAD shared feed) ──────
async function searchDFW(lat, lon, radiusMiles, offset) {
  const url = "https://gis.dallascityhall.com/arcgis/rest/services/Basemap/DallasTaxParcels/FeatureServer/0/query";
  const fields = "ACCT,GIS_ACCT,SPTBCODE,PROP_CL,ST_NUM,ST_NAME,ST_TYPE,CITY,COUNTY,TAXPANAME1,TAXPAADD1,TAXPACITY,TAXPASTA,TAXPAZIP,AREA_FEET";
  const data = await queryArcGIS(url, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.AREA_FEET ? parseFloat((p.AREA_FEET / 43560).toFixed(2)) : null;
    const zoning = p.PROP_CL || `SPTB-${p.SPTBCODE || "?"}`;
    const physAddr = [p.ST_NUM, p.ST_NAME, p.ST_TYPE, p.CITY, p.COUNTY, "TX"].filter(Boolean).join(" ").replace(/\s+,/g, ",").trim();
    const mailingAddr = [p.TAXPAADD1, p.TAXPACITY, p.TAXPASTA, p.TAXPAZIP].filter(Boolean).join(", ");
    return {
      site_name: physAddr || `${p.COUNTY || "DFW"} Parcel ${p.ACCT}`,
      owner_name: p.TAXPANAME1 || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: String(p.ACCT || p.GIS_ACCT || "—"),
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, 0),
      match_reason: `${p.COUNTY || "DFW"} County (DCAD-shared) cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// Best-effort cache write into the GAParcelRecord entity. Non-blocking.
async function cacheGAParcel(base44, county, raw) {
  if (!base44 || !raw?.parcel_id) return;
  try {
    const existing = await base44.asServiceRole.entities.GAParcelRecord
      .filter({ parcel_id: String(raw.parcel_id) }, null, 1)
      .catch(() => []);
    if (existing?.length) return;
    await base44.asServiceRole.entities.GAParcelRecord.create({
      state: "GA",
      county: county || null,
      parcel_id: String(raw.parcel_id),
      owner_name: raw.owner_name || null,
      parcel_address: raw.parcel_address || null,
      mailing_address: raw.mailing_address || null,
      acreage: raw.acreage ?? null,
      zoning: raw.zoning || null,
      land_use: raw.land_use || null,
      land_value: raw.land_value ?? null,
      improvement_value: raw.improvement_value ?? null,
      total_value: raw.total_value ?? null,
      sale_date: raw.sale_date || null,
      latitude: raw.latitude ?? null,
      longitude: raw.longitude ?? null,
      parcel_geometry: raw.parcel_geometry || null,
      source: "GA-HAWK",
    });
  } catch (_) { /* swallow */ }
}

// ── Fulton County, GA ─────────────────────────────────────────────────────────
async function searchFultonGA(lat, lon, radiusMiles, offset, base44) {
  const url = "https://services5.arcgis.com/buITjRsK0rZsAXbQ/arcgis/rest/services/CurrentParcels/FeatureServer/0/query";
  const fields = "ParcelID,Address,Owner,OwnerAddr1,OwnerAddr2,LandAcres,LUCode,ClassCode";
  const data = await queryArcGIS(url, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  // Mirror raw features into GAParcelRecord (non-blocking)
  if (base44) {
    Promise.all(data.features.map((f) => {
      const p = f.properties || {};
      const c = getCentroid(f.geometry);
      if (!c || !p.ParcelID) return null;
      return cacheGAParcel(base44, "Fulton", {
        parcel_id: p.ParcelID,
        owner_name: p.Owner || null,
        parcel_address: p.Address ? `${p.Address}, Fulton County, GA` : null,
        mailing_address: [p.OwnerAddr1, p.OwnerAddr2].filter(Boolean).join(", ") || null,
        acreage: p.LandAcres ? parseFloat(parseFloat(p.LandAcres).toFixed(2)) : null,
        zoning: p.ClassCode || null,
        land_use: p.LUCode ? `LU-${p.LUCode}` : null,
        latitude: c.lat,
        longitude: c.lon,
        parcel_geometry: f.geometry || null,
      });
    })).catch(() => {});
  }

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.LandAcres ? parseFloat(parseFloat(p.LandAcres).toFixed(2)) : null;
    const zoning = p.LUCode ? `LU-${p.LUCode}${p.ClassCode ? "/" + p.ClassCode : ""}` : "Unknown";
    const mailingAddr = [p.OwnerAddr1, p.OwnerAddr2].filter(Boolean).join(", ");
    const physAddr = p.Address ? `${p.Address}, Fulton County, GA` : null;
    return {
      site_name: physAddr || `Fulton Parcel ${p.ParcelID}`,
      owner_name: p.Owner || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: p.ParcelID || "—",
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, 0),
      match_reason: `Fulton County (GA) cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// ── DeKalb County, GA ─────────────────────────────────────────────────────────
async function searchDeKalbGA(lat, lon, radiusMiles, offset, base44) {
  const url = "https://dcgis.dekalbcountyga.gov/mapping/rest/services/TaxParcels/FeatureServer/0/query";
  const fields = "PARCELID,SITEADDRESS,OWNERNME1,OWNERNME2,PSTLADDRESS,PSTLCITY,PSTLSTATE,PSTLZIP5,CLASSCD,CLASSDSCRP,CVTTXDSCRP";
  const data = await queryArcGIS(url, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  // Mirror raw features into GAParcelRecord (non-blocking)
  if (base44) {
    Promise.all(data.features.map((f) => {
      const p = f.properties || {};
      const c = getCentroid(f.geometry);
      if (!c || !p.PARCELID) return null;
      const sa = p.Shape__Area;
      return cacheGAParcel(base44, "DeKalb", {
        parcel_id: p.PARCELID,
        owner_name: [p.OWNERNME1, p.OWNERNME2].filter(Boolean).join(" / ") || null,
        parcel_address: p.SITEADDRESS ? `${p.SITEADDRESS}, DeKalb County, GA` : null,
        mailing_address: [p.PSTLADDRESS, p.PSTLCITY, p.PSTLSTATE, p.PSTLZIP5].filter(Boolean).join(", ") || null,
        acreage: sa ? parseFloat((sa / 4046.8564224).toFixed(2)) : null,
        zoning: p.CLASSDSCRP || p.CLASSCD || null,
        land_use: p.CVTTXDSCRP || null,
        latitude: c.lat,
        longitude: c.lon,
        parcel_geometry: f.geometry || null,
      });
    })).catch(() => {});
  }

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    // DeKalb has no Acres field; estimate from polygon Shape__Area (sq meters)
    const sqm = f.geometry?.coordinates ? null : null; // ArcGIS GeoJSON doesn't ship Shape__Area; rely on attribute Shape__Area if present
    const shapeArea = p.Shape__Area;
    const acres = shapeArea ? parseFloat((shapeArea / 4046.8564224).toFixed(2)) : null;
    const zoning = p.CLASSDSCRP || p.CLASSCD || "Unknown";
    const ownerName = [p.OWNERNME1, p.OWNERNME2].filter(Boolean).join(" / ");
    const mailingAddr = [p.PSTLADDRESS, p.PSTLCITY, p.PSTLSTATE, p.PSTLZIP5].filter(Boolean).join(", ");
    const physAddr = p.SITEADDRESS ? `${p.SITEADDRESS}, DeKalb County, GA` : null;
    return {
      site_name: physAddr || `DeKalb Parcel ${p.PARCELID}`,
      owner_name: ownerName || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: p.PARCELID || "—",
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, /vacant|agricul/i.test(zoning) ? 8 : 0),
      match_reason: `DeKalb County (GA) cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}
// ── Cobb County, GA ───────────────────────────────────────────────────────────
async function searchCobbGA(lat, lon, radiusMiles, offset, base44) {
  const url = "https://gis.cobbcounty.org/gisserver/rest/services/Public/taxassessorsdaily/MapServer/0/query";
  const fields = "PARID,ADRNO,ADRDIR,ADRSTR,ADRSUF,CITYNAME,STATECODE,ZIP1,OWN1,OADR1,OADR2,OCITY,OSTATE,OZIP1,LUC,CLASS,ACRES,LIVUNIT,RTOTAPR";
  const data = await queryArcGIS(url, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  // Mirror raw features into GAParcelRecord (non-blocking)
  if (base44) {
    Promise.all(data.features.map((f) => {
      const p = f.properties || {};
      const c = getCentroid(f.geometry);
      if (!c || !p.PARID) return null;
      const physAddr = [p.ADRNO, p.ADRDIR, p.ADRSTR, p.ADRSUF].filter(Boolean).join(" ");
      return cacheGAParcel(base44, "Cobb", {
        parcel_id: p.PARID,
        owner_name: p.OWN1 || null,
        parcel_address: physAddr ? `${physAddr}, ${p.CITYNAME || "Cobb County"}, GA` : null,
        mailing_address: [p.OADR1, p.OADR2, p.OCITY, p.OSTATE, p.OZIP1].filter(Boolean).join(", ") || null,
        acreage: p.ACRES ? parseFloat(parseFloat(p.ACRES).toFixed(2)) : null,
        zoning: p.CLASS || p.LUC || null,
        land_use: p.LUC ? `LUC-${p.LUC}` : null,
        total_value: p.RTOTAPR ?? null,
        latitude: c.lat,
        longitude: c.lon,
        parcel_geometry: f.geometry || null,
      });
    })).catch(() => {});
  }

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.ACRES ? parseFloat(parseFloat(p.ACRES).toFixed(2)) : null;
    const zoning = p.CLASS || (p.LUC ? `LUC-${p.LUC}` : "Unknown");
    const physAddr = [p.ADRNO, p.ADRDIR, p.ADRSTR, p.ADRSUF].filter(Boolean).join(" ");
    const fullAddr = physAddr ? `${physAddr}, ${p.CITYNAME || "Cobb County"}, GA` : null;
    const mailingAddr = [p.OADR1, p.OADR2, p.OCITY, p.OSTATE, p.OZIP1].filter(Boolean).join(", ");
    return {
      site_name: fullAddr || `Cobb Parcel ${p.PARID}`,
      owner_name: p.OWN1 || "Unknown Owner",
      parcel_address: fullAddr || "—",
      parcel_id: p.PARID || "—",
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, cobbZoningBonus(p.LUC, p.CLASS)),
      match_reason: `Cobb County (GA) cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// ── Cache helper for TN parcels ───────────────────────────────────────────────
async function cacheTNParcel(base44, county, raw) {
  if (!base44 || !raw?.parcel_id) return;
  try {
    const existing = await base44.asServiceRole.entities.TNParcelRecord
      .filter({ parcel_id: String(raw.parcel_id) }, null, 1)
      .catch(() => []);
    if (existing?.length) return;
    await base44.asServiceRole.entities.TNParcelRecord.create({
      state: "TN",
      county: county || null,
      parcel_id: String(raw.parcel_id),
      owner_name: raw.owner_name || null,
      parcel_address: raw.parcel_address || null,
      mailing_address: raw.mailing_address || null,
      acreage: raw.acreage ?? null,
      zoning: raw.zoning || null,
      land_use: raw.land_use || null,
      land_value: raw.land_value ?? null,
      improvement_value: raw.improvement_value ?? null,
      total_value: raw.total_value ?? null,
      sale_date: raw.sale_date || null,
      latitude: raw.latitude ?? null,
      longitude: raw.longitude ?? null,
      parcel_geometry: raw.parcel_geometry || null,
      source: "TN-HAWK",
    });
  } catch (_) { /* swallow */ }
}

// ── Davidson County (Nashville), TN ───────────────────────────────────────────
async function searchNashvilleTN(lat, lon, radiusMiles, offset, base44) {
  const url = "https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Parcels_view/FeatureServer/0/query";
  const fields = "ParcelID,APN,LocAddr,OwnerName,OwnerAddr,OwnerCity,OwnerState,OwnerZip,LandUseDesc,LandUseCode,Acreage,LandValue,ImprValue,TotalAprValue,Latitude,Longitude";
  const data = await queryArcGIS(url, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  // Mirror raw features into TNParcelRecord (non-blocking)
  if (base44) {
    Promise.all(data.features.map((f) => {
      const p = f.properties || {};
      const c = getCentroid(f.geometry);
      const id = p.ParcelID || p.APN;
      if (!id || (!c && !p.Latitude)) return null;
      const lat2 = p.Latitude ?? c?.lat ?? null;
      const lon2 = p.Longitude ?? c?.lon ?? null;
      return cacheTNParcel(base44, "Davidson", {
        parcel_id: id,
        owner_name: p.OwnerName || null,
        parcel_address: p.LocAddr ? `${p.LocAddr}, Nashville, TN` : null,
        mailing_address: [p.OwnerAddr, p.OwnerCity, p.OwnerState, p.OwnerZip].filter(Boolean).join(", ") || null,
        acreage: p.Acreage ? parseFloat(parseFloat(p.Acreage).toFixed(2)) : null,
        zoning: p.LandUseDesc || null,
        land_use: p.LandUseCode ? `LU-${p.LandUseCode}` : null,
        land_value: p.LandValue ?? null,
        improvement_value: p.ImprValue ?? null,
        total_value: p.TotalAprValue ?? null,
        latitude: lat2,
        longitude: lon2,
        parcel_geometry: f.geometry || null,
      });
    })).catch(() => {});
  }

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    const lat2 = p.Latitude ?? centroid?.lat ?? null;
    const lon2 = p.Longitude ?? centroid?.lon ?? null;
    if (lat2 == null || lon2 == null) return null;
    const distMeters = haversineMeters(lat, lon, lat2, lon2);
    const acres = p.Acreage ? parseFloat(parseFloat(p.Acreage).toFixed(2)) : null;
    const zoning = p.LandUseDesc || (p.LandUseCode ? `LU-${p.LandUseCode}` : "Unknown");
    const physAddr = p.LocAddr ? `${p.LocAddr}, Nashville, TN` : null;
    const mailingAddr = [p.OwnerAddr, p.OwnerCity, p.OwnerState, p.OwnerZip].filter(Boolean).join(", ");
    return {
      site_name: physAddr || `Davidson Parcel ${p.ParcelID || p.APN}`,
      owner_name: p.OwnerName || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: p.ParcelID || p.APN || "—",
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: lat2,
      longitude: lon2,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, tnZoningBonus(p.LandUseDesc)),
      match_reason: `Davidson County (Nashville, TN) cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// ── Connecticut (statewide CAMA) ──────────────────────────────────────────────
async function searchConnecticut(lat, lon, radiusMiles, offset) {
  const url = "https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0/query";
  const fields = "PARCELID,LOCATION,OWNER,MAILINGADDRESS,MAILINGCITY,MAILINGSTATE,MAILINGZIP,ACRES,ZONE,LANDUSE,TOWN,TOTALVALUE";
  const data = await queryArcGIS(url, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.ACRES ? parseFloat(parseFloat(p.ACRES).toFixed(2)) : null;
    const zoning = p.ZONE || p.LANDUSE || "Unknown";
    const physAddr = p.LOCATION ? `${p.LOCATION}, ${p.TOWN || ""}, CT`.replace(/, ,/, ",") : null;
    const mailingAddr = [p.MAILINGADDRESS, p.MAILINGCITY, p.MAILINGSTATE, p.MAILINGZIP].filter(Boolean).join(", ");
    return {
      site_name: physAddr || `CT Parcel ${p.PARCELID}`,
      owner_name: p.OWNER || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: p.PARCELID || "—",
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, ctZoningBonus(p.ZONE, p.LANDUSE)),
      match_reason: `Connecticut CAMA · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
    };
  }).filter(Boolean).sort((a, b) => b.match_score - a.match_score).slice(0, 5);

  return { candidates, ordinance: null };
}

// ── Vermont (statewide VCGI) ──────────────────────────────────────────────────
async function searchVermont(lat, lon, radiusMiles, offset) {
  const url = "https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0/query";
  const fields = "PARCID,SPAN,E911ADDR,OWNER1,OWNER2,ADDRGL1,ADDRGL2,CITYGL,STGL,ZIPGL,ACRESGL,GLYRBLT,CAT,DESCPROP,GLIST,TOWNNAME";
  const data = await queryArcGIS(url, lat, lon, radiusMiles, fields, offset);
  if (!data.features?.length) return { candidates: [], ordinance: null };

  const candidates = data.features.map((f) => {
    const p = f.properties;
    const centroid = getCentroid(f.geometry);
    if (!centroid) return null;
    const distMeters = haversineMeters(lat, lon, centroid.lat, centroid.lon);
    const acres = p.ACRESGL ? parseFloat(parseFloat(p.ACRESGL).toFixed(2)) : null;
    const zoning = p.DESCPROP || p.CAT || "Unknown";
    const physAddr = p.E911ADDR ? `${p.E911ADDR}, ${p.TOWNNAME || ""}, VT`.replace(/, ,/, ",") : null;
    const ownerName = [p.OWNER1, p.OWNER2].filter(Boolean).join(" / ");
    const mailingAddr = [p.ADDRGL1, p.ADDRGL2, p.CITYGL, p.STGL, p.ZIPGL].filter(Boolean).join(", ");
    return {
      site_name: physAddr || `VT Parcel ${p.PARCID || p.SPAN}`,
      owner_name: ownerName || "Unknown Owner",
      parcel_address: physAddr || "—",
      parcel_id: p.PARCID || p.SPAN || "—",
      parcel_size_acres: acres,
      zoning,
      owner_mailing_address: mailingAddr || null,
      latitude: centroid.lat,
      longitude: centroid.lon,
      parcel_geometry: f.geometry || null,
      fema_risk: null, phone: null, email: null,
      match_score: genericScore(acres || 0, distMeters, vtZoningBonus(p.DESCPROP, p.CAT)),
      match_reason: `Vermont VCGI cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
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

// ── Regrid daily quotas ───────────────────────────────────────────────────────
// Platform-wide: 20 Regrid parcel pulls per UTC day
// Per-user: 3/day for free trial, 5/day for paid subscribers
const REGRID_GLOBAL_DAILY_LIMIT = 20;
const REGRID_USER_DAILY_LIMITS = {
  free_trial: 3,
  subscriber: 5,
};

const PAID_TIERS = ['hawk_site', 'hawkeyes', 'hawk_sight', 'hawkeye_20', 'hawkeye_apex'];

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

async function checkAndIncrementRegridQuota(base44, userEmail, isPaid) {
  const date = todayUTC();
  const userLimit = isPaid ? REGRID_USER_DAILY_LIMITS.subscriber : REGRID_USER_DAILY_LIMITS.free_trial;

  // Global counter
  const globalRecords = await base44.asServiceRole.entities.RegridUsage.filter({ date, scope: 'global' });
  const globalRecord = globalRecords[0];
  const globalCount = globalRecord?.count || 0;

  if (globalCount >= REGRID_GLOBAL_DAILY_LIMIT) {
    return { allowed: false, reason: 'global', globalCount, userCount: 0, userLimit };
  }

  // Per-user counter
  const userRecords = await base44.asServiceRole.entities.RegridUsage.filter({ date, scope: 'user', user_email: userEmail });
  const userRecord = userRecords[0];
  const userCount = userRecord?.count || 0;

  if (userCount >= userLimit) {
    return { allowed: false, reason: 'user', globalCount, userCount, userLimit };
  }

  // Increment both counters
  if (globalRecord) {
    await base44.asServiceRole.entities.RegridUsage.update(globalRecord.id, { count: globalCount + 1 });
  } else {
    await base44.asServiceRole.entities.RegridUsage.create({ date, scope: 'global', count: 1, user_email: '' });
  }

  if (userRecord) {
    await base44.asServiceRole.entities.RegridUsage.update(userRecord.id, { count: userCount + 1 });
  } else {
    await base44.asServiceRole.entities.RegridUsage.create({ date, scope: 'user', user_email: userEmail, count: 1 });
  }

  return { allowed: true, globalCount: globalCount + 1, userCount: userCount + 1, userLimit };
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

    // ── Default path: free local-GIS (no Regrid token cost) ─────────────────
    // Try state-level endpoints first, then county-level (TX, GA). Only fall
    // through to Regrid if (a) no local source is configured for this point,
    // (b) the local endpoint errors, or (c) it returns zero candidates.
    const localSource =
      // State-wide feeds
      inState(lat, lon, "FL")           ? { code: "FL",        fn: searchFlorida } :
      inState(lat, lon, "NC")           ? { code: "NC",        fn: searchNorthCarolina } :
      inState(lat, lon, "MA")           ? { code: "MA",        fn: searchMassachusetts } :
      inState(lat, lon, "MD")           ? { code: "MD",        fn: searchMaryland } :
      inState(lat, lon, "CT")           ? { code: "CT",        fn: searchConnecticut } :
      inState(lat, lon, "VT")           ? { code: "VT",        fn: searchVermont } :
      // County-level feeds (TX)
      inCountyBox(lat, lon, "TX_TRAVIS") ? { code: "TX-TRAVIS", fn: searchTravisTX } :
      inCountyBox(lat, lon, "TX_BEXAR")  ? { code: "TX-BEXAR",  fn: searchBexarTX } :
      inCountyBox(lat, lon, "TX_DFW")    ? { code: "TX-DFW",    fn: searchDFW } :
      // County-level feeds (TN)
      inCountyBox(lat, lon, "TN_DAVIDSON") ? { code: "TN-DAVIDSON", fn: searchNashvilleTN } :
      // County-level feeds (GA)
      inCountyBox(lat, lon, "GA_FULTON") ? { code: "GA-FULTON", fn: searchFultonGA } :
      inCountyBox(lat, lon, "GA_DEKALB") ? { code: "GA-DEKALB", fn: searchDeKalbGA } :
      inCountyBox(lat, lon, "GA_COBB")   ? { code: "GA-COBB",   fn: searchCobbGA } :
      null;

    if (localSource) {
      try {
        console.log(`${localSource.code} local-GIS scan: user=${user.email} lat=${lat} lon=${lon}`);
        // NC handler accepts an extra base44 arg so it can mirror parcels into NCParcelRecord.
        // Other handlers ignore the extra arg.
        const localResult = await localSource.fn(lat, lon, radiusMiles, offset || 0, base44);
        if (localResult?.candidates?.length) {
          return Response.json({ ...localResult, source: `local-gis-${localSource.code.toLowerCase()}` });
        }
        console.warn(`${localSource.code} local-GIS returned 0 candidates — falling back to Regrid`);
      } catch (e) {
        console.warn(`${localSource.code} local-GIS failed (${e.message}) — falling back to Regrid`);
      }
    }

    // ── Fallback layer 1: hawk_parcels Supabase cache — DISABLED ──────────────
    // The scip_parcels table is empty and the rows in `parcels` lack centroid/geom,
    // so this layer always returned 0 hits and just added two HTTP roundtrips
    // before every Regrid call. Re-enable once the cache is populated with geometry.

    // ── Fallback layer 2: Supabase/Regrid (token-based) ──────────────────────
    // Check Regrid in-memory cache first — cached results don't count against quota
    const cached = getCached(lat, lon);
    if (cached) {
      console.log(`Regrid cache HIT: user=${user.email} lat=${lat} lon=${lon}`);
      return Response.json(cached);
    }

    // Enforce daily Regrid quotas (global 20/day, free 3/day, paid 5/day)
    const isPaid = PAID_TIERS.includes(tier);
    const quota = await checkAndIncrementRegridQuota(base44, user.email, isPaid);
    if (!quota.allowed) {
      if (quota.reason === 'global') {
        console.warn(`Regrid global daily limit reached: user=${user.email}`);
        return Response.json({
          error: `Daily Regrid limit reached for the platform (${REGRID_GLOBAL_DAILY_LIMIT} parcel pulls/day). Please try again tomorrow.`,
        }, { status: 429 });
      }
      console.warn(`Regrid user daily limit reached: user=${user.email} (${quota.userCount}/${quota.userLimit})`);
      return Response.json({
        error: `You've reached your daily Regrid parcel limit (${quota.userLimit}/day). ${isPaid ? 'Limit resets at midnight UTC.' : 'Subscribe for higher limits.'}`,
      }, { status: 429 });
    }

    console.log(`Regrid fallback: user=${user.email} lat=${lat} lon=${lon} quota=${quota.userCount}/${quota.userLimit} global=${quota.globalCount}/${REGRID_GLOBAL_DAILY_LIMIT}`);
    let data;
    try {
      const res = await fetch(SUPABASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ lat, lon, radius_miles: radiusMiles, offset: offset || 0 }),
      });
      data = await res.json();
    } catch (e) {
      console.error(`Regrid network error: ${e.message}`);
      return Response.json({
        error: "Regrid parcel service is temporarily unavailable. Local GIS coverage is available for FL, NC, MA, and MD — try a location in those states, or try again later.",
      }, { status: 502 });
    }

    // If Regrid token expired or returned an error, give a clear message
    if (data?.error) {
      const msg = String(data.error).toLowerCase();
      if (msg.includes("token") || msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("expired")) {
        console.error(`Regrid token issue: ${data.error}`);
        return Response.json({
          error: "Regrid parcel data is currently unavailable (auth issue). Local GIS coverage is available for FL, NC, MA, and MD — please try a location in those states.",
        }, { status: 502 });
      }
    }

    // Cache successful results to avoid repeat Regrid calls for the same area
    if (data && !data.error) {
      setCache(lat, lon, data);
      console.log(`Regrid result cached for lat=${lat} lon=${lon}`);
    }
    return Response.json({ ...data, source: data?.error ? "regrid-error" : "regrid" });

  } catch (error) {
    console.error('siteSearch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});