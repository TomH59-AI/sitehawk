/**
 * talonfitInputs — builds the TalonFit-AI-1.0 solver input from live sources.
 *
 * Sources (fixed vendors): Realie for parcel geometry/ownership/zoning, the
 * SiteHawk zoning-lookup service (ordinance library) for tower ordinance rules,
 * OpenStreetMap Overpass for water features and mapped structures, OpenCellID /
 * Unwired Labs for existing towers. Nothing is invented — anything a source does
 * not return is reported with data_status "missing" so the solver returns VERIFY.
 */

const REALIE_LOCATION = "https://app.realie.ai/api/public/property/location/";
const ZONING_LOOKUP_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/zoning-lookup";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NWI_QUERY_URL = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query";
const FL_CADASTRAL_URL = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";

import { polygonCheck } from "./talonfitAiSolver.ts";

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFloridaCadastralParcel(lat: number, lon: number) {
  // The FDOR layer supplied in the TalonFit prototype is a reliable parcel
  // fallback for Florida. It never supplies or guesses zoning/ordinance rules.
  if (lat < 24.3 || lat > 31.1 || lon < -87.8 || lon > -79.7) return null;
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "PARCEL_ID,OWN_NAME,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,LND_SQFOOT,DOR_UC",
    returnGeometry: "true",
    f: "geojson",
  });
  try {
    const response = await fetchWithTimeout(`${FL_CADASTRAL_URL}?${params}`, {}, 4500);
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    const feature = data?.features?.[0];
    if (!feature) return null;
    const p = feature.properties || {};
    return {
      parcel_id: String(p.PARCEL_ID || "unknown"),
      address: [p.PHY_ADDR1, p.PHY_CITY, "FL", p.PHY_ZIPCD].filter(Boolean).join(", ") || null,
      jurisdiction: [p.PHY_CITY, "FL"].filter(Boolean).join(", ") || null,
      zoning_classification: null,
      standardized_zoning_type: null,
      standardized_zoning_subtype: null,
      geometry: feature.geometry || null,
      owner: p.OWN_NAME || null,
      acreage: Number.isFinite(Number(p.LND_SQFOOT)) ? Number((Number(p.LND_SQFOOT) / 43560).toFixed(2)) : null,
      county: null,
      state: "FL",
      parcel_source: "Florida DOR cadastral fallback",
    };
  } catch {
    return null;
  }
}

export async function fetchParcel(lat: number, lon: number, apiKey: string) {
  // Start the state parcel fallback in parallel. When Realie is slow or has no
  // match, Florida users should not wait for three serial retries before the
  // exact-coordinate cadastral lookup even begins.
  const stateFallback = fetchFloridaCadastralParcel(lat, lon);
  for (const radius of ["0.15", "0.5", "1"]) {
    const url = `${REALIE_LOCATION}?${new URLSearchParams({
      latitude: String(lat), longitude: String(lon), radius, limit: "20",
      includeUnassignedAddress: "true",
    })}`;
    try {
      const r = await fetchWithTimeout(url, { headers: { Authorization: apiKey } }, 2500);
      if (!r.ok) { if (r.status !== 404) console.error("Realie HTTP", r.status); continue; }
      const data = await r.json().catch(() => null);
      const list = Array.isArray(data?.properties) ? data.properties
        : Array.isArray(data?.data) ? data.data
        : data?.property ? [data.property] : [];
      if (!list.length) continue;
      const p = list.find((c: any) => c?.geometry && polygonCheck(c.geometry, { latitude: lat, longitude: lon })?.inside) || list[0];
      return {
        parcel_id: String(p.parcelId || p.parcelNumber || p.apn || "unknown"),
        address: p.address || p.fullAddress || p.situsAddress || null,
        jurisdiction: [p.city || p.situsCity || p.county, p.state].filter(Boolean).join(", ") || null,
        zoning_classification: p.zoningCode || p.zoning || null,
        standardized_zoning_type: p.zoningType || p.standardizedZoningType || null,
        standardized_zoning_subtype: p.zoningSubtype || p.standardizedZoningSubtype || null,
        geometry: p.geometry || null,
        owner: p.ownerName || p.owner || null,
        acreage: p.lotSizeAcres ?? p.acres ?? p.acreage ?? null,
        county: p.county || null,
        state: p.state || null,
        parcel_source: "Realie",
      };
    } catch (error) {
      console.warn(`Realie radius ${radius} unavailable:`, error?.message || String(error));
    }
  }
  return await stateFallback;
}

