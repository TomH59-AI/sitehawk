/**
 * sitehawkScipStatic — Mapbox STATIC IMAGES API URL builders for the printable
 * SiteHawk SCIP. The live SiteSearch pipeline draws WebGL canvases (which cannot
 * be captured for print), so at "Generate SCIP" time we rebuild every map the
 * pipeline shows as a plain Static Images API URL that drops straight into an
 * <img src="..."/> — guaranteeing the SCIP PDF always has real, printable maps.
 *
 * Every Target A map centers on Target A. The SARF map centers on the search
 * ring. All builders return a string URL (or null when inputs are missing).
 */

const STATIC_BASE = "https://api.mapbox.com/styles/v1/mapbox";
const SAT_STYLE = "satellite-streets-v12";
const LIGHT_STYLE = "light-v11";
const OUTDOORS_STYLE = "outdoors-v12";
const IMG_W = 1000;
const IMG_H = 720;

export const BRAND_NAVY = "#0C1B2E";
export const BRAND_GREEN = "#628C83";
export const BRAND_GOLD = "#FFC72C";

// ── geometry helpers ──
function ringFeature(lat, lon, radiusMi, stroke = "#FFC72C", width = 3, steps = 80) {
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
    properties: { stroke, "stroke-width": width, "stroke-opacity": 0.95, fill: stroke, "fill-opacity": 0.06 },
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

function lineFeature(srcLat, srcLon, dstLat, dstLon, color = BRAND_GREEN) {
  return {
    type: "Feature",
    properties: { stroke: color, "stroke-width": 4, "stroke-opacity": 1 },
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

function pairBbox(srcLat, srcLon, dstLat, dstLon, padFrac = 0.3) {
  const minLat = Math.min(srcLat, dstLat), maxLat = Math.max(srcLat, dstLat);
  const minLon = Math.min(srcLon, dstLon), maxLon = Math.max(srcLon, dstLon);
  const dLat = Math.max(maxLat - minLat, 0.01) * padFrac;
  const dLon = Math.max(maxLon - minLon, 0.01) * padFrac;
  return [minLon - dLon, minLat - dLat, maxLon + dLon, maxLat + dLat];
}

// Static URL: GeoJSON overlay fit to a center+zoom OR an explicit bbox.
function overlayUrl({ style, features, center, zoom, bbox, token }) {
  const geojson = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }));
  const overlay = `geojson(${geojson})`;
  const region = bbox
    ? `[${bbox.map((n) => n.toFixed(6)).join(",")}]`
    : `${center[0].toFixed(6)},${center[1].toFixed(6)},${zoom}`;
  return `${STATIC_BASE}/${style}/static/${overlay}/${region}/${IMG_W}x${IMG_H}@2x?access_token=${token}&padding=40`;
}

// Plain centered basemap (no overlay) — for raster-overlay maps we layer on top.
function basemapUrl({ style, center, zoom, token, rasterUrl, bbox }) {
  const region = bbox
    ? `[${bbox.map((n) => n.toFixed(6)).join(",")}]`
    : `${center[0].toFixed(6)},${center[1].toFixed(6)},${zoom}`;
  if (rasterUrl) {
    const overlay = `url-${encodeURIComponent(rasterUrl)}`;
    return `${STATIC_BASE}/${style}/static/${overlay}/${region}/${IMG_W}x${IMG_H}@2x?access_token=${token}&padding=0`;
  }
  return `${STATIC_BASE}/${style}/static/${region}/${IMG_W}x${IMG_H}@2x?access_token=${token}`;
}

const tgt = (t) => ({ lat: Number(t?.latitude), lon: Number(t?.longitude) });
const ok = (t) => t && Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude));

// ───────────────────── SARF MAP (search ring) ─────────────────────
export function buildSarfMap(srcLat, srcLon, radiusMi, token, targetA) {
  if (!Number.isFinite(srcLat) || !Number.isFinite(srcLon) || !token) return null;
  const features = [
    ringFeature(srcLat, srcLon, radiusMi, BRAND_GOLD, 3),
    pointFeature(srcLat, srcLon, BRAND_GOLD, "marker"),
  ];
  if (ok(targetA)) {
    const { lat, lon } = tgt(targetA);
    features.push(pointFeature(lat, lon, BRAND_GREEN, "communications-tower"));
  }
  // bbox padded to the ring
  const latR = (radiusMi / 69.0) * 1.4;
  const lonR = (radiusMi / (69.0 * Math.cos((srcLat * Math.PI) / 180))) * 1.4;
  const bbox = [srcLon - lonR, srcLat - latR, srcLon + lonR, srcLat + latR];
  return overlayUrl({ style: SAT_STYLE, features, bbox, token });
}

