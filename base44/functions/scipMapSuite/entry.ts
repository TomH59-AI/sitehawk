import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import bboxClip from 'npm:@turf/bbox-clip@7.1.0';
import simplify from 'npm:@turf/simplify@7.1.0';

/**
 * scipMapSuite — Full SCIP map suite generator (A=11, B/C=3 maps each).
 *
 * One renderer, 11 layer configs. Same proven discipline as targetAMapPair:
 *   - _geo computed ONCE per target → every map for that target reuses by reference
 *   - Basemaps reused: only 3 types (aerial, light, terrain) per target
 *   - Static data layers cached in SCIPLayerCache per (jurisdiction, layer_type)
 *   - Distances computed locally via haversine — zero API cost
 *   - Per-map graceful fallback + provenance tag, suite NEVER fails on layer miss
 *
 * Tiering (cost control):
 *   Target A (targets[0]): all 11 maps
 *   Target B & C:         3 maps each (Aerial, Parcel, Floodplain)
 *   Full A/B/C suite = 17 maps, never 33.
 */

const MAPBOX_STATIC = "https://api.mapbox.com/styles/v1";
// Mapbox Static API hard limits: width and height must be 1–1280 px each.
// We pick 1024×1280 to stay safely under both caps while keeping the 4:5
// portrait aspect ratio SCIP pages were designed for.
const RENDER_WIDTH = 1024;
const RENDER_HEIGHT = 1280;
const DEFAULT_RADIUS_MI = 1.0;

// Supabase project hosting nearest_airport + nearest_cell_tower RPCs (same as
// existing nearestAirport / cellTowerLookup functions). Inlined here so
// scipMapSuite doesn't need to hop through base44.functions.invoke (which
// rejects backend-to-backend calls without a user request context).
const SCIP_SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
const SCIP_SUPABASE_ANON_KEY = "sb_publishable_qlmz0RMO8qXUrWi1i6bpaQ_9tcqSzFZ";
const USGS_EPQS_URL = "https://epqs.nationalmap.gov/v1/json";
const ASCE_WIND_BASE = "https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Tile_RC_II_new/MapServer";

// ─────────────────────── shared geometry ───────────────────────

function computeSharedGeo(lat, lng, radiusMi) {
  const lngDelta = radiusMi / (69 * Math.cos(lat * Math.PI / 180));
  const imageAspect = RENDER_WIDTH / RENDER_HEIGHT;
  const finalLngDelta = lngDelta;
  const finalLatDelta = finalLngDelta / imageAspect;
  const bbox = [
    lng - finalLngDelta, lat - finalLatDelta,
    lng + finalLngDelta, lat + finalLatDelta,
  ];
  const target_px = [Math.round(RENDER_WIDTH / 2), Math.round(RENDER_HEIGHT / 2)];
  const zoom = Math.log2(360 / (finalLngDelta * 2));
  return {
    bbox,
    center: [lng, lat],
    zoom: Math.round(zoom * 100) / 100,
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
    target_px,
    radius_mi: radiusMi,
  };
}

// ─────────────────────── haversine (local, zero-cost) ───────────────────────

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─────────────────────── Mapbox URL builders (one engine) ───────────────────────

const STYLES = {
  aerial:  "mapbox/satellite-streets-v12",
  light:   "mapbox/light-v11",
  terrain: "mapbox/outdoors-v12",   // outdoors-v12 = terrain hillshade + contours
};

/**
 * Build a Mapbox static URL with one basemap + arbitrary overlays + center pin.
 * Same dimensions/bbox for every map → pixel-locked registration.
 */
function buildMapUrl({ geo, basemap, overlays = [], centerLat, centerLng, mapboxToken }) {
  const style = STYLES[basemap] || STYLES.aerial;
  // Center waypoint pin — always present, always at target_px (since bbox is centered on lat/lng)
  const centerPin = `pin-l-marker+ff3b30(${centerLng},${centerLat})`;
  const overlayParts = [...overlays, centerPin].filter(Boolean).join(",");
  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  const bboxStr = `[${minLng},${minLat},${maxLng},${maxLat}]`;
  return `${MAPBOX_STATIC}/${style}/static/${overlayParts}/${bboxStr}/${RENDER_WIDTH}x${RENDER_HEIGHT}@2x?access_token=${mapboxToken}&attribution=false&logo=false`;
}

/** Build a Mapbox overlay for a geodesic line from center to feature coord. */
function buildLineOverlay(centerLat, centerLng, featLat, featLng, color = "0a84ff") {
  // GeoJSON LineString encoded for Mapbox path overlay
  const geojson = {
    type: "Feature",
    properties: { stroke: `#${color}`, "stroke-width": 3 },
    geometry: { type: "LineString", coordinates: [[centerLng, centerLat], [featLng, featLat]] },
  };
  return `geojson(${encodeURIComponent(JSON.stringify(geojson))})`;
}

/** Build a Mapbox marker overlay for a feature (airport/tower/etc) at its real coords. */
function buildFeatureMarker(lat, lng, label, color = "0a84ff") {
  // pin-l-{label}+{color}({lng},{lat}) — label drives the icon glyph
  return `pin-l-${label}+${color}(${lng},${lat})`;
}

// Mapbox Static API URL budget. Mapbox's hard cap is ~8192 bytes total URL;
// we reserve ~1.5KB for base style + bbox + token + other overlays, leaving
// ~6.5KB for the encoded geojson() param. Anything over and Mapbox returns 414.
const MAPBOX_OVERLAY_BUDGET = 6500;

/**
 * Clip a FeatureCollection to a bbox, then simplify iteratively until the
 * URL-encoded geojson() payload fits within the Mapbox budget.
 *
 * Cache stays RAW (caller passes the full county-wide polygon every time);
 * clipping happens per-render so each target's bbox gets only its visible
 * vertices. A second target in the same county hits the same cached raw
 * polygon and gets its own bbox-correct clip — no cross-contamination.
 *
 * Returns { clipped, provenance_suffix } or { clipped: null, ... } if the
 * polygon has no vertices inside the bbox.
 */
