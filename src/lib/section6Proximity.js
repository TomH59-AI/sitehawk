/**
 * section6Proximity — Mapbox GL renderers for the HAWK PROXIMITY & ENVIRONMENT
 * VISION (Section 6). Three Target-A maps, each rewired under its own gated
 * button. Reuses the SAME working backend integrations:
 *   - airport  → nearestAirportFromDirectory (FAA "Airports" dataset)
 *   - celltower→ cellTowerLookup (FCC ASR + OpenCellID merge, already deduped)
 *   - wind     → windSpeedLookup (ASCE 7-22, preserved as-is)
 *
 * Every map centers on TARGET A only, uses the Mapbox light-streets base, and a
 * brand-green (#628C83) crow-flies line + tower icon. Distances print in BOTH
 * miles and feet on/alongside the connecting line.
 */

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";

export const BRAND_GREEN = "#628C83";

// ────────────── geometry helpers ──────────────
function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
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

function makeMap(container, center, token, zoom = 11) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: LIGHT_STYLE, center, zoom, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
  return map;
}

// Brand-green tower icon at the Target A centerpoint.
function addTowerMarker(map, lat, lon, label) {
  const el = document.createElement("div");
  el.style.cssText = `
    width:30px;height:30px;display:flex;align-items:center;justify-content:center;
    background:rgba(15,23,42,0.92);border:2px solid ${BRAND_GREEN};border-radius:50%;
    box-shadow:0 0 0 2px rgba(98,140,131,0.5),0 0 12px rgba(98,140,131,0.8);font-size:15px;`;
  el.textContent = "📡";
  new window.mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat([lon, lat])
    .setPopup(new window.mapboxgl.Popup({ offset: 20 }).setHTML(
      `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A</strong>${label ? `<br/>${label}` : ""}<br/>${lat.toFixed(6)}, ${lon.toFixed(6)}</div>`
    ))
    .addTo(map);
}

// Crow-flies line from Target A → destination + a distance label at the midpoint.
function addCrowLine(map, srcLat, srcLon, dstLat, dstLon, distLabel) {
  const line = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[srcLon, srcLat], [dstLon, dstLat]] },
    properties: {},
  };
  map.addSource("s6-line", { type: "geojson", data: line });
  map.addLayer({
    id: "s6-line-layer", type: "line", source: "s6-line",
    layout: { "line-cap": "round" },
    paint: { "line-color": BRAND_GREEN, "line-width": 3, "line-dasharray": [2, 1] },
  });

  const mid = midpoint([srcLon, srcLat], [dstLon, dstLat]);
  map.addSource("s6-dist", {
    type: "geojson",
    data: { type: "Feature", geometry: { type: "Point", coordinates: mid }, properties: { label: distLabel } },
  });
  map.addLayer({
    id: "s6-dist-layer", type: "symbol", source: "s6-dist",
    layout: {
      "text-field": ["get", "label"], "text-size": 13,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true,
    },
    paint: { "text-color": "#fff", "text-halo-color": BRAND_GREEN, "text-halo-width": 2.5 },
  });
}

// Destination marker (airport / tower) with a multi-line label popup.
function addDestMarker(map, lat, lon, glyph, color, html) {
  const el = document.createElement("div");
  el.style.cssText = `
    width:28px;height:28px;display:flex;align-items:center;justify-content:center;
    background:#fff;border:2px solid ${color};border-radius:50%;
    box-shadow:0 0 0 2px ${color}55;font-size:14px;`;
  el.textContent = glyph;
  new window.mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat([lon, lat])
    .setPopup(new window.mapboxgl.Popup({ offset: 18 }).setHTML(html))
    .addTo(map);
}

// Fit map to both points with padding.
function fitToPair(map, srcLat, srcLon, dstLat, dstLon) {
  const bounds = new window.mapboxgl.LngLatBounds([srcLon, srcLat], [srcLon, srcLat]);
  bounds.extend([dstLon, dstLat]);
  map.fitBounds(bounds, { padding: 80, duration: 0, maxZoom: 13 });
}

