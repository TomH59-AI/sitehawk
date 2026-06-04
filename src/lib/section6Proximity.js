/**
 * section6Proximity — Mapbox STATIC IMAGES API URL builders for the HAWK
 * PROXIMITY & ENVIRONMENT VISION (Section 6). No WebGL, no live canvas — each
 * "render" function returns a plain Static Images API URL that drops straight
 * into an <img src="..."/> tag, so the maps can never paint black.
 *
 * Reuses the SAME working backend integrations:
 *   - airport  → nearestAirportFromDirectory (FAA "Airports" dataset)
 *   - celltower→ cellTowerLookup (FCC ASR + OpenCellID merge, already deduped)
 *   - wind     → windSpeedLookup (ASCE 7-22, value shown in the banner)
 *
 * Every map centers on TARGET A only and draws a brand-green crow-flies line +
 * markers via GeoJSON overlay. Distances print in BOTH miles and feet alongside.
 */

const STATIC_BASE = "https://api.mapbox.com/styles/v1/mapbox";
const LIGHT_STYLE = "light-v11";
const SAT_STYLE = "satellite-streets-v12";
const IMG_W = 1000;
const IMG_H = 540;

export const BRAND_GREEN = "#628C83";

// ────────────── geometry helpers ──────────────
function ringFeature(lat, lon, radiusMi, steps = 72) {
  const coords = [];
  const latR = radiusMi / 69.0;
  const lonR = radiusMi / (69.0 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([
      +(lon + lonR * Math.cos(t)).toFixed(6),
      +(lat + latR * Math.sin(t)).toFixed(6),
    ]);
  }
  return {
    type: "Feature",
    properties: { stroke: "#ffffff", "stroke-width": 1.5, "stroke-opacity": 0.6, fill: "#ffffff", "fill-opacity": 0 },
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

function lineFeature(srcLat, srcLon, dstLat, dstLon) {
  return {
    type: "Feature",
    properties: { stroke: BRAND_GREEN, "stroke-width": 4, "stroke-opacity": 1 },
    geometry: { type: "LineString", coordinates: [[srcLon, srcLat], [dstLon, dstLat]] },
  };
}

function pointFeature(lat, lon, color, symbol) {
  return {
    type: "Feature",
    properties: { "marker-color": color, "marker-size": "medium", ...(symbol ? { "marker-symbol": symbol } : {}) },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}

// Compute a [minLon,minLat,maxLon,maxLat] bbox padded around the two points.
function pairBbox(srcLat, srcLon, dstLat, dstLon, padFrac = 0.25) {
  const minLat = Math.min(srcLat, dstLat);
  const maxLat = Math.max(srcLat, dstLat);
  const minLon = Math.min(srcLon, dstLon);
  const maxLon = Math.max(srcLon, dstLon);
  const dLat = Math.max(maxLat - minLat, 0.01) * padFrac;
  const dLon = Math.max(maxLon - minLon, 0.01) * padFrac;
  return [minLon - dLon, minLat - dLat, maxLon + dLon, maxLat + dLat];
}

function milesFeetLabel(mi) {
  const ft = Math.round(mi * 5280).toLocaleString();
  return `${mi.toFixed(2)} mi / ${ft} ft`;
}

// Build a Static Images API URL with a GeoJSON overlay fit to a bbox.
function staticUrl({ style, features, bbox, token, width = IMG_W, height = IMG_H }) {
  const geojson = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }));
  const overlay = `geojson(${geojson})`;
  const region = bbox
    ? `[${bbox.map((n) => n.toFixed(6)).join(",")}]`
    : "auto";
  return `${STATIC_BASE}/${style}/static/${overlay}/${region}/${width}x${height}@2x?access_token=${token}&padding=60`;
}

// ────────────── 1. CLOSEST AIRPORT ──────────────
// Returns { url, distLabel }. `airport` = nearestAirportFromDirectory match.
export function buildAirportMap(target, airport, token) {
  const lat = Number(target.latitude), lon = Number(target.longitude);
  const aLat = Number(airport.latitude), aLon = Number(airport.longitude);
  const distMi = Number(airport.distance_miles);
  const features = [
    ringFeature(lat, lon, 0.25), ringFeature(lat, lon, 0.5), ringFeature(lat, lon, 1),
    lineFeature(lat, lon, aLat, aLon),
    pointFeature(aLat, aLon, BRAND_GREEN, "airport"),
    pointFeature(lat, lon, "#0f172a", "communications-tower"),
  ];
  const bbox = pairBbox(lat, lon, aLat, aLon);
  return { url: staticUrl({ style: LIGHT_STYLE, features, bbox, token }), distLabel: milesFeetLabel(distMi) };
}

// ────────────── 2. CLOSEST CELL TOWER ──────────────
// Returns { url, distLabel }. `tower` = cellTowerLookup nearest_tower.
export function buildCellTowerMap(target, tower, token) {
  const lat = Number(target.latitude), lon = Number(target.longitude);
  const tLat = Number(tower.latitude_deg), tLon = Number(tower.longitude_deg);
  const distMi = Number(tower.distance_miles);
  const features = [
    ringFeature(lat, lon, 0.25), ringFeature(lat, lon, 0.5), ringFeature(lat, lon, 1),
    lineFeature(lat, lon, tLat, tLon),
    pointFeature(tLat, tLon, BRAND_GREEN, "communications-tower"),
    pointFeature(lat, lon, "#0f172a", "marker"),
  ];
  const bbox = pairBbox(lat, lon, tLat, tLon);
  return { url: staticUrl({ style: SAT_STYLE, features, bbox, token }), distLabel: milesFeetLabel(distMi) };
}

// ────────────── 3. WIND SPEED ──────────────
// ASCE 7-22 wind speed zones, centered on Target A. We composite the actual ASCE
// 722 wind-speed raster (exported as a transparent PNG over the area) onto the
// Mapbox static basemap using the Static Images API `url-...` overlay so the map
// genuinely shows the wind-speed color zones — not just blank rings. The numeric
// ASCE value still prints in the banner (windSpeedLookup).
const ASCE_WIND_EXPORT =
  "https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Tile_RC_II_new/MapServer/export";

export function buildWindMap(target, token) {
  const lat = Number(target.latitude), lon = Number(target.longitude);
  // ~0.5° box (~35 mi) so the wind-speed zone gradient is visible around the site.
  const pad = 0.5;
  const bbox = [lon - pad, lat - pad, lon + pad, lat + pad];

  // Build the ASCE wind-speed raster export URL (transparent PNG, EPSG:4326).
  const ascePng = `${ASCE_WIND_EXPORT}?` + new URLSearchParams({
    bbox: `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`,
    bboxSR: "4326",
    imageSR: "4326",
    size: `${IMG_W},${IMG_H}`,
    format: "png32",
    transparent: "true",
    layers: "show:5",
    f: "image",
  });

  const features = [
    ringFeature(lat, lon, 1), ringFeature(lat, lon, 3), ringFeature(lat, lon, 5),
    pointFeature(lat, lon, BRAND_GREEN, "communications-tower"),
  ];
  const geojson = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }));
  const region = `[${bbox.map((n) => n.toFixed(6)).join(",")}]`;
  // Composite: ASCE wind raster (bottom) → GeoJSON rings + tower (top).
  const overlay = `url-${encodeURIComponent(ascePng)}(${region}),geojson(${geojson})`;
  const url = `${STATIC_BASE}/${LIGHT_STYLE}/static/${overlay}/${region}/${IMG_W}x${IMG_H}@2x?access_token=${token}&padding=0`;
  return { url, distLabel: null };
}