function clipAndSimplifyForMapbox(geojson, bbox) {
  if (!geojson || !geojson.features || !geojson.features.length) {
    return { clipped: null, provenance_suffix: "" };
  }

  // Step 1: clip each feature to the bbox. bboxClip works on individual
  // Polygon/MultiPolygon features and returns the clipped geometry or an
  // empty geometry if fully outside.
  const clippedFeatures = [];
  for (const f of geojson.features) {
    if (!f.geometry) continue;
    try {
      const clipped = bboxClip(f, bbox);
      const coords = clipped?.geometry?.coordinates;
      // Drop features with no remaining vertices
      const hasVertices = Array.isArray(coords) && coords.length > 0
        && (clipped.geometry.type === "Polygon"
            ? coords[0]?.length > 0
            : coords.some((p) => p[0]?.length > 0));
      if (hasVertices) {
        // Preserve original styling properties
        clippedFeatures.push({
          ...clipped,
          properties: f.properties || {},
        });
      }
    } catch (_e) {
      // bboxClip can throw on degenerate input — skip those features
    }
  }

  if (!clippedFeatures.length) {
    return { clipped: null, provenance_suffix: "_clipped_empty" };
  }

  let working = { type: "FeatureCollection", features: clippedFeatures };
  let size = encodeURIComponent(JSON.stringify(working)).length;

  // Step 2: if already under budget, ship it
  if (size <= MAPBOX_OVERLAY_BUDGET) {
    return { clipped: working, provenance_suffix: "_clipped" };
  }

  // Helper: rough polygon area in square degrees (good enough for sorting).
  // We don't need true area — just a stable size proxy to keep the biggest zones.
  const featureSize = (f) => {
    const c = f.geometry?.coordinates;
    if (!c) return 0;
    const rings = f.geometry.type === "Polygon" ? [c[0]] : c.map((p) => p[0]);
    let total = 0;
    for (const ring of rings) {
      if (!ring) continue;
      for (let i = 0; i < ring.length - 1; i++) {
        total += Math.abs(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]);
      }
    }
    return total / 2;
  };

  // Step 3: iterative simplification + feature pruning.
  // FEMA NFHL can return hundreds of small features in a dense bbox — simplifying
  // each polygon's vertices isn't enough; we also have to cap the feature count,
  // keeping the largest (most visually important) zones.
  const tolerances = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01];
  const featureCaps = [working.features.length, 20, 10, 5, 3];

  for (const tol of tolerances) {
    let simplified;
    try {
      simplified = simplify(working, { tolerance: tol, highQuality: false, mutate: false });
    } catch (_e) {
      continue;
    }
    // Sort features by size descending so we keep the biggest zones first
    const sorted = [...simplified.features].sort((a, b) => featureSize(b) - featureSize(a));
    for (const cap of featureCaps) {
      const fc = { type: "FeatureCollection", features: sorted.slice(0, cap) };
      const newSize = encodeURIComponent(JSON.stringify(fc)).length;
      if (newSize <= MAPBOX_OVERLAY_BUDGET) {
        const suffix = cap < sorted.length
          ? `_clipped+simplified(${tol})+top${cap}`
          : `_clipped+simplified(${tol})`;
        return { clipped: fc, provenance_suffix: suffix };
      }
    }
    working = simplified;
    size = encodeURIComponent(JSON.stringify(working)).length;
  }

  // Step 4: hard fallback — represent the top N features as their bounding
  // rectangles. Loses vertex fidelity but preserves "there's a flood zone
  // here" signal at SCIP context-map scale. Five rectangles ≈ 1 KB.
  const sortedAll = [...working.features].sort((a, b) => featureSize(b) - featureSize(a));
  for (const cap of [5, 3, 2, 1]) {
    const rects = sortedAll.slice(0, cap).map((f) => {
      const coords = f.geometry?.coordinates;
      if (!coords) return null;
      const flat = [];
      const walk = (a) => {
        if (typeof a[0] === "number") flat.push(a);
        else a.forEach(walk);
      };
      walk(coords);
      if (!flat.length) return null;
      const xs = flat.map((p) => p[0]);
      const ys = flat.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      return {
        type: "Feature",
        properties: f.properties || {},
        geometry: {
          type: "Polygon",
          coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]],
        },
      };
    }).filter(Boolean);
    const fc = { type: "FeatureCollection", features: rects };
    const newSize = encodeURIComponent(JSON.stringify(fc)).length;
    if (newSize <= MAPBOX_OVERLAY_BUDGET) {
      return { clipped: fc, provenance_suffix: `_bbox_fallback+top${cap}` };
    }
  }

  // Step 5: even bbox rectangles can't fit — drop the overlay.
  console.log(`[INFO] OVERLAY_DROPPED size_after_max_simplify=${size}B budget=${MAPBOX_OVERLAY_BUDGET}B`);
  return { clipped: null, provenance_suffix: "_simplify_exhausted" };
}

/**
 * Build a Mapbox polygon/path overlay from a GeoJSON FeatureCollection.
 * Now requires bbox so we can clip+simplify before inlining.
 * Returns { overlay, provenance_suffix } — overlay is null if the polygon
 * can't fit in the URL budget (caller treats as fallback).
 */
function buildGeoJsonOverlay(geojson, bbox) {
  if (!geojson) return { overlay: null, provenance_suffix: "" };
  const { clipped, provenance_suffix } = clipAndSimplifyForMapbox(geojson, bbox);
  if (!clipped) return { overlay: null, provenance_suffix };
  return {
    overlay: `geojson(${encodeURIComponent(JSON.stringify(clipped))})`,
    provenance_suffix,
  };
}

// ─────────────────────── cache layer (Base44 entity) ───────────────────────

async function cacheGet(base44, jurisdiction, layer_type) {
  try {
    const rows = await base44.asServiceRole.entities.SCIPLayerCache.filter({
      jurisdiction, layer_type,
    });
    return rows && rows.length ? rows[0] : null;
  } catch (e) {
    console.log(`[INFO] CACHE_READ_ERROR ${layer_type}:${e.message}`);
    return null;
  }
}

// Mongo/BSON caps a single document at 16MB. County-wide FEMA/NWI polygons can
// exceed 20MB raw, so we simplify the FeatureCollection until the serialized
// payload comfortably fits before caching. Render-time clipping is unaffected —
// this only reduces vertex density of the CACHED copy.
const CACHE_BYTE_BUDGET = 12 * 1024 * 1024; // 12MB safety margin under 16MB cap

function shrinkForCache(geojson) {
  if (!geojson || !geojson.features?.length) return geojson;
  let size = JSON.stringify(geojson).length;
  if (size <= CACHE_BYTE_BUDGET) return geojson;
  let working = geojson;
  for (const tol of [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005]) {
    try {
      working = simplify(working, { tolerance: tol, highQuality: false, mutate: false });
    } catch (_e) {
      continue;
    }
    size = JSON.stringify(working).length;
    if (size <= CACHE_BYTE_BUDGET) {
      console.log(`[INFO] CACHE_SHRINK tol=${tol} size=${Math.round(size / 1024)}KB`);
      return working;
    }
  }
  // Still too big after max simplify — return null so caller skips caching
  // (render still works because render-time clip+simplify runs on raw fetch).
  console.log(`[INFO] CACHE_SKIP still ${Math.round(size / 1024)}KB after max simplify`);
  return null;
}