/** Ordinance rules in solver shape. Absent values stay null with status "missing". */
export async function fetchOrdinanceRules(lat: number, lon: number) {
  let o: any = null, meta: any = {};
  const r = await fetchWithTimeout(`${ZONING_LOOKUP_URL}?lat=${lat}&lon=${lon}`, {}, 6000);
  if (r.ok) {
    const d = await r.json().catch(() => null);
    meta = d || {};
    o = d?.ordinance || null;
  } else {
    console.error("zoning-lookup HTTP", r.status);
  }

  const status = (v: any) => (v == null ? "missing" : "extracted");
  const fallZoneFt = o?.fall_zone_ft ?? null;
  const setbackFt = o?.setback_ft ?? null;
  const fallZonePct = o?.fall_zone_pct_of_height ?? null;
  const fixedClearanceFt = [fallZoneFt, setbackFt].filter((v) => Number.isFinite(Number(v))).reduce((m, v) => Math.max(m, Number(v)), 0);
  const heightMultiplier = Number.isFinite(Number(fallZonePct)) ? Number(fallZonePct) / 100 : 0;
  const sourceUrl = o?.source_url || null;
  const citation = o?.ldc_display || o?.section_ref || null;
  const heightCap = o?.max_tower_height_ft ?? o?.height_limit_ft ?? null;
  const ordinanceVerified = Boolean(sourceUrl && citation && heightCap != null && (fallZoneFt != null || setbackFt != null || fallZonePct != null));

  return {
    maximum_tower_height_ft: heightCap,
    property_line_rule: {
      rule_name: fallZoneFt != null || fallZonePct != null ? "Fall zone / property line clearance" : "Property line setback",
      fixed_distance_ft: fixedClearanceFt,
      height_multiplier: heightMultiplier,
      measured_from: "property line",
      citation,
      data_status: fallZoneFt == null && setbackFt == null && fallZonePct == null ? "missing" : "extracted",
    },
    additional_height_dependent_rules: [],
    pe_policy: {
      reduction_allowed: o?.pe_fall_zone_allowed ?? null,
      standard_multiplier: heightMultiplier,
      pe_multiplier: o?.pe_fall_zone_multiplier ?? heightMultiplier,
      pe_letter_required: true,
      citation: o?.ldc_display || o?.section_ref || null,
    },
    tower_separation: {
      required_distance_ft: o?.tower_separation_ft ?? null,
      citation: o?.ldc_display || null,
      data_status: status(o?.tower_separation_ft),
    },
    structure_separation: {
      required_distance_ft: o?.residential_separation_ft ?? null,
      citation: o?.ldc_display || null,
      data_status: status(o?.residential_separation_ft),
    },
    approval_path: o?.permit_type || null,
    ordinance_source_url: sourceUrl,
    ordinance_section: citation,
    ordinance_data_verified: ordinanceVerified,
    _jurisdiction: o?.jurisdiction || [meta.city || meta.county, meta.state].filter(Boolean).join(", ") || null,
    _summary: o?.ordinance_summary || null,
  };
}

async function overpass(query: string) {
  const r = await fetchWithTimeout(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  }, 7000);
  if (!r.ok) { console.error("Overpass HTTP", r.status); return null; }
  return await r.json().catch(() => null);
}

function waysToPolygons(data: any, props: (el: any) => any) {
  const features: any[] = [];
  for (const el of data?.elements || []) {
    if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 4) continue;
    const coords = el.geometry.map((g: any) => [g.lon, g.lat]);
    const first = coords[0], last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
    features.push({ type: "Feature", properties: props(el), geometry: { type: "Polygon", coordinates: [coords] } });
  }
  return features;
}

/** Mapped water features (must be dry) — OSM Overpass polygons. */
export async function fetchWaterFeatures(lat: number, lon: number, radiusM = 800) {
  const data = await overpass(`[out:json][timeout:25];
    (
      way(around:${radiusM},${lat},${lon})["natural"="water"];
      way(around:${radiusM},${lat},${lon})["water"];
      way(around:${radiusM},${lat},${lon})["waterway"="riverbank"];
      way(around:${radiusM},${lat},${lon})["landuse"="reservoir"];
    );
    out geom;`);
  return {
    available: !!data,
    collection: { type: "FeatureCollection", features: data ? waysToPolygons(data, (el) => ({ osm_id: el.id, kind: "water" })) : [] },
  };
}

/** Official USFWS National Wetlands Inventory polygons near the parcel. */
export async function fetchWetlandFeatures(lat: number, lon: number, radiusM = 1200) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const envelope = `${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}`;
  const params = new URLSearchParams({
    where: "1=1", geometry: envelope, geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: "WETLAND_TYPE,ATTRIBUTE,ACRES", returnGeometry: "true", f: "geojson",
  });
  const r = await fetchWithTimeout(`${NWI_QUERY_URL}?${params}`, {}, 6500);
  if (!r.ok) { console.error("NWI HTTP", r.status); return { available: false, collection: { type: "FeatureCollection", features: [] } }; }
  const data = await r.json().catch(() => null);
  const features = Array.isArray(data?.features) ? data.features.map((f: any) => ({
    ...f,
    properties: { ...(f.properties || {}), kind: "wetland", source: "USFWS NWI" },
  })) : [];
  return { available: true, collection: { type: "FeatureCollection", features } };
}

/** Mapped building structures — OSM Overpass footprints. */
export async function fetchMappedStructures(lat: number, lon: number, radiusM = 800) {
  const data = await overpass(`[out:json][timeout:25];
    way(around:${radiusM},${lat},${lon})["building"];
    out geom;`);
  if (!data) return { available: false, structures: [] };
  const residentialTags = new Set(["house", "residential", "apartments", "detached", "semidetached_house", "bungalow", "dormitory", "terrace"]);
  return {
    available: true,
    structures: waysToPolygons(data, (el) => ({ osm_id: el.id })).map((f, i) => ({
      geometry: f.geometry,
      residential: residentialTags.has(String((data.elements?.[i]?.tags || {}).building || "")) || null,
      source: "OpenStreetMap",
    })),
  };
}

/** Existing towers from OpenCellID / Unwired Labs, within a bbox around the point. */
export async function fetchExistingTowers(lat: number, lon: number, token: string, radiusKm = 3) {
  if (!token) return { available: false, towers: [] };
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const url = `https://opencellid.org/cell/getInArea?key=${encodeURIComponent(token)}`
    + `&BBOX=${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon}&format=json&limit=200`;
  const r = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 6000);
  const text = await r.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { return { available: false, towers: [] }; }
  if (data?.error) return { available: false, towers: [] };
  return {
    available: true,
    towers: (data?.cells || [])
      .map((c: any) => ({ latitude: parseFloat(c.lat), longitude: parseFloat(c.lon), owner: null, source: "OpenCellID / Unwired Labs" }))
      .filter((t: any) => Number.isFinite(t.latitude) && Number.isFinite(t.longitude)),
  };
}