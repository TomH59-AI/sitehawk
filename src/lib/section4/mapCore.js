/**
 * section4/mapCore — shared Mapbox GL helpers used by every Section 4 map
 * renderer: constants, geometry helpers, the idempotent Mapbox loader, makeMap
 * (crisp mode + size gate), the Target A tower marker, ring-fit helper, the
 * additive contour/wetlands overlays, and small geometry utilities.
 */

export const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
export const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
export const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
export const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";

export const USGS_CONTOUR_URL =
  "https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/export";
export const NFHL_EXPORT =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export";
export const NWI_WMS_URL =
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

export function ringBbox(lat, lon, radiusMiles = 1.0) {
  const ring = buildCircle(lat, lon, radiusMiles);
  const lons = ring.geometry.coordinates[0].map((c) => c[0]);
  const lats = ring.geometry.coordinates[0].map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dP = ((lat2 - lat1) * Math.PI) / 180;
  const dL = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dP / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dL / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parcelCentroid(geometry) {
  // Average ring vertices — good enough for a zoneDetail point lookup.
  let coords = [];
  if (geometry?.type === "Polygon") coords = geometry.coordinates?.[0] || [];
  else if (geometry?.type === "MultiPolygon") coords = geometry.coordinates?.[0]?.[0] || [];
  if (!coords.length) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of coords) { sx += x; sy += y; }
  return { lon: sx / coords.length, lat: sy / coords.length };
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

// Wait for the container to report real (non-zero) dimensions before resolving.
// Mirrors the proven Section 5 fix: Mapbox GL cannot measure a 0×0 container —
// it never paints tiles and `map.on("load")` never fires, leaving a black map.
// Sub-step panels flip visible in the SAME render that calls the renderer, so on
// first paint the container can still be 0×0. Poll on animation frames (~3s cap).
function waitForContainerSize(container, tag = "[S4 DIAG]") {
  return new Promise((resolve) => {
    let frames = 0;
    const check = () => {
      const w = container?.clientWidth || 0;
      const h = container?.clientHeight || 0;
      if ((w > 0 && h > 0) || frames > 180) {
        if (frames > 180) console.warn(`${tag} container still ${w}×${h} after wait — building anyway`);
        else console.log(`${tag} container sized ${w}×${h} — constructing map`);
        return resolve();
      }
      frames += 1;
      requestAnimationFrame(check);
    };
    check();
  });
}

// NOTE: async — every renderer awaits makeMap before wiring `on("load")` so the
// size-gate has resolved and the container is measurable.
export async function makeMap(container, style, center, token, zoom = 14) {
  await waitForContainerSize(container);
  window.mapboxgl.accessToken = token;
  // 🔥 CRISP MODE — render at a higher device-pixel ratio (clamped to 2.5) so
  // satellite imagery, parcel/zoning lines and labels are retina-sharp, and
  // exports (preserveDrawingBuffer) come out crisp too. antialias smooths
  // polygon + line edges. This only affects render quality — no renderer logic.
  const crispDpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 2.5);
  const map = new window.mapboxgl.Map({
    container, style, center, zoom,
    preserveDrawingBuffer: true,
    antialias: true,
    pixelRatio: crispDpr,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
  return map;
}

// Small cell-tower SVG icon marker on Target A.
const TOWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4 19 20"/><path d="M19 4 5 20"/><path d="M12 4v16"/><path d="M8.5 9h7"/><path d="M7 13h10"/></svg>`;

export function addTowerMarker(map, lat, lon, label) {
  const el = document.createElement("div");
  el.style.cssText = `
    width: 30px; height: 30px; display:flex; align-items:center; justify-content:center;
    background: rgba(15,23,42,0.92); border: 2px solid ${BRAND_GREEN}; border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(98,140,131,0.5), 0 0 12px rgba(98,140,131,0.8);
  `;
  el.innerHTML = TOWER_SVG;
  // Fallback: if the SVG didn't paint, show a solid circle dot so something
  // always marks Target A.
  if (!el.querySelector("svg")) {
    el.textContent = "";
    const dot = document.createElement("div");
    dot.style.cssText = "width:10px;height:10px;border-radius:50%;background:#fff;";
    el.appendChild(dot);
  }
  new window.mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat([lon, lat])
    .setPopup(
      new window.mapboxgl.Popup({ offset: 20 }).setHTML(
        `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A</strong>${label ? `<br/>${label}` : ""}<br/>${lat.toFixed(6)}, ${lon.toFixed(6)}</div>`
      )
    )
    .addTo(map);
}

export function fitToRing(map, lat, lon, radiusMiles) {
  const [w, s, e, n] = ringBbox(lat, lon, radiusMiles);
  map.fitBounds([[w, s], [e, n]], { padding: 50, duration: 0 });
}

// ============================================================
// SiteHawk Map Layer Upgrade — ADDITIVE ONLY, June 2026
// Additive contour + wetlands overlays. Every new layer is
// prefixed sh- and guarded, so re-runs are safe.
// ============================================================

// Layers that must always stay ON TOP of the new sh- overlays.
const SH_PRIORITY_LAYERS = [
  "s4-target-fill", "s4-target-line", "s4-zoning-target-fill", "s4-zoning-target-line",
  "s4-ring-fill", "s4-ring-line", "s4-sarf-ring-line", "s4-apn-layer", "s4-label-layer",
];

function shGetAnchorLayer(map) {
  for (const id of SH_PRIORITY_LAYERS) {
    if (map.getLayer(id)) return id; // insert new layers just below this
  }
  return undefined; // none found → layers go on top (safe fallback)
}

// Lift any priority layer back to the top — insurance if the anchor lookup missed.
function shLiftPriorityLayers(map) {
  SH_PRIORITY_LAYERS.forEach((id) => {
    if (map.getLayer(id)) map.moveLayer(id);
  });
}

// 1. TOPOGRAPHY — bright orange contour lines + AMSL ft labels from the
// Mapbox Terrain v2 vector tileset. Additive on top of the USGS raster.
export function shAddContours(map) {
  const anchor = shGetAnchorLayer(map);
  if (!map.getSource("sh-contours")) {
    map.addSource("sh-contours", { type: "vector", url: "mapbox://mapbox.mapbox-terrain-v2" });
  }
  if (!map.getLayer("sh-contour-lines")) {
    map.addLayer({
      id: "sh-contour-lines",
      type: "line",
      source: "sh-contours",
      "source-layer": "contour",
      paint: {
        "line-color": "#FF6600", // bright orange
        "line-width": ["case", ["==", ["get", "index"], 10], 2.5, 1.2],
        "line-opacity": 0.9,
      },
    }, anchor);
  }
  if (!map.getLayer("sh-contour-labels")) {
    map.addLayer({
      id: "sh-contour-labels",
      type: "symbol",
      source: "sh-contours",
      "source-layer": "contour",
      filter: ["==", ["get", "index"], 10], // label index contours only
      layout: {
        "symbol-placement": "line",
        "text-field": [
          "concat",
          ["to-string", ["round", ["*", ["get", "ele"], 3.28084]]], // meters → feet
          " ft AMSL",
        ],
        "text-size": 12,
        "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#CC4400",
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 2,
      },
    }, anchor);
  }
  shLiftPriorityLayers(map);
}

// 2. WETLANDS — ocean-blue vector polygons. The existing NWI overlay is a
// raster WMS (can't be restyled), so we fetch the actual NWI wetland polygons
// from the FWS ArcGIS REST service for the map area and draw them ocean blue.
const NWI_QUERY_URL =
  "https://fwsprimary.wim.usgs.gov/server/rest/services/Wetlands/MapServer/0/query";

export async function shAddWetlandsBlue(map, lat, lon) {
  const offset = 0.012; // ~0.8 mi envelope around Target A
  const envelope = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
  let fc = null;
  try {
    const res = await fetch(
      `${NWI_QUERY_URL}?where=1=1&geometry=${envelope}&geometryType=esriGeometryEnvelope&inSR=4326` +
      `&spatialRel=esriSpatialRelIntersects&outFields=WETLAND_TYPE&returnGeometry=true&f=geojson`
    );
    if (res.ok) fc = await res.json();
  } catch (e) {
    console.warn("[WETLANDS DIAG] NWI vector query failed — raster overlay only:", e);
  }
  if (!fc?.features?.length) return;

  const anchor = shGetAnchorLayer(map);
  if (!map.getSource("sh-wetlands")) {
    map.addSource("sh-wetlands", { type: "geojson", data: fc });
  }
  if (!map.getLayer("sh-wetlands-fill")) {
    map.addLayer({
      id: "sh-wetlands-fill",
      type: "fill",
      source: "sh-wetlands",
      paint: {
        "fill-color": "#0077BE",      // ocean blue
        "fill-opacity": 0.65,          // prints solid, imagery still visible
        "fill-outline-color": "#004C7A",
      },
    }, anchor); // BELOW parcel boundary + labels
  }
  if (!map.getLayer("sh-wetlands-outline")) {
    map.addLayer({
      id: "sh-wetlands-outline",
      type: "line",
      source: "sh-wetlands",
      paint: { "line-color": "#004C7A", "line-width": 1.5 },
    }, anchor);
  }
  shLiftPriorityLayers(map);
}