/**
 * section4Maps — shared Mapbox GL helpers + the six Target-A map renderers for
 * the HAWK TARGET A MAP SUITE (Section 4). Each renderer reuses the SAME working
 * API integrations that previously lived in the auto-firing SCIP components:
 *   - aerial   → Mapbox satellite + SARF ring + tower pin
 *   - topo     → USGS contour raster overlay
 *   - fema     → FEMA NFHL flood hazard layer 28
 *   - zoning   → Zoneomics zoning overlay (light basemap)
 *   - wetlands → USFWS NWI WMS overlay
 *   - parcel   → Realie parcels drawn from a GeoJSON FeatureCollection
 *
 * Every map centers on TARGET A only.
 */

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";

const USGS_CONTOUR_URL =
  "https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/export";
const NFHL_EXPORT =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export";
const NWI_WMS_URL =
  "https://www.fws.gov/wetlandsmapservice/services/Wetlands/MapServer/WMSServer";

export const BRAND_GREEN = "#628C83";

// ────────────── geometry helpers ──────────────
export function buildCircle(lat, lon, radiusMiles, steps = 96) {
  const R = 3958.7613;
  const d = radiusMiles / R;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (i * 2 * Math.PI) / steps;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
    );
    const lon2 =
      lonRad +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(lat2)
      );
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}

function ringBbox(lat, lon, radiusMiles = 1.0) {
  const ring = buildCircle(lat, lon, radiusMiles);
  const lons = ring.geometry.coordinates[0].map((c) => c[0]);
  const lats = ring.geometry.coordinates[0].map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

// ────────────── Mapbox GL JS loader (idempotent, shared) ──────────────
let mapboxLoadingPromise = null;
export async function ensureMapboxLoaded() {
  if (window.mapboxgl) return;
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = MAPBOX_CSS;
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = MAPBOX_JS;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  await mapboxLoadingPromise;
}

function makeMap(container, style, center, token, zoom = 14) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style, center, zoom, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
  return map;
}

// Tower-icon marker on Target A.
function addTowerMarker(map, lat, lon, label) {
  const el = document.createElement("div");
  el.style.cssText = `
    width: 30px; height: 30px; display:flex; align-items:center; justify-content:center;
    background: rgba(15,23,42,0.92); border: 2px solid ${BRAND_GREEN}; border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(98,140,131,0.5), 0 0 12px rgba(98,140,131,0.8); font-size: 15px;
  `;
  el.textContent = "📡";
  new window.mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat([lon, lat])
    .setPopup(
      new window.mapboxgl.Popup({ offset: 20 }).setHTML(
        `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A</strong>${label ? `<br/>${label}` : ""}<br/>${lat.toFixed(6)}, ${lon.toFixed(6)}</div>`
      )
    )
    .addTo(map);
}

function fitToRing(map, lat, lon, radiusMiles) {
  const [w, s, e, n] = ringBbox(lat, lon, radiusMiles);
  map.fitBounds([[w, s], [e, n]], { padding: 50, duration: 0 });
}

// ────────────── 1. AERIAL ──────────────
// Satellite centered on Target A + the SARF search ring (Section 1 radius) with
// its center waypoint pin + a tower icon on Target A.
export function renderAerial(container, target, srcLat, srcLon, radiusMiles, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = makeMap(container, SAT_STYLE, [lon, lat], token, 14);
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
export function renderTopo(container, target, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = makeMap(container, SAT_STYLE, [lon, lat], token, 14);
  return new Promise((resolve) => {
    map.on("load", () => {
      const [w, s, e, n] = ringBbox(lat, lon, 0.6);
      const tileUrl =
        `${USGS_CONTOUR_URL}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
        `&size=512,512&dpi=96&format=png32&transparent=true&layers=show:9,14,19&f=image`;
      map.addSource("s4-contours", { type: "raster", tiles: [tileUrl], tileSize: 512, bounds: [w, s, e, n] });
      map.addLayer({ id: "s4-contours-layer", type: "raster", source: "s4-contours", paint: { "raster-opacity": 0.9 } });
      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, 0.6);
      resolve(map);
    });
  });
}

// ────────────── 3. FEMA FLOODPLAIN ──────────────
export function renderFema(container, target, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = makeMap(container, SAT_STYLE, [lon, lat], token, 14);
  return new Promise((resolve) => {
    map.on("load", () => {
      const tileUrl =
        `${NFHL_EXPORT}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
        `&size=512,512&dpi=96&format=png32&transparent=true&layers=show:28&f=image`;
      map.addSource("s4-nfhl", { type: "raster", tiles: [tileUrl], tileSize: 512 });
      map.addLayer({ id: "s4-nfhl-layer", type: "raster", source: "s4-nfhl", paint: { "raster-opacity": 0.6 } });
      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, 0.6);
      resolve(map);
    });
  });
}

