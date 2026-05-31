/**
 * section5Viewsheds — renderers for the HAWK RF VIEWSHED VISION (Section 5).
 *
 * PRIMARY engine: Cesium Ion (terrain + global high-res imagery) in 2D top-down
 * (SCENE2D) so the RF engineer reads coverage like a map. A transparent colored
 * sector cone is drawn from the Target A tower along each cardinal bearing.
 *
 * FALLBACK: Mapbox GL (satellite + terrain-rgb DEM) with the same sector cone
 * overlay, used when Cesium fails to load / init for the AOI.
 *
 * Obstruction stats (% blocked / % clear) come from the EXISTING scipViewshed
 * backend function — reused as-is (same endpoint, same response shape).
 *
 * Every map centers on TARGET A only.
 */

import { loadPublicConfig } from "@/lib/publicConfig";

export const BRAND_GREEN = "#628C83";

// Four cardinal directions. Each its own cone color (35% opacity overlays).
export const DIRECTIONS = {
  N: { short: "N", label: "North Viewshed", bearing: 0,   spread: 45, color: "#00BFFF" },
  S: { short: "S", label: "South Viewshed", bearing: 180, spread: 45, color: "#FFA500" },
  E: { short: "E", label: "East Viewshed",  bearing: 90,  spread: 45, color: "#00C853" },
  W: { short: "W", label: "West Viewshed",  bearing: 270, spread: 45, color: "#D500F9" },
};

// ────────────── geometry ──────────────
// Move a point distMiles along a bearing (great-circle).
function destPoint(lat, lon, bearingDeg, distMiles) {
  const R = 3958.8;
  const brg = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const dr = distMiles / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(brg));
  const lon2 = lon1 + Math.atan2(
    Math.sin(brg) * Math.sin(dr) * Math.cos(lat1),
    Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

// A transparent sector (fan) polygon from the tower along the bearing ± spread.
// Returns an array of [lon, lat] coordinate pairs (ring closed).
function sectorRing(lat, lon, bearingDeg, spreadDeg, rangeMiles, steps = 24) {
  const coords = [[lon, lat]];
  for (let i = 0; i <= steps; i++) {
    const b = bearingDeg - spreadDeg + (2 * spreadDeg * i) / steps;
    const p = destPoint(lat, lon, b, rangeMiles);
    coords.push([p.lon, p.lat]);
  }
  coords.push([lon, lat]);
  return coords;
}

// ────────────── Cesium loader (idempotent, CDN) ──────────────
const CESIUM_VERSION = "1.116";
let cesiumLoadingPromise = null;
function loadCesium() {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (cesiumLoadingPromise) return cesiumLoadingPromise;
  cesiumLoadingPromise = new Promise((resolve, reject) => {
    const cssId = "cesium-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/Widgets/widgets.css`;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.id = "cesium-js";
    script.src = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/Cesium.js`;
    script.onload = () => {
      window.CESIUM_BASE_URL = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`;
      resolve(window.Cesium);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return cesiumLoadingPromise;
}

// ────────────── Mapbox GL loader (idempotent, CDN) ──────────────
const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
let mapboxLoadingPromise = null;
function ensureMapboxLoaded() {
  if (window.mapboxgl) return Promise.resolve();
  if (mapboxLoadingPromise) return mapboxLoadingPromise;
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
  return mapboxLoadingPromise;
}

// ────────────── PRIMARY — Cesium 2D viewshed ──────────────
async function renderCesiumViewshed(container, lat, lon, dir, rangeMiles, ionToken) {
  const Cesium = await loadCesium();
  Cesium.Ion.defaultAccessToken = ionToken;

  const viewer = new Cesium.Viewer(container, {
    sceneMode: Cesium.SceneMode.SCENE2D,
    baseLayerPicker: false, geocoder: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false, animation: false,
    timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
  });
  viewer._cesiumWidget.creditContainer.style.display = "none";

  // Faint terrain contours feel — request world terrain (occlusion source).
  try {
    viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
  } catch { /* imagery-only fallback is fine */ }

  // Transparent colored sector cone.
  const ring = sectorRing(lat, lon, dir.bearing, dir.spread, rangeMiles).flat();
  viewer.entities.add({
    polygon: {
      hierarchy: Cesium.Cartesian3.fromDegreesArray(ring),
      material: Cesium.Color.fromCssColorString(dir.color).withAlpha(0.35),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString(dir.color),
      height: 0,
    },
  });

  // Tower waypoint + direction label.
  viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: { pixelSize: 13, color: Cesium.Color.fromCssColorString(BRAND_GREEN), outlineColor: Cesium.Color.WHITE, outlineWidth: 3 },
    label: {
      text: dir.short,
      font: "bold 18px Inter, sans-serif",
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString(dir.color).withAlpha(0.9),
      pixelOffset: new Cesium.Cartesian2(0, -26),
    },
  });

  // Fit to the sector range (a bit beyond the cone end).
  const d = rangeMiles / 60; // deg padding
  viewer.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(lon - d, lat - d, lon + d, lat + d),
    duration: 0,
  });

  return { engine: "cesium", instance: viewer, destroy: () => { try { viewer.destroy(); } catch { /* noop */ } } };
}

