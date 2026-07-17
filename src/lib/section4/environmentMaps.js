/**
 * section4/environmentMaps — aerial, topography, FEMA floodplain, wetlands and
 * wind-speed renderers for the HAWK TARGET A MAP SUITE. Every map centers on
 * Target A and reuses the shared helpers in mapCore.
 */

import {
  SAT_STYLE, LIGHT_STYLE, USGS_CONTOUR_URL, NFHL_EXPORT, NWI_WMS_URL,
  makeMap, buildCircle, ringBbox, fitToRing, addTowerMarker, shAddContours, shAddWetlandsBlue,
} from "./mapCore";

// ────────────── 1. AERIAL ──────────────
// Satellite centered on Target A + the SARF search ring (Section 1 radius) with
// its center waypoint pin + a tower icon on Target A.
export async function renderAerial(container, target, srcLat, srcLon, radiusMiles, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 14);
  // Surface Mapbox internal errors (tile/auth failures) to the console.
  map.on("error", (e) => console.error("[AERIAL DIAG] Mapbox error event:", e?.error || e));
  return new Promise((resolve) => {
    map.on("load", () => {
      const ring = buildCircle(srcLat, srcLon, radiusMiles);
      map.addSource("s4-ring", { type: "geojson", data: ring });
      map.addLayer({ id: "s4-ring-fill", type: "fill", source: "s4-ring", paint: { "fill-color": "#facc15", "fill-opacity": 0.07 } });
      map.addLayer({ id: "s4-ring-line", type: "line", source: "s4-ring", paint: { "line-color": "#facc15", "line-width": 3 } });

      // SARF center waypoint pin
      const c = document.createElement("div");
      c.style.cssText = `width:20px;height:20px;border-radius:50%;background:#06b6d4;border:3px solid #fff;box-shadow:0 0 0 2px #06b6d4,0 0 12px rgba(6,182,212,0.8);`;
      new window.mapboxgl.Marker({ element: c, anchor: "center" })
        .setLngLat([srcLon, srcLat])
        .setPopup(new window.mapboxgl.Popup({ offset: 16 }).setHTML(`<div style="font-family:monospace;font-size:11px;"><strong>SEARCH CENTER</strong><br/>${srcLat.toFixed(6)}, ${srcLon.toFixed(6)}</div>`))
        .addTo(map);

      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, srcLat, srcLon, radiusMiles);
      resolve(map);
    });
  });
}

// ────────────── 2. TOPOGRAPHY ──────────────
// USGS contour raster overlay (contour lines + AMSL ft labels are baked into the
// USGS contour service) on a satellite base, bound to the Target A vicinity.
export async function renderTopo(container, target, token, srcLat, srcLon, radiusMiles = 0.6) {
  const { latitude: lat, longitude: lon, owner } = target;
  const cLat = Number.isFinite(srcLat) ? srcLat : lat;
  const cLon = Number.isFinite(srcLon) ? srcLon : lon;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 14);
  return new Promise((resolve) => {
    map.on("load", () => {
      const [w, s, e, n] = ringBbox(lat, lon, 0.6);
      // Show BOTH the contour lines AND their elevation-foot labels across the
      // medium- and large-scale bands. Requesting only the group layer IDs
      // (9,14,19) drops the label feature sub-layers, so the contour feet stop
      // rendering. We list the contour + label feature layers explicitly:
      //   10-13  → 100-ft band (Index/Intermediate contours + labels)
      //   15-18  → 50-ft band (Index/Intermediate contours + labels)
      //   21,22  → large-scale Normal Index/Intermediate LABELS (the feet)
      //   25,26  → large-scale Normal Index/Intermediate contour lines
      const contourLayers = "10,11,12,13,15,16,17,18,21,22,25,26";
      const tileUrl =
        `${USGS_CONTOUR_URL}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
        `&size=512,512&dpi=96&format=png32&transparent=true&layers=show:${contourLayers}&f=image`;
      map.addSource("s4-contours", { type: "raster", tiles: [tileUrl], tileSize: 512, bounds: [w, s, e, n] });
      map.addLayer({ id: "s4-contours-layer", type: "raster", source: "s4-contours", paint: { "raster-opacity": 0.9 } });
      shAddContours(map); // bright orange contours + AMSL ft labels (additive)

      // SARF search ring
      const ring = buildCircle(cLat, cLon, radiusMiles);
      map.addSource("s4-topo-ring", { type: "geojson", data: ring });
      map.addLayer({ id: "s4-topo-ring-fill", type: "fill", source: "s4-topo-ring", paint: { "fill-color": "#facc15", "fill-opacity": 0.07 } });
      map.addLayer({ id: "s4-topo-ring-line", type: "line", source: "s4-topo-ring", paint: { "line-color": "#facc15", "line-width": 3 } });

      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, cLat, cLon, radiusMiles);
      resolve(map);
    });
  });
}

// ────────────── 3. FEMA FLOODPLAIN ──────────────
export async function renderFema(container, target, token, srcLat, srcLon, radiusMiles = 0.6) {
  const { latitude: lat, longitude: lon, owner } = target;
  const cLat = Number.isFinite(srcLat) ? srcLat : lat;
  const cLon = Number.isFinite(srcLon) ? srcLon : lon;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 14);
  return new Promise((resolve) => {
    map.on("load", () => {
      const tileUrl =
        `${NFHL_EXPORT}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
        `&size=512,512&dpi=96&format=png32&transparent=true&layers=show:28&f=image`;
      map.addSource("s4-nfhl", { type: "raster", tiles: [tileUrl], tileSize: 512 });
      map.addLayer({ id: "s4-nfhl-layer", type: "raster", source: "s4-nfhl", paint: { "raster-opacity": 0.6 } });

      // SARF search ring
      const ring = buildCircle(cLat, cLon, radiusMiles);
      map.addSource("s4-fema-ring", { type: "geojson", data: ring });
      map.addLayer({ id: "s4-fema-ring-fill", type: "fill", source: "s4-fema-ring", paint: { "fill-color": "#facc15", "fill-opacity": 0.07 } });
      map.addLayer({ id: "s4-fema-ring-line", type: "line", source: "s4-fema-ring", paint: { "line-color": "#facc15", "line-width": 3 } });

      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, cLat, cLon, radiusMiles);
      resolve(map);
    });
  });
}