async function cacheSet(base44, jurisdiction, layer_type, geojson, data_source) {
  try {
    const shrunk = shrinkForCache(geojson);
    if (!shrunk) return; // too large to cache safely; skip without erroring
    const existing = await base44.asServiceRole.entities.SCIPLayerCache.filter({
      jurisdiction, layer_type,
    });
    const payload = {
      jurisdiction, layer_type, geojson: shrunk, data_source,
      fetched_at: new Date().toISOString(),
    };
    if (existing && existing.length) {
      await base44.asServiceRole.entities.SCIPLayerCache.update(existing[0].id, payload);
    } else {
      await base44.asServiceRole.entities.SCIPLayerCache.create(payload);
    }
  } catch (e) {
    console.log(`[INFO] CACHE_WRITE_ERROR ${layer_type}:${e.message}`);
  }
}

// ─────────────────────── data fetchers (with cache + fallback) ───────────────────────

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    return r;
  } catch (e) {
    return { ok: false, _err: e.message };
  } finally { clearTimeout(t); }
}

/** FEMA NFHL flood zones — bbox query against ArcGIS feature service. */
async function fetchFEMA(geo) {
  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  const url = `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?` + new URLSearchParams({
    geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326", outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "FLD_ZONE,ZONE_SUBTY,STATIC_BFE",
    returnGeometry: "true",
    f: "geojson",
  });
  const res = await fetchWithTimeout(url, {}, 15000);
  if (!res.ok) return { ok: false, reason: res._err || `http_${res.status}` };
  const data = await res.json();
  if (!data.features || !data.features.length) return { ok: true, geojson: null };
  // Style each feature
  const styled = {
    type: "FeatureCollection",
    features: data.features.map((f) => {
      const zone = f.properties?.FLD_ZONE || "X";
      const color = zone === "AE" || zone === "A" ? "#1e90ff"
                  : zone === "VE" || zone === "V" ? "#ff3b30"
                  : zone === "X" ? "#9ca3af" : "#fbbf24";
      return {
        ...f,
        properties: { ...f.properties, fill: color, "fill-opacity": 0.45, stroke: color, "stroke-width": 1 },
      };
    }),
  };
  return { ok: true, geojson: styled, data_source: "fema_nfhl" };
}

/** FWS NWI wetlands — bbox query. */
async function fetchNWI(geo) {
  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  const url = `https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query?` + new URLSearchParams({
    geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326", outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "WETLAND_TYPE,ATTRIBUTE",
    returnGeometry: "true",
    f: "geojson",
  });
  const res = await fetchWithTimeout(url, {}, 15000);
  if (!res.ok) return { ok: false, reason: res._err || `http_${res.status}` };
  const data = await res.json();
  if (!data.features || !data.features.length) return { ok: true, geojson: null };
  const styled = {
    type: "FeatureCollection",
    features: data.features.map((f) => ({
      ...f,
      properties: { ...f.properties, fill: "#10b981", "fill-opacity": 0.5, stroke: "#047857", "stroke-width": 1 },
    })),
  };
  return { ok: true, geojson: styled, data_source: "fws_nwi" };
}

// ─────────────────────── County ArcGIS registry (fallback) ───────────────────────
// Known public ArcGIS REST endpoints for county zoning + FLUM, keyed by
// normalized county name (lowercase, no "county" suffix). Each entry can have
// zoning_url and/or flu_url — both are optional. These are tried ONLY when
// zone-resolve returns no polygon for that layer.
// Field hints tell us which attribute contains the zone code / FLU designation.
const COUNTY_ARCGIS_REGISTRY = {
  // ── Florida ──────────────────────────────────────────────────────────────────
  "hillsborough": {
    zoning_url: "https://gis.hillsboroughcounty.org/arcgis/rest/services/PublicLayers/Zoning/MapServer/0",
    zoning_field: "ZONING",
    flu_url: "https://gis.hillsboroughcounty.org/arcgis/rest/services/PublicLayers/FutureGeneralLandUse/MapServer/0",
    flu_field: "FLU",
  },
  "pinellas": {
    zoning_url: "https://reflect-pinellas.icad.com/arcgis/rest/services/PinellasCounty/Zoning/MapServer/0",
    zoning_field: "ZONE_CODE",
  },
  "orange": {
    zoning_url: "https://maps.ocfl.net/arcgis/rest/services/ZoningLayers/MapServer/0",
    zoning_field: "ZONE_TYPE",
  },
  "seminole": {
    zoning_url: "https://gis.seminolecountyfl.gov/arcgis/rest/services/Planning/Zoning/MapServer/0",
    zoning_field: "ZONING",
  },
  "volusia": {
    zoning_url: "https://maps.volusia.org/arcgis/rest/services/PublicAccess/Zoning/MapServer/0",
    zoning_field: "ZONING",
    flu_url: "https://services6.arcgis.com/bPOxEaXVnK5hJRGI/arcgis/rest/services/FLU/FeatureServer/0",
    flu_field: "LNDUSE",
  },
  "sarasota": {
    zoning_url: "https://gis.scgov.net/arcgis/rest/services/GIS/Zoning/MapServer/0",
    zoning_field: "ZONING",
  },
  "manatee": {
    zoning_url: "https://www.arcgis.com/home/item.html?id=manatee_zoning_placeholder",
    zoning_field: "ZONE",
  },
  "lee": {
    zoning_url: "https://maps.leegov.com/arcgis/rest/services/LandRecords/Zoning/MapServer/0",
    zoning_field: "ZONING",
  },
  "collier": {
    zoning_url: "https://maps.colliercountyfl.gov/arcgis/rest/services/PublicGIS/Zoning/MapServer/0",
    zoning_field: "ZONING",
  },
  "brevard": {
    flu_url: "https://gis.brevardcounty.us/arcgis/rest/services/PlanningZoning/FLU/MapServer/0",
    flu_field: "FLU_DESC",
  },
  "polk": {
    zoning_url: "https://gis.polk-county.net/arcgis/rest/services/PublicGIS/Zoning/MapServer/0",
    zoning_field: "ZONE_CLASS",
  },
  "osceola": {
    zoning_url: "https://gis.osceola.org/arcgis/rest/services/OpenData/Zoning/MapServer/0",
    zoning_field: "ZONING",
  },
  "pasco": {
    zoning_url: "https://gis.pascocountyfl.net/arcgis/rest/services/PublicFacing/Zoning/MapServer/0",
    zoning_field: "ZONE",
  },
  "st. johns": {
    zoning_url: "https://www.gis.sjcfl.us/portal_sjcgis/rest/services/Zoning/MapServer/0",
    zoning_field: "ZONING",
  },
  "flagler": {
    flu_url: "https://services3.arcgis.com/6BaHyMjTzrjhX1cX/arcgis/rest/services/Bunnell_Future_Land_Use/FeatureServer/0",
    flu_field: "FLU",
  },
  "miami-dade": {
    zoning_url: "https://gis.mdc.miami-dade.gov/arcgis/rest/services/Zoning/MapServer/0",
    zoning_field: "ZONING",
  },
  "broward": {
    zoning_url: "https://gis.broward.org/arcgis/rest/services/BrowardCounty/Zoning/MapServer/0",
    zoning_field: "ZONE",
  },
  "alachua": {
    zoning_url: "https://gis.alachuacounty.us/arcgis/rest/services/Planning/Zoning/MapServer/0",
    zoning_field: "ZONING",
  },
  // ── Texas ────────────────────────────────────────────────────────────────────
  "harris": {
    zoning_url: "https://services.arcgis.com/su8ic9KbA7PYVxPS/arcgis/rest/services/Harris_County_Zoning/FeatureServer/0",
    zoning_field: "ZONE",
  },
  "tarrant": {
    zoning_url: "https://maps.tarrantcounty.com/arcgis/rest/services/Public/Zoning/MapServer/0",
    zoning_field: "ZONING",
  },
  // ── Georgia ──────────────────────────────────────────────────────────────────
  "gwinnett": {
    zoning_url: "https://gis.gwinnettcounty.com/arcgis/rest/services/Public/Zoning/MapServer/0",
    zoning_field: "ZONE",
  },
  "fulton": {
    zoning_url: "https://gis.fultoncountyga.gov/arcgis/rest/services/Zoning/MapServer/0",
    zoning_field: "ZONING",
  },
  // ── North Carolina ───────────────────────────────────────────────────────────
  "wake": {
    zoning_url: "https://maps.wakegov.com/arcgis/rest/services/Planning/Zoning/MapServer/0",
    zoning_field: "ZONE",
  },
  "mecklenburg": {
    zoning_url: "https://gis.mecklenburgcountync.gov/arcgis/rest/services/Planning/Zoning/MapServer/0",
    zoning_field: "ZONE_TYPE",
  },
};