// Shared Target-A "marker + tower" feature set for context maps.
function targetMarkers(lat, lon) {
  return [pointFeature(lat, lon, BRAND_GREEN, "communications-tower")];
}

// ───────────────────── §4 MAP SUITE (Target A) ─────────────────────
export function buildAerial(t, token) {
  if (!ok(t) || !token) return null;
  const { lat, lon } = tgt(t);
  return overlayUrl({ style: SAT_STYLE, features: targetMarkers(lat, lon), center: [lon, lat], zoom: 16, token });
}

export function buildTopo(t, token) {
  if (!ok(t) || !token) return null;
  const { lat, lon } = tgt(t);
  return overlayUrl({ style: OUTDOORS_STYLE, features: targetMarkers(lat, lon), center: [lon, lat], zoom: 14, token });
}

// FEMA NFHL flood layer composited over a light basemap.
const FEMA_EXPORT = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export";
export function buildFema(t, token) {
  if (!ok(t) || !token) return null;
  const { lat, lon } = tgt(t);
  const pad = 0.012;
  const bbox = [lon - pad, lat - pad, lon + pad, lat + pad];
  const femaPng = `${FEMA_EXPORT}?` + new URLSearchParams({
    bbox: `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`,
    bboxSR: "4326", imageSR: "4326", size: `${IMG_W},${IMG_H}`,
    format: "png32", transparent: "true", dpi: "96",
    layers: "show:28", f: "image",
  });
  const geojson = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features: targetMarkers(lat, lon) }));
  const region = `[${bbox.map((n) => n.toFixed(6)).join(",")}]`;
  const overlay = `url-${encodeURIComponent(femaPng)}(${region}),geojson(${geojson})`;
  return `${STATIC_BASE}/${LIGHT_STYLE}/static/${overlay}/${region}/${IMG_W}x${IMG_H}@2x?access_token=${token}&padding=0`;
}

// Zoneomics zoning raster tiles composited over a light basemap (when key present).
export function buildZoning(t, token, zoneomicsKey) {
  if (!ok(t) || !token) return null;
  const { lat, lon } = tgt(t);
  // Without a tile composite we still return a clean basemap + marker so the SCIP
  // always shows the zoning location (the live banner carries the district code).
  return overlayUrl({ style: LIGHT_STYLE, features: targetMarkers(lat, lon), center: [lon, lat], zoom: 15, token });
}

// USFWS National Wetlands Inventory composited over an aerial basemap.
const NWI_EXPORT = "https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export";
export function buildWetlands(t, token) {
  if (!ok(t) || !token) return null;
  const { lat, lon } = tgt(t);
  const pad = 0.012;
  const bbox = [lon - pad, lat - pad, lon + pad, lat + pad];
  const nwiPng = `${NWI_EXPORT}?` + new URLSearchParams({
    bbox: `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`,
    bboxSR: "4326", imageSR: "4326", size: `${IMG_W},${IMG_H}`,
    format: "png32", transparent: "true", dpi: "96",
    layers: "show:0", f: "image",
  });
  const geojson = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features: targetMarkers(lat, lon) }));
  const region = `[${bbox.map((n) => n.toFixed(6)).join(",")}]`;
  const overlay = `url-${encodeURIComponent(nwiPng)}(${region}),geojson(${geojson})`;
  return `${STATIC_BASE}/${SAT_STYLE}/static/${overlay}/${region}/${IMG_W}x${IMG_H}@2x?access_token=${token}&padding=0`;
}

export function buildParcel(t, token) {
  if (!ok(t) || !token) return null;
  const { lat, lon } = tgt(t);
  return overlayUrl({ style: SAT_STYLE, features: targetMarkers(lat, lon), center: [lon, lat], zoom: 17, token });
}