function milesFeetLabel(mi) {
  const ft = Math.round(mi * 5280).toLocaleString();
  return `${mi.toFixed(2)} mi / ${ft} ft`;
}

// ────────────── 1. CLOSEST AIRPORT ──────────────
// `airport` = nearestAirportFromDirectory match { callnumber, type, name,
// latitude, longitude, distance_miles, distance_feet }.
export function renderAirport(container, target, airport, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const aLat = Number(airport.latitude);
  const aLon = Number(airport.longitude);
  const distMi = Number(airport.distance_miles);
  const map = makeMap(container, [lon, lat], token, 11);
  return new Promise((resolve) => {
    map.on("load", () => {
      addCrowLine(map, lat, lon, aLat, aLon, milesFeetLabel(distMi));
      const callLetters = airport.callnumber || "—";
      const html =
        `<div style="font-family:monospace;font-size:11px;line-height:1.4;">` +
        `<strong>${callLetters}</strong>${airport.type ? ` · ${String(airport.type).replace(/_/g, " ")}` : ""}<br/>` +
        `${airport.name || "Airport"}<br/>${aLat.toFixed(5)}, ${aLon.toFixed(5)}</div>`;
      addDestMarker(map, aLat, aLon, "✈️", BRAND_GREEN, html);
      addTowerMarker(map, lat, lon, owner);
      fitToPair(map, lat, lon, aLat, aLon);
      resolve(map);
    });
  });
}

// ────────────── 2. CLOSEST CELL TOWER ──────────────
// `tower` = cellTowerLookup nearest_tower { call_letters, structure_type,
// licensee, tower_registration_number, fcc_url, latitude_deg, longitude_deg,
// distance_miles, source }.
export function renderCellTower(container, target, tower, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const tLat = Number(tower.latitude_deg);
  const tLon = Number(tower.longitude_deg);
  const distMi = Number(tower.distance_miles);
  const map = makeMap(container, [lon, lat], token, 12);
  return new Promise((resolve) => {
    map.on("load", () => {
      addCrowLine(map, lat, lon, tLat, tLon, milesFeetLabel(distMi));
      const asrn = tower.tower_registration_number
        ? `ASR #${tower.tower_registration_number}`
        : (tower.source || "OpenCellID");
      const height = tower.structure_height_ft || tower.overall_height_ft || tower.height_ft;
      const html =
        `<div style="font-family:monospace;font-size:11px;line-height:1.4;">` +
        `<strong>${asrn}</strong><br/>` +
        `${tower.licensee || "Operator —"}${tower.structure_type ? ` · ${tower.structure_type}` : ""}<br/>` +
        `${height ? `Height: ${height} ft<br/>` : ""}` +
        `${tLat.toFixed(5)}, ${tLon.toFixed(5)}</div>`;
      addDestMarker(map, tLat, tLon, "🗼", BRAND_GREEN, html);
      addTowerMarker(map, lat, lon, owner);
      fitToPair(map, lat, lon, tLat, tLon);
      resolve(map);
    });
  });
}

// ────────────── 3. WIND SPEED ──────────────
// Preserve the EXISTING wind rendering: ASCE 7-22 wind-speed-zone raster overlay
// (w2022_Tile_RC_II_new, layer 5) draped on the light base, centered on Target A.
// The numeric value comes from the existing windSpeedLookup function (banner).
const ASCE_EXPORT =
  "https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Tile_RC_II_new/MapServer/export";
export function renderWind(container, target, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = makeMap(container, [lon, lat], token, 9);
  return new Promise((resolve) => {
    map.on("load", () => {
      const tileUrl =
        `${ASCE_EXPORT}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
        `&size=512,512&dpi=96&format=png32&transparent=true&layers=show:5&f=image`;
      map.addSource("s6-wind", { type: "raster", tiles: [tileUrl], tileSize: 512 });
      map.addLayer({ id: "s6-wind-layer", type: "raster", source: "s6-wind", paint: { "raster-opacity": 0.55 } });
      addTowerMarker(map, lat, lon, owner);
      map.setZoom(8);
      resolve(map);
    });
  });
}