/** Normalize county name for registry lookup: lowercase, strip "county" suffix. */
function normalizeCounty(name) {
  return (name || "").toLowerCase().replace(/\s*county\s*$/i, "").trim();
}

/**
 * Query a single public ArcGIS REST layer (MapServer or FeatureServer) with a
 * point geometry. Returns { ok, geojson, zone_code } or { ok: false, reason }.
 * Uses esriSpatialRelIntersects and outSR=4326 so we always get WGS84 back.
 */
async function queryArcGISLayer(layerUrl, lat, lon, zoneField) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: zoneField || "*",
    returnGeometry: "true",
    f: "geojson",
  });
  const url = `${layerUrl}/query?${params}`;
  const res = await fetchWithTimeout(url, {}, 12000);
  if (!res.ok) return { ok: false, reason: res._err || `http_${res.status}` };
  let data;
  try { data = await res.json(); } catch (_) { return { ok: false, reason: "parse_error" }; }
  if (!data.features || !data.features.length) return { ok: true, geojson: null };
  const zone_code = zoneField ? (data.features[0]?.properties?.[zoneField] || null) : null;
  return { ok: true, geojson: { type: "FeatureCollection", features: data.features }, zone_code };
}

/**
 * Query a public ArcGIS zoning layer over the whole map BBOX (not just the
 * center point), so the zoning map shows EVERY zone in view — not only the
 * parcel we want to lease. Also resolves the center-point zone_code separately
 * (first feature that contains the center is a good-enough label).
 */
async function queryArcGISLayerBbox(layerUrl, bbox, zoneField) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const params = new URLSearchParams({
    geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: zoneField || "*",
    returnGeometry: "true",
    f: "geojson",
  });
  const url = `${layerUrl}/query?${params}`;
  const res = await fetchWithTimeout(url, {}, 15000);
  if (!res.ok) return { ok: false, reason: res._err || `http_${res.status}` };
  let data;
  try { data = await res.json(); } catch (_) { return { ok: false, reason: "parse_error" }; }
  if (!data.features || !data.features.length) return { ok: true, geojson: null };
  const zone_code = zoneField ? (data.features[0]?.properties?.[zoneField] || null) : null;
  return { ok: true, geojson: { type: "FeatureCollection", features: data.features }, zone_code };
}

/**
 * Try the county ArcGIS registry for zoning and/or FLU when zone-resolve
 * comes back empty. Returns { zoningGeojson, fluGeojson, zone_code } — any
 * field can be null if no data found.
 */
async function fetchCountyArcGIS(lat, lon, county) {
  const key = normalizeCounty(county);
  const entry = COUNTY_ARCGIS_REGISTRY[key];
  if (!entry) return { zoningGeojson: null, fluGeojson: null, zone_code: null };

  const zoningPromise = entry.zoning_url
    ? queryArcGISLayer(entry.zoning_url, lat, lon, entry.zoning_field)
    : Promise.resolve({ ok: true, geojson: null });

  const fluPromise = entry.flu_url
    ? queryArcGISLayer(entry.flu_url, lat, lon, entry.flu_field)
    : Promise.resolve({ ok: true, geojson: null });

  const [zoningResult, fluResult] = await Promise.all([zoningPromise, fluPromise]);

  const applyZoningStyle = (fc) => fc ? {
    ...fc,
    features: fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, fill: "#a855f7", "fill-opacity": 0.25, stroke: "#7c3aed", "stroke-width": 2 },
    })),
  } : null;

  const applyFluStyle = (fc) => fc ? {
    ...fc,
    features: fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, fill: "#f59e0b", "fill-opacity": 0.3, stroke: "#d97706", "stroke-width": 2 },
    })),
  } : null;

  return {
    zoningGeojson: zoningResult.ok && zoningResult.geojson ? applyZoningStyle(zoningResult.geojson) : null,
    fluGeojson: fluResult.ok && fluResult.geojson ? applyFluStyle(fluResult.geojson) : null,
    zone_code: zoningResult.zone_code || null,
  };
}

