/**
 * fccFiberLookup — unified FCC Broadband Data Collection (Dec 2024) lookup.
 *
 * Input:  { lat: Number, lon: Number, resolution?: "blockGroup" | "county" }
 *         resolution defaults to "blockGroup" (most precise).
 *
 * Fallback chain:
 *   blockGroup → county → state
 *   county     → state
 *
 * Output: { found, resolution, cached, fellBackFrom?, geo, population, bsls, fiber, providers, source }
 *
 * Public FCC FeatureServer — no auth required. In-memory LRU cache (15 min TTL, 500 entries).
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const FCC_BASE =
  "https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/" +
  "FCC_Broadband_Data_Collection_December_2024_View/FeatureServer";

const LAYER = { STATE: 0, COUNTY: 1, BLOCK_GROUP: 3 };

const BASE_FIELDS = [
  "GEOID",
  "StateName",
  "StateAbbr",
  "TotalPop",
  "TotalBSLs",
  "ServedBSLs",
  "UnderservedBSLs",
  "UnservedBSLs",
  "ServedBSLsFiber",
  "UnderservedBSLsFiber",
  "UnservedBSLsFiber",
  "ServedBSLsFiber_6monthPrevious",
  "ServedBSLsFiber_12monthPrevious",
  "UniqueProviders",
  "UniqueProvidersFiber",
  "UniqueProvidersCable",
  "UniqueProvidersCopper",
  "UniqueProvidersLTFW",
  "UniqueProvidersLBRTFW",
];

// Per-layer field lists. Block Group has CountyGEOID/StateGEOID + CountyName;
// County has CountyName; State has neither.
const OUT_FIELDS_BY_LAYER = {
  0: BASE_FIELDS, // state
  1: [...BASE_FIELDS, "CountyName"], // county
  3: [...BASE_FIELDS, "CountyGEOID", "StateGEOID", "CountyName"], // block group
};

// ---------- math helpers ----------
const pct = (num, den) =>
  !den || den <= 0 ? null : Math.round((num / den) * 1000) / 10;
const per1k = (num, den) =>
  !den || den <= 0 ? null : Math.round((num / den) * 10000) / 10;

// ---------- LRU cache, keyed by `${layerId}:${GEOID}` ----------
const CACHE_MAX = 500;
const CACHE_TTL_MS = 15 * 60 * 1000;
const _cache = new Map();

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  _cache.delete(key);
  _cache.set(key, hit);
  return hit.v;
}
function cacheSet(key, value) {
  if (_cache.size >= CACHE_MAX) {
    const oldest = _cache.keys().next().value;
    if (oldest !== undefined) _cache.delete(oldest);
  }
  _cache.set(key, { v: value, t: Date.now() });
}

// ---------- single-shot FCC query ----------
async function queryFccLayerByPoint({ layerId, lat, lon }) {
  const geometry = encodeURIComponent(
    JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
  );
  const url =
    `${FCC_BASE}/${layerId}/query` +
    `?geometry=${geometry}` +
    `&geometryType=esriGeometryPoint` +
    `&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=${encodeURIComponent((OUT_FIELDS_BY_LAYER[layerId] || BASE_FIELDS).join(","))}` +
    `&returnGeometry=false` +
    `&outSR=4326` +
    `&f=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`FCC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`FCC API: ${json.error.message}`);
  return json.features && json.features[0] ? json.features[0].attributes : null;
}

// ---------- envelope builder ----------
function buildEnvelope({ a, resolution, cached = false }) {
  const fiberServedPct = pct(a.ServedBSLsFiber, a.TotalBSLs);
  const fiberUnderservedPct = pct(a.UnderservedBSLsFiber, a.TotalBSLs);
  const fiberUnservedPct = pct(a.UnservedBSLsFiber, a.TotalBSLs);
  const growth12moAbs =
    (a.ServedBSLsFiber || 0) - (a.ServedBSLsFiber_12monthPrevious || 0);
  const growth6moAbs =
    (a.ServedBSLsFiber || 0) - (a.ServedBSLsFiber_6monthPrevious || 0);
  const growth12moPct = pct(growth12moAbs, a.ServedBSLsFiber_12monthPrevious || 0);
  const fiberProvidersPer1kBSL = per1k(a.UniqueProvidersFiber, a.TotalBSLs);
  const layerId = { blockGroup: 3, county: 1, state: 0 }[resolution];

  return {
    found: true,
    resolution,
    cached,
    geo: {
      level: resolution,
      geoid: a.GEOID,
      countyGeoid: a.CountyGEOID ?? null,
      stateGeoid: a.StateGEOID ?? null,
      countyName: a.CountyName ?? null,
      stateName: a.StateName ?? null,
      stateAbbr: a.StateAbbr ?? null,
    },
    population: a.TotalPop ?? null,
    bsls: {
      total: a.TotalBSLs ?? null,
      served: a.ServedBSLs ?? null,
      underserved: a.UnderservedBSLs ?? null,
      unserved: a.UnservedBSLs ?? null,
    },
    fiber: {
      served: a.ServedBSLsFiber ?? null,
      underserved: a.UnderservedBSLsFiber ?? null,
      unserved: a.UnservedBSLsFiber ?? null,
      served6moPrev: a.ServedBSLsFiber_6monthPrevious ?? null,
      served12moPrev: a.ServedBSLsFiber_12monthPrevious ?? null,
      servedPct: fiberServedPct,
      underservedPct: fiberUnderservedPct,
      unservedPct: fiberUnservedPct,
      growth6moAbs,
      growth12moAbs,
      growth12moPct,
    },
    providers: {
      total: a.UniqueProviders ?? null,
      fiber: a.UniqueProvidersFiber ?? null,
      cable: a.UniqueProvidersCable ?? null,
      copper: a.UniqueProvidersCopper ?? null,
      licensedFW: a.UniqueProvidersLTFW ?? null,
      licensedByRuleFW: a.UniqueProvidersLBRTFW ?? null,
      fiberPer1kBSL: fiberProvidersPer1kBSL,
    },
    source: {
      dataset: "FCC Broadband Data Collection (Dec 2024 view)",
      itemId: "e1343efcefc344709057260ee57290a0",
      layerId,
    },
  };
}

async function lookupAtLayer({ layerId, lat, lon, resolution }) {
  const a = await queryFccLayerByPoint({ layerId, lat, lon });
  if (!a) return null;
  const key = `${layerId}:${a.GEOID}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  const env = buildEnvelope({ a, resolution, cached: false });
  cacheSet(key, env);
  return env;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ found: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const resolution = body.resolution === "county" ? "county" : "blockGroup";

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json(
        { found: false, error: "lat and lon must be numbers" },
        { status: 400 },
      );
    }

    // Build fallback chain based on requested resolution
    const chain = resolution === "blockGroup"
      ? [
          { layerId: LAYER.BLOCK_GROUP, resolution: "blockGroup" },
          { layerId: LAYER.COUNTY, resolution: "county" },
          { layerId: LAYER.STATE, resolution: "state" },
        ]
      : [
          { layerId: LAYER.COUNTY, resolution: "county" },
          { layerId: LAYER.STATE, resolution: "state" },
        ];

    const requestedResolution = chain[0].resolution;
    for (const step of chain) {
      const result = await lookupAtLayer({ ...step, lat, lon });
      if (result) {
        if (step.resolution !== requestedResolution) {
          return Response.json({ ...result, fellBackFrom: requestedResolution });
        }
        return Response.json(result);
      }
    }

    return Response.json({
      found: false,
      reason: "no_polygon_at_point",
      lat,
      lon,
    });
  } catch (err) {
    console.error("fccFiberLookup error:", err);
    return Response.json(
      { found: false, error: err.message || String(err) },
      { status: 502 },
    );
  }
});