// ────────────── 5. WETLANDS ──────────────
export async function renderWetlands(container, target, token, srcLat, srcLon, radiusMiles = 0.5) {
  const { latitude: lat, longitude: lon, owner } = target;
  const cLat = Number.isFinite(srcLat) ? srcLat : lat;
  const cLon = Number.isFinite(srcLon) ? srcLon : lon;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 14);
  return new Promise((resolve) => {
    map.on("load", () => {
      const tileUrl =
        `${NWI_WMS_URL}?service=WMS&request=GetMap&version=1.3.0` +
        `&layers=0&styles=&format=image/png&transparent=true` +
        `&crs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`;
      map.addSource("s4-nwi", { type: "raster", tiles: [tileUrl], tileSize: 256 });
      map.addLayer({ id: "s4-nwi-layer", type: "raster", source: "s4-nwi", paint: { "raster-opacity": 0.85 } });
      shAddWetlandsBlue(map, lat, lon); // ocean-blue NWI polygons (additive, async)

      // SARF search ring
      const ring = buildCircle(cLat, cLon, radiusMiles);
      map.addSource("s4-wetlands-ring", { type: "geojson", data: ring });
      map.addLayer({ id: "s4-wetlands-ring-fill", type: "fill", source: "s4-wetlands-ring", paint: { "fill-color": "#facc15", "fill-opacity": 0.07 } });
      map.addLayer({ id: "s4-wetlands-ring-line", type: "line", source: "s4-wetlands-ring", paint: { "line-color": "#facc15", "line-width": 3 } });

      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, cLat, cLon, radiusMiles);
      resolve(map);
    });
  });
}

// ────────────── 10. WIND SPEED (ASCE 7-22) ──────────────
// Light basemap centered on Target A with the ASCE 7-22 design-wind-speed raster
// (Risk Category II) overlaid as color zones, plus the Target A tower marker. The
// numeric ASCE value prints in the section banner (windSpeedLookup).
const ASCE_WIND_EXPORT =
  "https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Tile_RC_II_new/MapServer/export";

export async function renderWind(container, target, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = await makeMap(container, LIGHT_STYLE, [lon, lat], token, 9);
  map.on("error", (e) => console.error("[WIND MAP DIAG] Mapbox error event:", e?.error || e));
  return new Promise((resolve) => {
    map.on("load", () => {
      const tileUrl =
        `${ASCE_WIND_EXPORT}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
        `&size=512,512&dpi=96&format=png32&transparent=true&layers=show:5&f=image`;
      map.addSource("s4-wind", { type: "raster", tiles: [tileUrl], tileSize: 512 });
      map.addLayer({ id: "s4-wind-layer", type: "raster", source: "s4-wind", paint: { "raster-opacity": 0.55 } });
      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, 5);
      resolve(map);
    });
  });
}