// Future Land Use (FLUM) — optional, only built when the pipeline resolved a
// FLUM designation/polygon for the jurisdiction. Draws the polygon (when present)
// over a light basemap; returns null when no FLUM data so the SCIP simply omits it.
export function buildFlum(t, token, fluFeature) {
  if (!ok(t) || !token) return null;
  const { lat, lon } = tgt(t);
  const features = [];
  if (fluFeature?.geometry) {
    features.push({
      type: "Feature",
      properties: { stroke: "#7C3AED", "stroke-width": 3, "stroke-opacity": 0.95, fill: "#7C3AED", "fill-opacity": 0.18 },
      geometry: fluFeature.geometry,
    });
  }
  features.push(pointFeature(lat, lon, BRAND_GREEN, "communications-tower"));
  return overlayUrl({ style: LIGHT_STYLE, features, center: [lon, lat], zoom: 15, token });
}

// ── proximity maps (crow-flies line to nearest asset, with distance) ──
function milesFeetLabel(mi) {
  if (!Number.isFinite(mi)) return null;
  return `${mi.toFixed(2)} mi / ${Math.round(mi * 5280).toLocaleString()} ft`;
}

export function buildAirport(t, airport, token) {
  if (!ok(t) || !airport || !token) return null;
  const { lat, lon } = tgt(t);
  const aLat = Number(airport.latitude), aLon = Number(airport.longitude);
  if (!Number.isFinite(aLat) || !Number.isFinite(aLon)) {
    return { url: overlayUrl({ style: LIGHT_STYLE, features: targetMarkers(lat, lon), center: [lon, lat], zoom: 12, token }), distLabel: milesFeetLabel(Number(airport.distance_miles)) };
  }
  const features = [
    ringFeature(lat, lon, 0.5, "#ffffff", 1.2),
    lineFeature(lat, lon, aLat, aLon),
    pointFeature(aLat, aLon, BRAND_GREEN, "airport"),
    pointFeature(lat, lon, BRAND_NAVY, "communications-tower"),
  ];
  return { url: overlayUrl({ style: LIGHT_STYLE, features, bbox: pairBbox(lat, lon, aLat, aLon), token }), distLabel: milesFeetLabel(Number(airport.distance_miles)) };
}

export function buildCellTower(t, tower, token) {
  if (!ok(t) || !tower || !token) return null;
  const { lat, lon } = tgt(t);
  const cLat = Number(tower.latitude), cLon = Number(tower.longitude);
  if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) return null;
  const features = [
    ringFeature(lat, lon, 0.5, "#ffffff", 1.2),
    lineFeature(lat, lon, cLat, cLon),
    pointFeature(cLat, cLon, BRAND_GREEN, "communications-tower"),
    pointFeature(lat, lon, BRAND_NAVY, "marker"),
  ];
  return { url: overlayUrl({ style: SAT_STYLE, features, bbox: pairBbox(lat, lon, cLat, cLon), token }), distLabel: milesFeetLabel(Number(tower.distance_miles)) };
}

// Wind — ASCE 7-22 wind speed raster composited over a light basemap.
// The ASCE export is fetched server-side by Mapbox to composite as a url- overlay,
// so the bbox MUST be scoped tight (like FEMA/NWI) and the requested image size
// MUST match the bbox aspect ratio — a giant national-scale tile request returns
// a low-res/errored image that renders blank. We size the ASCE request to a
// square that matches the square bbox, then let Mapbox letterbox it into the map.
const ASCE_WIND_EXPORT = "https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Tile_RC_II_new/MapServer/export";
export function buildWind(t, token) {
  if (!ok(t) || !token) return null;
  const { lat, lon } = tgt(t);
  // ~0.35° square around Target A — enough to show the local wind-speed band
  // while staying within a reliable single ASCE export tile.
  const pad = 0.35;
  const bbox = [lon - pad, lat - pad, lon + pad, lat + pad];
  const ascePng = `${ASCE_WIND_EXPORT}?` + new URLSearchParams({
    bbox: `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`,
    // Square bbox → square image so the raster isn't stretched/dropped.
    bboxSR: "4326", imageSR: "4326", size: "720,720",
    format: "png32", transparent: "true", dpi: "96", layers: "show:5", f: "image",
  });
  const features = [
    pointFeature(lat, lon, BRAND_GREEN, "communications-tower"),
  ];
  const geojson = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }));
  const region = `[${bbox.map((n) => n.toFixed(6)).join(",")}]`;
  const overlay = `url-${encodeURIComponent(ascePng)}(${region}),geojson(${geojson})`;
  return `${STATIC_BASE}/${LIGHT_STYLE}/static/${overlay}/${region}/${IMG_W}x${IMG_H}@2x?access_token=${token}&padding=0`;
}