// ────────────── FALLBACK — Mapbox terrain-rgb viewshed ──────────────
async function renderMapboxViewshed(container, lat, lon, dir, rangeMiles, token) {
  await ensureMapboxLoaded();
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/satellite-streets-v12",
    center: [lon, lat],
    zoom: rangeMiles <= 0.25 ? 15 : rangeMiles <= 0.5 ? 14 : 13,
    preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");

  return new Promise((resolve) => {
    map.on("load", () => {
      // terrain-rgb DEM (faint contour feel via hillshade).
      map.addSource("s5-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
      map.addLayer({ id: "s5-hillshade", type: "hillshade", source: "s5-dem", paint: { "hillshade-exaggeration": 0.4 } });

      const ring = sectorRing(lat, lon, dir.bearing, dir.spread, rangeMiles);
      const cone = { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} };
      map.addSource("s5-cone", { type: "geojson", data: cone });
      map.addLayer({ id: "s5-cone-fill", type: "fill", source: "s5-cone", paint: { "fill-color": dir.color, "fill-opacity": 0.35 } });
      map.addLayer({ id: "s5-cone-line", type: "line", source: "s5-cone", paint: { "line-color": dir.color, "line-width": 2 } });

      // Tower waypoint + direction label.
      const el = document.createElement("div");
      el.style.cssText = `width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid ${dir.color};border-radius:50%;box-shadow:0 0 0 2px ${dir.color}88,0 0 14px ${dir.color}cc;font-size:14px;font-weight:700;color:#fff;`;
      el.textContent = dir.short;
      new window.mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([lon, lat]).addTo(map);

      resolve({ engine: "mapbox", instance: map, destroy: () => { try { map.remove(); } catch { /* noop */ } } });
    });
  });
}

// ────────────── public API ──────────────
// Render one direction's 2D viewshed. Tries Cesium first, falls back to Mapbox.
// `dirOverride` lets the caller pass a tweaked cone (e.g. beam-angle spread).
// Returns { engine, instance, destroy }.
export async function renderViewshed(container, lat, lon, dirKey, rangeMiles, dirOverride) {
  const dir = dirOverride || DIRECTIONS[dirKey];
  const cfg = await loadPublicConfig();
  const ionToken = cfg.cesiumIonToken;
  const mapboxToken = cfg.mapboxAccessToken;

  if (ionToken) {
    try {
      return await renderCesiumViewshed(container, lat, lon, dir, rangeMiles, ionToken);
    } catch (e) {
      console.warn("Cesium viewshed failed — falling back to Mapbox:", e?.message);
    }
  }
  if (!mapboxToken) throw new Error("No Cesium Ion or Mapbox token available for viewshed.");
  return await renderMapboxViewshed(container, lat, lon, dir, rangeMiles, mapboxToken);
}

// Compute obstruction stats from a scipViewshed direction profile.
// Returns { pctObstructed, pctClear, firstObstructionMi, clear }.
export function obstructionStats(directionResult) {
  const profile = directionResult?.profile || [];
  if (!profile.length) {
    return { pctObstructed: null, pctClear: null, firstObstructionMi: directionResult?.first_obstruction_mi ?? null, clear: !!directionResult?.clear };
  }
  const blocked = profile.filter((p) => p.obstructed).length;
  const pctObstructed = Math.round((blocked / profile.length) * 100);
  return {
    pctObstructed,
    pctClear: 100 - pctObstructed,
    firstObstructionMi: directionResult?.first_obstruction_mi ?? null,
    clear: !!directionResult?.clear,
  };
}