/** zone-resolve (Supabase edge fn) — ArcGIS county zoning + FLU. Replaces Zoneomics. */
async function fetchZoneResolve(geo, zoneResolveAnonKey) {
  if (!zoneResolveAnonKey) return { ok: false, reason: "no_zone_resolve_key" };
  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  const lat = (minLat + maxLat) / 2;
  const lon = (minLng + maxLng) / 2;
  const url = "https://vkiwvctpxhbsoeagivnl.supabase.co/functions/v1/zone-resolve";
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${zoneResolveAnonKey}`,
      "apikey": zoneResolveAnonKey,
    },
    body: JSON.stringify({ lat, lon }),
  }, 15000);
  if (!res.ok) return { ok: false, reason: res._err || `http_${res.status}` };
  const data = await res.json();

  // Extract zoning polygon
  const zoning = data?.zoning_polygon || data?.zoning || null;
  let zoningGeojson = null;
  if (zoning) {
    // Wrap bare Feature/Geometry in FeatureCollection
    if (zoning.type === "FeatureCollection") {
      zoningGeojson = zoning;
    } else if (zoning.type === "Feature") {
      zoningGeojson = { type: "FeatureCollection", features: [zoning] };
    } else if (zoning.type === "Polygon" || zoning.type === "MultiPolygon") {
      zoningGeojson = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: zoning }] };
    }
    if (zoningGeojson) {
      // Apply styling
      zoningGeojson.features = zoningGeojson.features.map((f) => ({
        ...f,
        properties: { ...f.properties, fill: "#a855f7", "fill-opacity": 0.25, stroke: "#7c3aed", "stroke-width": 2 },
      }));
    }
  }

  // Extract FLU polygon
  const flu = data?.flu_polygon || data?.flu?.geojson || null;
  let fluGeojson = null;
  if (flu) {
    if (flu.type === "FeatureCollection") {
      fluGeojson = flu;
    } else if (flu.type === "Feature") {
      fluGeojson = { type: "FeatureCollection", features: [flu] };
    } else if (flu.type === "Polygon" || flu.type === "MultiPolygon") {
      fluGeojson = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: flu }] };
    }
    if (fluGeojson) {
      fluGeojson.features = fluGeojson.features.map((f) => ({
        ...f,
        properties: { ...f.properties, fill: "#f59e0b", "fill-opacity": 0.3, stroke: "#d97706", "stroke-width": 2 },
      }));
    }
  }

  const zone_code = data?.zoning?.zone_code || data?.flu?.code || null;
  return {
    ok: true,
    zoningGeojson,
    fluGeojson,
    zone_code,
    data_source: "zone_resolve",
  };
}

/** FLU — county GIS is jurisdiction-specific; we treat as state-fallback-or-unavailable. */
async function fetchFLU(geo, jurisdiction, state) {
  // No universal FLU endpoint — county-by-county. For now we don't have a county FLU
  // registry, so this layer is always "unavailable" until per-county wiring lands.
  // State fallback hook is reserved for future state-level FLU datasets.
  return { ok: false, reason: "no_county_flu_registered" };
}

// ─────────────────────── per-map builders ───────────────────────

async function buildTopographyMap(ctx) {
  const { geo, lat, lng, mapboxToken } = ctx;
  // USGS EPQS for center AMSL — direct call (no SDK hop)
  let center_amsl_ft = null;
  try {
    const url = `${USGS_EPQS_URL}?x=${lng}&y=${lat}&units=Feet&wkid=4326&includeDate=false`;
    const r = await fetchWithTimeout(url, {}, 10000);
    if (r.ok) {
      const data = await r.json();
      const raw = data?.value;
      center_amsl_ft = (raw != null && raw > -100000) ? parseFloat(parseFloat(raw).toFixed(1)) : null;
    }
  } catch (e) {
    console.log(`[INFO] MAP_FALLBACK topography:epqs_err reason=${e.message}`);
  }
  return {
    type: "topography",
    url: buildMapUrl({ geo, basemap: "terrain", overlays: [], centerLat: lat, centerLng: lng, mapboxToken }),
    data_source: center_amsl_ft != null ? "mapbox_terrain+usgs_3dep" : "mapbox_terrain",
    center_amsl_ft,
    data_source_note: center_amsl_ft == null ? "USGS 3DEP elevation unavailable for this point" : null,
  };
}

async function buildFloodplainMap(ctx) {
  const { geo, lat, lng, mapboxToken, base44, jurisdiction, fallbacks, cacheStats } = ctx;
  let layer = await cacheGet(base44, jurisdiction, "fema");
  let data_source = "cache:fema";
  if (!layer) {
    cacheStats.misses++;
    const f = await fetchFEMA(geo);
    if (f.ok && f.geojson) {
      await cacheSet(base44, jurisdiction, "fema", f.geojson, f.data_source);
      layer = { geojson: f.geojson, data_source: f.data_source };
      data_source = "fema_nfhl";
    } else if (f.ok) {
      data_source = "fema_nfhl:no_features";
    } else {
      fallbacks.push(`floodplain:${f.reason}`);
      console.log(`[INFO] MAP_FALLBACK floodplain:${f.reason}`);
      data_source = "unavailable";
    }
  } else {
    cacheStats.hits++;
  }
  let overlays = [];
  if (layer?.geojson) {
    const { overlay, provenance_suffix } = buildGeoJsonOverlay(layer.geojson, geo.bbox);
    if (overlay) {
      overlays = [overlay];
      data_source = `${data_source}${provenance_suffix}`;
    } else {
      fallbacks.push(`floodplain:overlay_dropped${provenance_suffix}`);
      console.log(`[INFO] MAP_FALLBACK floodplain:overlay_dropped${provenance_suffix}`);
      data_source = `${data_source}:overlay_dropped`;
    }
  }
  return {
    type: "floodplain",
    url: buildMapUrl({ geo, basemap: "aerial", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    data_source_note: data_source.startsWith("unavailable") ? "FEMA NFHL unavailable — verify flood zone with FEMA Map Service Center" : null,
  };
}

async function buildZoningMap(ctx) {
  const { geo, lat, lng, mapboxToken, base44, jurisdiction, county, fallbacks, cacheStats, zoneResolveResult } = ctx;
  let layer = await cacheGet(base44, jurisdiction, "zone_resolve_zoning");
  let data_source = "cache:zone_resolve";
  let zone_code = null;
  if (!layer) {
    cacheStats.misses++;
    // Primary: county ArcGIS zoning over the whole BBOX so the map shows EVERY
    // zone in view — not just the single parcel we want to lease. This is the
    // fix for "zoning map only shows the target parcel's zone."
    const key = normalizeCounty(county || jurisdiction);
    const entry = COUNTY_ARCGIS_REGISTRY[key];
    if (entry?.zoning_url) {
      const bboxZoning = await queryArcGISLayerBbox(entry.zoning_url, geo.bbox, entry.zoning_field);
      if (bboxZoning.ok && bboxZoning.geojson) {
        const styled = {
          ...bboxZoning.geojson,
          features: bboxZoning.geojson.features.map((f) => ({
            ...f,
            properties: { ...f.properties, fill: "#a855f7", "fill-opacity": 0.25, stroke: "#7c3aed", "stroke-width": 2 },
          })),
        };
        await cacheSet(base44, jurisdiction, "zone_resolve_zoning", styled, "county_arcgis_bbox");
        layer = { geojson: styled, data_source: "county_arcgis_bbox" };
        zone_code = bboxZoning.zone_code;
        data_source = "county_arcgis_bbox";
        console.log(`[INFO] ZONING county_arcgis_bbox hit county=${key} features=${styled.features.length}`);
      }
    }
    // Fallback: zone-resolve single center polygon (only the target parcel's zone)
    if (!layer) {
      const z = zoneResolveResult || await fetchZoneResolve(geo, Deno.env.get("ZONE_RESOLVE_ANON_KEY"));
      if (z.ok && z.zoningGeojson) {
        await cacheSet(base44, jurisdiction, "zone_resolve_zoning", z.zoningGeojson, z.data_source);
        layer = { geojson: z.zoningGeojson, data_source: z.data_source };
        zone_code = z.zone_code;
        data_source = "zone_resolve";
      } else {
        fallbacks.push(`zoning:${z.reason || "no_features"}`);
        console.log(`[INFO] MAP_FALLBACK zoning:${z.reason || "no_features"}`);
        data_source = "unavailable";
      }
    }
  } else {
    cacheStats.hits++;
    zone_code = layer.geojson?.features?.[0]?.properties?.zone_code || null;
  }
  let overlays = [];
  if (layer?.geojson) {
    const { overlay, provenance_suffix } = buildGeoJsonOverlay(layer.geojson, geo.bbox);
    if (overlay) {
      overlays = [overlay];
      data_source = `${data_source}${provenance_suffix}`;
    } else {
      fallbacks.push(`zoning:overlay_dropped${provenance_suffix}`);
      console.log(`[INFO] MAP_FALLBACK zoning:overlay_dropped${provenance_suffix}`);
      data_source = `${data_source}:overlay_dropped`;
    }
  }
  return {
    type: "zoning",
    url: buildMapUrl({ geo, basemap: "light", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    zone_code,
    data_source_note: data_source.startsWith("unavailable") ? "Zoning polygon unavailable — verify with local zoning department" : null,
  };
}

async function buildFLUMap(ctx) {
  const { geo, lat, lng, mapboxToken, base44, jurisdiction, county, state, fallbacks, cacheStats, _force_flu_miss, zoneResolveResult } = ctx;
  let layer = _force_flu_miss ? null : await cacheGet(base44, jurisdiction, "zone_resolve_flu");
  let data_source = "cache:zone_resolve_flu";
  if (!layer) {
    cacheStats.misses++;
    const z = _force_flu_miss
      ? { ok: false, reason: "forced_miss" }
      : (zoneResolveResult || await fetchZoneResolve(geo, Deno.env.get("ZONE_RESOLVE_ANON_KEY")));
    if (z.ok && z.fluGeojson) {
      await cacheSet(base44, jurisdiction, "zone_resolve_flu", z.fluGeojson, "zone_resolve");
      layer = { geojson: z.fluGeojson, data_source: "zone_resolve" };
      data_source = "zone_resolve_flu";
    } else {
      // Fallback: county ArcGIS registry
      const [minLng, minLat, maxLng, maxLat] = geo.bbox;
      const cLat = (minLat + maxLat) / 2, cLon = (minLng + maxLng) / 2;
      const fb = await fetchCountyArcGIS(cLat, cLon, county || jurisdiction);
      if (fb.fluGeojson) {
        await cacheSet(base44, jurisdiction, "zone_resolve_flu", fb.fluGeojson, "county_arcgis");
        layer = { geojson: fb.fluGeojson, data_source: "county_arcgis" };
        data_source = "county_arcgis_flu";
        console.log(`[INFO] FLU county_arcgis fallback hit county=${county || jurisdiction}`);
      } else {
        fallbacks.push(`flu:${z.reason || "no_features"}`);
        console.log(`[INFO] MAP_FALLBACK flu:${z.reason || "no_features"}`);
        data_source = "unavailable";
      }
    }
  } else {
    cacheStats.hits++;
    data_source = "cache:zone_resolve_flu";
  }
  let overlays = [];
  if (layer?.geojson) {
    const { overlay, provenance_suffix } = buildGeoJsonOverlay(layer.geojson, geo.bbox);
    if (overlay) {
      overlays = [overlay];
      data_source = `${data_source}${provenance_suffix}`;
    } else {
      fallbacks.push(`flu:overlay_dropped${provenance_suffix}`);
      console.log(`[INFO] MAP_FALLBACK flu:overlay_dropped${provenance_suffix}`);
      data_source = `${data_source}:overlay_dropped`;
    }
  }
  return {
    type: "flu",
    url: buildMapUrl({ geo, basemap: "light", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    data_source_note: data_source.startsWith("unavailable")
      ? `Future Land Use layer not published for ${jurisdiction} — verify with county planning`
      : null,
  };
}

async function buildWetlandsMap(ctx) {
  const { geo, lat, lng, mapboxToken, base44, jurisdiction, fallbacks, cacheStats } = ctx;
  let layer = await cacheGet(base44, jurisdiction, "nwi");
  let data_source = "cache:nwi";
  if (!layer) {
    cacheStats.misses++;
    const w = await fetchNWI(geo);
    if (w.ok && w.geojson) {
      await cacheSet(base44, jurisdiction, "nwi", w.geojson, w.data_source);
      layer = { geojson: w.geojson, data_source: w.data_source };
      data_source = "fws_nwi";
    } else if (w.ok) {
      data_source = "fws_nwi:no_features";
    } else {
      fallbacks.push(`wetlands:${w.reason}`);
      console.log(`[INFO] MAP_FALLBACK wetlands:${w.reason}`);
      data_source = "unavailable";
    }
  } else {
    cacheStats.hits++;
  }
  let overlays = [];
  if (layer?.geojson) {
    const { overlay, provenance_suffix } = buildGeoJsonOverlay(layer.geojson, geo.bbox);
    if (overlay) {
      overlays = [overlay];
      data_source = `${data_source}${provenance_suffix}`;
    } else {
      fallbacks.push(`wetlands:overlay_dropped${provenance_suffix}`);
      console.log(`[INFO] MAP_FALLBACK wetlands:overlay_dropped${provenance_suffix}`);
      data_source = `${data_source}:overlay_dropped`;
    }
  }
  return {
    type: "wetlands",
    url: buildMapUrl({ geo, basemap: "aerial", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    data_source_note: data_source.startsWith("unavailable") ? "FWS NWI unavailable for this bbox" : null,
  };
}

async function buildClosestAirportMap(ctx) {
  const { geo, lat, lng, mapboxToken, fallbacks } = ctx;
  let feature_name = null, featLat = null, featLng = null;
  let distance_mi = null, distance_ft = null;
  let data_source = "supabase_airports";
  try {
    const rpcUrl = `${SCIP_SUPABASE_URL}/rest/v1/rpc/nearest_airport`;
    const r = await fetchWithTimeout(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SCIP_SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SCIP_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ center_lat: Number(lat), center_lon: Number(lng), include_closed: false }),
    }, 15000);
    if (r.ok) {
      const data = await r.json();
      const d = Array.isArray(data) ? data[0] : data;
      if (d && d.latitude_deg != null && d.longitude_deg != null) {
        featLat = Number(d.latitude_deg);
        featLng = Number(d.longitude_deg);
        feature_name = d.airport_callnumber || "Unknown";
        // Compute distance LOCALLY via haversine — zero API cost, lat/lng order verified
        distance_mi = parseFloat(haversineMiles(lat, lng, featLat, featLng).toFixed(2));
        distance_ft = Math.round(distance_mi * 5280);
      } else {
        fallbacks.push("closest_airport:no_features");
        data_source = "unavailable";
      }
    } else {
      fallbacks.push(`closest_airport:http_${r.status || "err"}`);
      data_source = "unavailable";
    }
  } catch (e) {
    fallbacks.push(`closest_airport:${e.message}`);
    console.log(`[INFO] MAP_FALLBACK closest_airport:${e.message}`);
    data_source = "unavailable";
  }
  const overlays = [];
  if (featLat != null && featLng != null) {
    overlays.push(buildLineOverlay(lat, lng, featLat, featLng, "0a84ff"));
    // pin-l-airfield is Mapbox Maki's airplane icon — sits at the feature's real coord
    overlays.push(buildFeatureMarker(featLat, featLng, "airfield", "0a84ff"));
  }
  return {
    type: "closest_airport",
    url: buildMapUrl({ geo, basemap: "aerial", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    feature_name,
    distance_mi,
    distance_ft,
    distance_label: distance_mi != null ? `${distance_mi} mi / ${distance_ft.toLocaleString()} ft as the crow flies` : null,
    data_source_note: data_source === "unavailable" ? "No airport returned from Supabase nearest_airport RPC" : null,
  };
}

async function buildClosestTowerMap(ctx) {
  const { geo, lat, lng, mapboxToken, fallbacks } = ctx;
  let feature_name = null, featLat = null, featLng = null;
  let distance_mi = null, distance_ft = null;
  let data_source = "supabase_fcc_asr";
  try {
    const rpcUrl = `${SCIP_SUPABASE_URL}/rest/v1/rpc/nearest_cell_tower`;
    const r = await fetchWithTimeout(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SCIP_SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SCIP_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ center_lat: Number(lat), center_lon: Number(lng), radius_miles: null }),
    }, 15000);
    if (r.ok) {
      const data = await r.json();
      const t = Array.isArray(data) ? data[0] : data;
      if (t && t.latitude_deg != null && t.longitude_deg != null) {
        featLat = Number(t.latitude_deg);
        featLng = Number(t.longitude_deg);
        feature_name = t.call_letters || t.tower_registration_number || "Unknown";
        distance_mi = parseFloat(haversineMiles(lat, lng, featLat, featLng).toFixed(2));
        distance_ft = Math.round(distance_mi * 5280);
      } else {
        fallbacks.push("closest_tower:no_features");
        data_source = "unavailable";
      }
    } else {
      fallbacks.push(`closest_tower:http_${r.status || "err"}`);
      data_source = "unavailable";
    }
  } catch (e) {
    fallbacks.push(`closest_tower:${e.message}`);
    console.log(`[INFO] MAP_FALLBACK closest_tower:${e.message}`);
    data_source = "unavailable";
  }
  const overlays = [];
  if (featLat != null && featLng != null) {
    overlays.push(buildLineOverlay(lat, lng, featLat, featLng, "f59e0b"));
    // pin-l-communications-tower = Mapbox Maki communications-tower icon at real coord
    overlays.push(buildFeatureMarker(featLat, featLng, "communications-tower", "f59e0b"));
  }
  return {
    type: "closest_tower",
    url: buildMapUrl({ geo, basemap: "aerial", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    feature_name,
    distance_mi,
    distance_ft,
    distance_label: distance_mi != null ? `${distance_mi} mi / ${distance_ft.toLocaleString()} ft as the crow flies` : null,
    data_source_note: data_source === "unavailable" ? "No tower returned from Supabase nearest_cell_tower RPC" : null,
  };
}

async function buildAerialMap(ctx) {
  const { geo, lat, lng, mapboxToken } = ctx;
  return {
    type: "aerial",
    url: buildMapUrl({ geo, basemap: "aerial", overlays: [], centerLat: lat, centerLng: lng, mapboxToken }),
    data_source: "mapbox_satellite",
  };
}

async function buildParcelMap(ctx) {
  const { geo, lat, lng, mapboxToken, apn, owner } = ctx;
  // Parcel boundary geometry not fetched here — caller passes via apn/owner labels.
  // If a parcel polygon geojson is later wired in, drop into overlays.
  return {
    type: "parcel",
    url: buildMapUrl({ geo, basemap: "aerial", overlays: [], centerLat: lat, centerLng: lng, mapboxToken }),
    data_source: "mapbox_satellite+realie_label",
    apn: apn || null,
    owner: owner || null,
  };
}

async function buildWindSpeedMap(ctx) {
  const { geo, lat, lng, mapboxToken, fallbacks } = ctx;
  let wind_speed_mph = null, wind_zone = null, data_source = "asce_7_22";
  try {
    const delta = 0.1;
    const mapExtent = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
    const url = `${ASCE_WIND_BASE}/identify?` + new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      sr: "4326", layers: "visible", tolerance: "20",
      mapExtent, imageDisplay: "800,600,96",
      returnGeometry: "false", f: "json",
    });
    const r = await fetchWithTimeout(url, {}, 10000);
    if (r.ok) {
      const data = await r.json();
      for (const result of (data.results || [])) {
        const raw = result.attributes?.["Classify.Pixel Value"]
                 || result.attributes?.["Pixel Value"]
                 || result.attributes?.["pixel_value"];
        if (!raw || raw === "NoData" || raw === "null") continue;
        const val = parseFloat(raw);
        if (isNaN(val) || val <= 0) continue;
        wind_speed_mph = Math.round(val);
        break;
      }
      if (wind_speed_mph != null) {
        wind_zone = wind_speed_mph >= 150 ? "extreme"
                  : wind_speed_mph >= 130 ? "high"
                  : wind_speed_mph >= 110 ? "moderate" : "low";
      } else {
        fallbacks.push("wind_speed:no_value");
        data_source = "unavailable";
      }
    } else {
      fallbacks.push(`wind_speed:http_${r.status || "err"}`);
      data_source = "unavailable";
    }
  } catch (e) {
    fallbacks.push(`wind_speed:${e.message}`);
    console.log(`[INFO] MAP_FALLBACK wind_speed:${e.message}`);
    data_source = "unavailable";
  }
  return {
    type: "wind_speed",
    url: buildMapUrl({ geo, basemap: "light", overlays: [], centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    wind_speed_mph,
    wind_zone,
    data_source_note: data_source === "unavailable" ? "ASCE 7-22 wind speed unavailable — verify with state building code" : null,
  };
}

// ─────────────────────── target orchestrator ───────────────────────

async function buildTargetMaps(target, ctx) {
  const { base44, jurisdiction, state, mapboxToken, search_radius_mi, fallbacks, cacheStats } = ctx;
  const { label, site_name, lat, lng, apn, owner } = target;

  const _geo = computeSharedGeo(lat, lng, search_radius_mi);
  console.log(`[INFO] MAP_GEO target=${label} bbox=${JSON.stringify(_geo.bbox)} target_px=${JSON.stringify(_geo.target_px)}`);

  // Pre-fetch zone-resolve once per target so both zoning + FLU maps share the result.
  // Only needed if neither layer is already in cache.
  let zoneResolveResult = null;
  const zoningCached = await cacheGet(base44, jurisdiction, "zone_resolve_zoning");
  const fluCached = await cacheGet(base44, jurisdiction, "zone_resolve_flu");
  if (!zoningCached || !fluCached) {
    zoneResolveResult = await fetchZoneResolve(_geo, Deno.env.get("ZONE_RESOLVE_ANON_KEY"));
    console.log(`[INFO] ZONE_RESOLVE target=${label} ok=${zoneResolveResult.ok} hasZoning=${!!zoneResolveResult.zoningGeojson} hasFlu=${!!zoneResolveResult.fluGeojson}`);
  }

  const mapCtx = {
    geo: _geo, lat, lng, apn, owner,
    base44, jurisdiction, county: ctx.county, state, mapboxToken,
    fallbacks, cacheStats,
    _force_flu_miss: ctx._force_flu_miss,
    zoneResolveResult,
  };

  const isTargetA = label === "A";
  // Target A: all 11. B/C: aerial + parcel + floodplain.
  const builders = isTargetA
    ? [
        buildTopographyMap, buildFloodplainMap, buildZoningMap, buildFLUMap,
        buildWetlandsMap, buildClosestAirportMap, buildClosestTowerMap,
        buildAerialMap, buildParcelMap, buildWindSpeedMap,
      ]
    : [buildAerialMap, buildParcelMap, buildFloodplainMap];

  const maps = [];
  for (const b of builders) {
    const m = await b(mapCtx);
    maps.push(m);
  }

  // Filename dedup: strip any existing label token so it can't be doubled
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const base = site_name
    .replace(/[^\w-]/g, "_")
    .replace(/_*Target[ABC]/gi, "")
    .replace(/_+$/, "")
    .replace(/^_+/, "")
    .trim()
    .substring(0, 40);

  const mapsWithFilenames = maps.map((m) => ({
    ...m,
    filename: `${base}_Target${label}_${m.type}_${today}.png`,
  }));

  return { label, site_name, _geo, maps: mapsWithFilenames };
}

// ─────────────────────── handler ───────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      targets = [],
      jurisdiction,
      county = null,
      state,
      search_radius_mi = DEFAULT_RADIUS_MI,
      agent_name = null,
      _force_flu_miss = false, // protocol test #5
      _meta_only = false, // dev/test flag: return only _meta + map summaries, no URLs
    } = body || {};

    if (!targets.length) return Response.json({ error: "targets[] required (1-3 entries)" }, { status: 400 });
    if (!jurisdiction || !state) return Response.json({ error: "jurisdiction and state required" }, { status: 400 });

    const mapboxToken = Deno.env.get("MAPBOX_API_KEY");
    if (!mapboxToken) return Response.json({ error: "MAPBOX_API_KEY not configured" }, { status: 500 });

    const fallbacks = [];
    const cacheStats = { hits: 0, misses: 0 };

    const ctx = {
      base44, jurisdiction, county, state, mapboxToken,
      search_radius_mi, fallbacks, cacheStats, agent_name,
      _force_flu_miss,
    };

    // Build all targets — sequential to keep cache writes ordered (later targets benefit
    // from earlier targets' cache writes in the same jurisdiction).
    const targetResults = [];
    for (const target of targets.slice(0, 3)) {
      const result = await buildTargetMaps(target, ctx);
      targetResults.push(result);
    }

    const maps_generated = targetResults.reduce((sum, t) => sum + t.maps.length, 0);

    // _render_test: if true, HEAD-fetch each map URL right here and return
    // status/content-type/PNG-validity per map. Bypasses backend-to-backend
    // 403s and response truncation. Used to prove Mapbox accepts the URLs.
    if (body?._render_test) {
      const renderResults = [];
      for (const t of targetResults) {
        for (const m of t.maps) {
          try {
            const r = await fetch(m.url);
            const ct = r.headers.get("content-type") || "";
            const cl = r.headers.get("content-length") || "?";
            let valid_image = false;
            let body_preview = null;
            // Mapbox returns PNG for vector styles (light, outdoors) and JPEG
            // for satellite imagery. Accept either as a valid render.
            if (r.ok && ct.startsWith("image/")) {
              const buf = await r.arrayBuffer();
              const bytes = new Uint8Array(buf.slice(0, 4));
              const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
              const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
              valid_image = isPng || isJpeg;
            } else if (!r.ok) {
              body_preview = (await r.text()).slice(0, 200);
            }
            renderResults.push({
              target: t.label, type: m.type, data_source: m.data_source,
              url_length: m.url?.length || 0,
              status: r.status, content_type: ct, content_length: cl,
              valid_image, body_preview,
            });
          } catch (e) {
            renderResults.push({ target: t.label, type: m.type, error: e.message });
          }
        }
      }
      return Response.json({
        render_test: true,
        all_valid: renderResults.every((r) => r.valid_image),
        results: renderResults,
        _meta: {
          jurisdiction, state, maps_tested: renderResults.length,
          cache_hits: cacheStats.hits, cache_misses: cacheStats.misses,
          fallbacks, duration_ms: Date.now() - t0,
        },
      });
    }

    // Dev/test inspection mode — strips heavy URL strings so _meta is visible.
    const responseTargets = _meta_only
      ? targetResults.map((t) => ({
          label: t.label,
          maps: t.maps.map((m) => ({
            type: m.type,
            data_source: m.data_source,
            url_kb: Math.round((typeof m.url === "string" ? m.url.length : 0) / 1024),
          })),
        }))
      : targetResults;

    return Response.json({
      targets: responseTargets,
      _meta: {
        jurisdiction, state, agent_name,
        maps_generated,
        cache_hits: cacheStats.hits,
        cache_misses: cacheStats.misses,
        fallbacks,
        duration_ms: Date.now() - t0,
      },
    });
  } catch (error) {
    console.log(`[ERROR] scipMapSuite: ${error.message}`);
    return Response.json({
      targets: [],
      _meta: { error: error.message, duration_ms: Date.now() - t0 },
    }, { status: 500 });
  }
});