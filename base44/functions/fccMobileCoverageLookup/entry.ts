/**
 * fccMobileCoverageLookup — FCC Broadband Data Collection mobile coverage lookup.
 *
 * Companion to fccFiberLookup, but for mobile wireless coverage (5G-NR / 4G LTE /
 * 3G / Voice). Fiber has aggregated block-group polygons; mobile does NOT — the FCC
 * publishes raw propagation-modeled coverage as H3 res-9 hexagon polygons, one record
 * per provider + speed tier. So this answers "is <tech> coverage present at this point,
 * at what min advertised speeds, and how many overlapping provider records cover it."
 *
 * Input:  { lat: Number, lon: Number, technology?: "5g" | "lte" | "3g" | "voice",
 *           includeGeometry?: Boolean }
 *         technology defaults to "5g".
 *
 * Output: { found, covered, technology, geo, hexIds, records, speeds, speedTiers,
 *           environments, geometry?, source }
 *
 * Public FCC FeatureServer — no auth token required (queries the same BDC data the
 * National Broadband Map uses). In-memory LRU cache (15 min TTL, 500 entries).
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

// FCC Mobile Broadband FeatureServer (BDC). Layers are per-technology.
const FCC_MOBILE_BASE =
  "https://services6.arcgis.com/clPWQMwZfdWn4MQZ/arcgis/rest/services/" +
  "FCC_Mobile_Broadband/FeatureServer";

// technology key -> { layerId, label }
const TECH = {
  "5g":    { layerId: 194, label: "5G-NR" },
  "lte":   { layerId: 195, label: "4G LTE" },
  "3g":    { layerId: 196, label: "3G" },
  "voice": { layerId: 197, label: "Mobile Voice" },
};

// BDC mobile environment codes (returned raw + best-effort label).
const ENV_LABEL = { 1: "in-vehicle mobile", 2: "outdoor stationary" };

const OUT_FIELDS = ["technology", "mindown", "minup", "environmnt", "h3_res9_id"];

// ---------- LRU cache, keyed by `${layerId}:${lat},${lon}` ----------
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

// ---------- single-shot FCC point query ----------
async function queryMobileLayerByPoint({ layerId, lat, lon, includeGeometry }) {
  const geometry = encodeURIComponent(
    JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
  );
  const url =
    `${FCC_MOBILE_BASE}/${layerId}/query` +
    `?geometry=${geometry}` +
    `&geometryType=esriGeometryPoint` +
    `&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=${encodeURIComponent(OUT_FIELDS.join(","))}` +
    `&returnGeometry=${includeGeometry ? "true" : "false"}` +
    `&outSR=4326` +
    `&f=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`FCC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`FCC API: ${json.error.message}`);
  return json.features || [];
}

// ---------- envelope builder ----------
function buildEnvelope({ features, techKey, cached = false, includeGeometry }) {
  const meta = TECH[techKey];
  const attrs = features.map((f) => f.attributes || {});

  const downs = attrs.map((a) => a.mindown).filter((v) => Number.isFinite(v));
  const ups = attrs.map((a) => a.minup).filter((v) => Number.isFinite(v));

  // Distinct min-advertised speed tiers (down/up pairs).
  const tierSet = new Map();
  for (const a of attrs) {
    if (Number.isFinite(a.mindown) || Number.isFinite(a.minup)) {
      tierSet.set(`${a.mindown}/${a.minup}`, {
        minDown: a.mindown ?? null,
        minUp: a.minup ?? null,
      });
    }
  }
  const speedTiers = [...tierSet.values()].sort(
    (x, y) => (y.minDown || 0) - (x.minDown || 0),
  );

  const hexIds = [...new Set(attrs.map((a) => a.h3_res9_id).filter(Boolean))];
  const environments = [
    ...new Set(attrs.map((a) => a.environmnt).filter((v) => v != null)),
  ].map((code) => ({ code, label: ENV_LABEL[code] || null }));

  const env = {
    found: features.length > 0,
    covered: features.length > 0,
    technology: { key: techKey, label: meta.label, layerId: meta.layerId },
    cached,
    geo: { level: "h3_res9", hexIds },
    records: features.length, // overlapping provider/speed-tier polygons at this point
    speeds: {
      maxDown: downs.length ? Math.max(...downs) : null,
      maxUp: ups.length ? Math.max(...ups) : null,
    },
    speedTiers,
    environments,
    source: {
      dataset: "FCC Broadband Data Collection — Mobile Broadband (propagation-modeled)",
      service: "FCC_Mobile_Broadband FeatureServer",
      layerId: meta.layerId,
      note:
        "Coverage is modeled (outdoor / in-vehicle), not a guarantee of on-the-ground service. " +
        "No indoor coverage. Provider identity is not exposed in this layer; 'records' counts " +
        "overlapping coverage polygons.",
    },
  };

  if (includeGeometry) {
    env.geometry = features.map((f) => f.geometry).filter(Boolean);
  }
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
    const includeGeometry = body.includeGeometry === true;
    const techKey = TECH[body.technology] ? body.technology : "5g";

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json(
        { found: false, error: "lat and lon must be numbers" },
        { status: 400 },
      );
    }

    const meta = TECH[techKey];
    const key = `${meta.layerId}:${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (!includeGeometry) {
      const hit = cacheGet(key);
      if (hit) return Response.json({ ...hit, cached: true });
    }

    const features = await queryMobileLayerByPoint({
      layerId: meta.layerId,
      lat,
      lon,
      includeGeometry,
    });

    const env = buildEnvelope({ features, techKey, cached: false, includeGeometry });
    if (!includeGeometry) cacheSet(key, env);
    return Response.json(env);
  } catch (err) {
    console.error("fccMobileCoverageLookup error:", err);
    return Response.json(
      { found: false, error: err.message || String(err) },
      { status: 502 },
    );
  }
});