// ────────────── 4. ZONING ──────────────
// Zoneomics zoning overlay on a light basemap centered on Target A. Zoneomics
// publishes its zoning tile service at the standard /zoneTiles endpoint.
export function renderZoning(container, target, token, zoneomicsKey) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = makeMap(container, LIGHT_STYLE, [lon, lat], token, 15);
  return new Promise((resolve) => {
    map.on("load", () => {
      if (zoneomicsKey) {
        const tileUrl =
          `https://tiles.zoneomics.com/tiles/zone/{z}/{x}/{y}.png?api_key=${zoneomicsKey}`;
        map.addSource("s4-zoning", { type: "raster", tiles: [tileUrl], tileSize: 256 });
        map.addLayer({ id: "s4-zoning-layer", type: "raster", source: "s4-zoning", paint: { "raster-opacity": 0.55 } });
      }
      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, 0.4);
      resolve(map);
    });
  });
}

// ────────────── 5. WETLANDS ──────────────
export function renderWetlands(container, target, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = makeMap(container, SAT_STYLE, [lon, lat], token, 14);
  return new Promise((resolve) => {
    map.on("load", () => {
      const tileUrl =
        `${NWI_WMS_URL}?service=WMS&request=GetMap&version=1.3.0` +
        `&layers=0&styles=&format=image/png&transparent=true` +
        `&crs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`;
      map.addSource("s4-nwi", { type: "raster", tiles: [tileUrl], tileSize: 256 });
      map.addLayer({ id: "s4-nwi-layer", type: "raster", source: "s4-nwi", paint: { "raster-opacity": 0.85 } });
      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, 0.5);
      resolve(map);
    });
  });
}

// ────────────── 6. PARCEL (Realie) ──────────────
// Draw Target A parcel boundary in brand green + adjacent parcels in light grey.
// `parcels` = array of normalized Realie records (with parcel_geometry when present).
export function renderParcel(container, target, parcels, token) {
  const { latitude: lat, longitude: lon, owner, apn } = target;
  const map = makeMap(container, SAT_STYLE, [lon, lat], token, 16);
  return new Promise((resolve) => {
    map.on("load", () => {
      // Adjacent parcels — light grey outlines (only those with geometry).
      const adj = {
        type: "FeatureCollection",
        features: (parcels || [])
          .filter((p) => p.parcel_geometry && p.apn !== apn)
          .map((p) => ({ type: "Feature", geometry: p.parcel_geometry, properties: { apn: p.apn || "" } })),
      };
      if (adj.features.length) {
        map.addSource("s4-adj", { type: "geojson", data: adj });
        map.addLayer({ id: "s4-adj-line", type: "line", source: "s4-adj", paint: { "line-color": "#cbd5e1", "line-width": 1.5 } });
      }

      // Target A parcel — brand green highlight (if its geometry is available).
      const targetParcel = (parcels || []).find((p) => p.apn === apn && p.parcel_geometry);
      if (targetParcel) {
        const fc = { type: "Feature", geometry: targetParcel.parcel_geometry, properties: {} };
        map.addSource("s4-target", { type: "geojson", data: fc });
        map.addLayer({ id: "s4-target-fill", type: "fill", source: "s4-target", paint: { "fill-color": BRAND_GREEN, "fill-opacity": 0.3 } });
        map.addLayer({ id: "s4-target-line", type: "line", source: "s4-target", paint: { "line-color": BRAND_GREEN, "line-width": 3 } });
      }

      // Label + tower marker on Target A.
      const labelText = `${owner || "Owner —"}${apn ? ` · ${apn}` : ""}`;
      map.addSource("s4-label", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { label: labelText } }] },
      });
      map.addLayer({
        id: "s4-label-layer", type: "symbol", source: "s4-label",
        layout: { "text-field": ["get", "label"], "text-size": 13, "text-offset": [0, 2], "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true },
        paint: { "text-color": "#fff", "text-halo-color": BRAND_GREEN, "text-halo-width": 2.5 },
      });
      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, 0.3);
      resolve(map);
    });
  });
}