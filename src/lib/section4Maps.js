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

// NOTE: now async — every renderer already `await`s makeMap indirectly via the
// load Promise, but they call it synchronously. We make the size-gate awaitable
// by returning a Promise<map>; renderers await it before wiring `on("load")`.
async function makeMap(container, style, center, token, zoom = 14) {
  await waitForContainerSize(container);
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style, center, zoom, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
  return map;
}

// Small cell-tower SVG icon marker on Target A.
const TOWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4 19 20"/><path d="M19 4 5 20"/><path d="M12 4v16"/><path d="M8.5 9h7"/><path d="M7 13h10"/></svg>`;

function addTowerMarker(map, lat, lon, label) {
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

function fitToRing(map, lat, lon, radiusMiles) {
  const [w, s, e, n] = ringBbox(lat, lon, radiusMiles);
  map.fitBounds([[w, s], [e, n]], { padding: 50, duration: 0 });
}

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
export async function renderTopo(container, target, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 14);
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
export async function renderFema(container, target, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 14);
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
// lon/lat → XYZ tile coords (for probing a single Zoneomics raster tile).
function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y, z };
}

// Zoneomics paid-tier raster tile endpoint. Adjust here if the docs change.
export function zoneomicsTileTemplate(key) {
  return `https://api.zoneomics.com/v2/zoneomics_tiles/{z}/{x}/{y}.png?api_key=${key}`;
}

// Probe ONE Zoneomics raster tile over the Target A area to detect auth (401/403)
// vs. no-coverage (404) before we add the layer. Returns { ok, status }.
export async function probeZoneomicsTile(zoneomicsKey, lat, lon, z = 15) {
  if (!zoneomicsKey) return { ok: false, status: 0 };
  const { x, y } = lonLatToTile(lon, lat, z);
  const url = zoneomicsTileTemplate(zoneomicsKey)
    .replace("{z}", z).replace("{x}", x).replace("{y}", y);
  console.log("[ZONING MAP DIAG] Zoneomics raster tile probe URL:", url);
  try {
    const res = await fetch(url, { method: "GET" });
    console.log("[ZONING MAP DIAG] Zoneomics raster tile probe status:", res.status);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error("[ZONING MAP DIAG] Zoneomics raster tile probe threw:", e);
    return { ok: false, status: 0 };
  }
}

// ────────────── 4. ZONING ──────────────
// Color-coded Zoneomics raster zoning overlay on the SATELLITE base, centered on
// Target A. Layer order: satellite base → zoning raster (0.55) → Target A parcel
// boundary highlight → Target A pill label. Falls back to a label-only render
// when the raster tiles are unavailable (`tilesOk` false). The legend itself is
// a separate floating React panel (ZoningLegend) rendered by the sub-step.
//   target: { latitude, longitude, owner, apn }
//   zone:   { zone_code, zone_name, zone_type } resolved from zoneDetail (label)
//   parcels: optional Realie records (for the Target A boundary highlight)
//   tilesOk: whether the raster probe succeeded (caller probes first)
export async function renderZoning(container, target, token, zoneomicsKey, zone, parcels = [], tilesOk = true) {
  const { latitude: lat, longitude: lon, owner, apn } = target;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 15);
  map.on("error", (e) => console.error("[ZONING MAP DIAG] Mapbox error event:", e?.error || e));
  return new Promise((resolve) => {
    map.on("load", () => {
      // 1) Zoning raster over the satellite base (only if the probe passed).
      if (zoneomicsKey && tilesOk) {
        const tileUrl = zoneomicsTileTemplate(zoneomicsKey);
        console.log("[ZONING MAP DIAG] Adding Zoneomics raster tiles:", tileUrl);
        map.addSource("s4-zoning", { type: "raster", tiles: [tileUrl], tileSize: 256 });
        map.addLayer({ id: "s4-zoning-layer", type: "raster", source: "s4-zoning", paint: { "raster-opacity": 0.55 } });
        console.log("[ZONING MAP DIAG] raster layer added: zoneomics-zoning");
      } else {
        console.warn("[ZONING MAP DIAG] Zoning raster NOT added (tilesOk:", tilesOk, ", key:", !!zoneomicsKey, ") — label-only fallback");
      }

      // 2) Target A parcel boundary highlight (brand green) when geometry exists.
      const tp = (parcels || []).find((p) => p.apn === apn && p.parcel_geometry) ||
                 (parcels || []).find((p) => p.parcel_geometry);
      if (tp) {
        map.addSource("s4-zoning-target", { type: "geojson", data: { type: "Feature", geometry: tp.parcel_geometry, properties: {} } });
        map.addLayer({ id: "s4-zoning-target-fill", type: "fill", source: "s4-zoning-target", paint: { "fill-color": BRAND_GREEN, "fill-opacity": 0.15 } });
        map.addLayer({ id: "s4-zoning-target-line", type: "line", source: "s4-zoning-target", paint: { "line-color": BRAND_GREEN, "line-width": 3 } });
      }

      // 3) Target A pill label: "Target A: <Zone Code>" — brand green, white text.
      const zoneCode = zone?.zone_code || "—";
      const el = document.createElement("div");
      el.textContent = `Target A: ${zoneCode}`;
      el.style.cssText = `
        font: 600 12px/1 ui-sans-serif, system-ui, sans-serif; color:#fff;
        background:${BRAND_GREEN}; padding:6px 12px; border-radius:9999px;
        white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.3);
      `;
      new window.mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([lon, lat])
        .addTo(map);

      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, 0.4);
      resolve(map);
    });
  });
}

// ────────────── 4b. ZONING GRID (no paid tiles needed) ──────────────
// Draw a color-coded zoning overlay from zoneDetail grid samples. Each sample
// becomes a small filled square colored by its district (color supplied by the
// caller from the API-derived legend). Target A parcel boundary + pill label on
// top. This gives VISIBLE zoning colors without the paid Zoneomics tile tier.
//   cells:    [{ lat, lng, zone_code, color }]
//   cellLat / cellLng: cell size in degrees (from the grid function)
//   zone:     { zone_code, zone_name } for the Target A pill label
export async function renderZoningGrid(container, target, token, cells, cellLat, cellLng, zone, parcels = []) {
  const { latitude: lat, longitude: lon, owner, apn } = target;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 15);
  map.on("error", (e) => console.error("[ZONING MAP DIAG] Mapbox error event:", e?.error || e));
  return new Promise((resolve) => {
    map.on("load", () => {
      // 1) Colored zoning cells — one square polygon per grid sample.
      const dLat = (cellLat || 0.001) / 2;
      const dLng = (cellLng || 0.001) / 2;
      const features = (cells || [])
        .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.color)
        .map((c) => ({
          type: "Feature",
          properties: { color: c.color, zone_code: c.zone_code || "" },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [c.lng - dLng, c.lat - dLat],
              [c.lng + dLng, c.lat - dLat],
              [c.lng + dLng, c.lat + dLat],
              [c.lng - dLng, c.lat + dLat],
              [c.lng - dLng, c.lat - dLat],
            ]],
          },
        }));

      if (features.length) {
        map.addSource("s4-zone-grid", { type: "geojson", data: { type: "FeatureCollection", features } });
        map.addLayer({
          id: "s4-zone-grid-fill", type: "fill", source: "s4-zone-grid",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.5 },
        });
        map.addLayer({
          id: "s4-zone-grid-line", type: "line", source: "s4-zone-grid",
          paint: { "line-color": ["get", "color"], "line-width": 0.5, "line-opacity": 0.4 },
        });
      }

      // 2) Target A parcel boundary highlight (brand green) when geometry exists.
      const tp = (parcels || []).find((p) => p.apn === apn && p.parcel_geometry) ||
                 (parcels || []).find((p) => p.parcel_geometry);
      if (tp) {
        map.addSource("s4-zoning-target", { type: "geojson", data: { type: "Feature", geometry: tp.parcel_geometry, properties: {} } });
        map.addLayer({ id: "s4-zoning-target-line", type: "line", source: "s4-zoning-target", paint: { "line-color": "#ffffff", "line-width": 3 } });
      }

      // 3) Target A pill label: "Target A: <Zone Code>".
      const zoneCode = zone?.zone_code || "—";
      const el = document.createElement("div");
      el.textContent = `Target A: ${zoneCode}`;
      el.style.cssText = `
        font: 600 12px/1 ui-sans-serif, system-ui, sans-serif; color:#fff;
        background:${BRAND_GREEN}; padding:6px 12px; border-radius:9999px;
        white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.3);
      `;
      new window.mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([lon, lat])
        .addTo(map);

      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, 0.45);
      resolve(map);
    });
  });
}

// ────────────── 4c. FLUM (Future Land Use) ──────────────
// Zoneomics FLUM vector tiles (MVT, /flum/tiles) on a light base, centered on
// Target A. Each FLUM polygon is filled with a hashed color from its category
// string + outlined; the Target A pill label sits on top. If the FLUM tile tier
// isn't enabled on the key the tiles simply 404 (no overlay) — the details
// banner (zoneomicsFlumDetails) still reports the point's designation.
const FLUM_TILES = (key) =>
  `https://api.zoneomics.com/v2/flum/tiles/{z}/{x}/{y}.mvt?api_key=${key}`;

// Deterministic pastel color from a FLUM category string.
function flumColor(s) {
  const str = String(s || "flum");
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

export async function renderFlum(container, target, token, zoneomicsKey, flumLabel) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = await makeMap(container, LIGHT_STYLE, [lon, lat], token, 14);
  map.on("error", (e) => console.error("[FLUM MAP DIAG] Mapbox error event:", e?.error || e));
  return new Promise((resolve) => {
    map.on("load", () => {
      if (zoneomicsKey) {
        map.addSource("s4-flum", { type: "vector", tiles: [FLUM_TILES(zoneomicsKey)], minzoom: 8, maxzoom: 16 });
        // Try common source-layer names; Mapbox ignores layers whose source-layer
        // doesn't exist, so listing a few covers Zoneomics naming variations.
        for (const srcLayer of ["flum", "future_land_use", "default"]) {
          map.addLayer({
            id: `s4-flum-fill-${srcLayer}`, type: "fill", source: "s4-flum", "source-layer": srcLayer,
            paint: {
              "fill-color": ["case", ["has", "flum_code"], ["to-color", ["concat", "#", ""]], flumColor(flumLabel)],
              "fill-opacity": 0.35,
            },
          });
          map.addLayer({
            id: `s4-flum-line-${srcLayer}`, type: "line", source: "s4-flum", "source-layer": srcLayer,
            paint: { "line-color": flumColor(flumLabel), "line-width": 1.2, "line-opacity": 0.7 },
          });
        }
        console.log("[FLUM MAP DIAG] FLUM vector tiles added:", FLUM_TILES(zoneomicsKey).replace(zoneomicsKey, "***"));
      } else {
        console.warn("[FLUM MAP DIAG] No Zoneomics key — FLUM overlay skipped, label only.");
      }

      // Target A pill label: "FLUM: <designation>".
      const el = document.createElement("div");
      el.textContent = `FLUM: ${flumLabel || "—"}`;
      el.style.cssText = `
        font: 600 12px/1 ui-sans-serif, system-ui, sans-serif; color:#fff;
        background:${BRAND_GREEN}; padding:6px 12px; border-radius:9999px;
        white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.3);
      `;
      new window.mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([lon, lat]).addTo(map);

      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, 0.45);
      resolve(map);
    });
  });
}

// ────────────── 5. WETLANDS ──────────────
export async function renderWetlands(container, target, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 14);
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

// ────────────── 7. NEAREST AIRPORT ──────────────
// Satellite map showing Target A (tower icon) and the nearest fixed-wing airport,
// with a connecting line + distance label. `airport` is the match returned by
// nearestAirportFromDirectory: { name, callnumber, type, latitude, longitude,
// distance_miles }.
export async function renderAirport(container, target, airport, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const aLat = Number(airport.latitude);
  const aLon = Number(airport.longitude);
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 12);
  map.on("error", (e) => console.error("[AIRPORT MAP DIAG] Mapbox error event:", e?.error || e));
  return new Promise((resolve) => {
    map.on("load", () => {
      // Connecting line Target A → airport.
      map.addSource("s4-air-line", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [[lon, lat], [aLon, aLat]] }, properties: {} },
      });
      map.addLayer({ id: "s4-air-line-layer", type: "line", source: "s4-air-line", paint: { "line-color": "#facc15", "line-width": 2.5, "line-dasharray": [2, 1.5] } });

      // Airport marker (plane pin).
      const ael = document.createElement("div");
      ael.style.cssText = "width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid #facc15;border-radius:50%;box-shadow:0 0 12px rgba(250,204,21,0.7);";
      ael.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>';
      new window.mapboxgl.Marker({ element: ael, anchor: "center" })
        .setLngLat([aLon, aLat])
        .setPopup(new window.mapboxgl.Popup({ offset: 18 }).setHTML(
          `<div style="font-family:monospace;font-size:11px;"><strong>${airport.name || airport.callnumber || "Airport"}</strong><br/>${airport.callnumber || ""}${airport.type ? ` · ${String(airport.type).replace(/_/g, " ")}` : ""}<br/>${Number(airport.distance_miles).toFixed(2)} mi from Target A</div>`
        ))
        .addTo(map);

      addTowerMarker(map, lat, lon, owner);

      // Fit both points.
      const b = new window.mapboxgl.LngLatBounds([lon, lat], [lon, lat]);
      b.extend([aLon, aLat]);
      map.fitBounds(b, { padding: 80, duration: 0, maxZoom: 13 });
      resolve(map);
    });
  });
}

// ────────────── 8. NEAREST CELL TOWER ──────────────
// Satellite map showing Target A (tower icon) and the nearest existing cellular
// site from our imported CellularSite directory, with a connecting line +
// distance label. `tower` is the match from nearestCellTowerFromDirectory:
// { site_name, asr_number, market, city, state, latitude, longitude, distance_miles }.
export async function renderCellTower(container, target, tower, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const tLat = Number(tower.latitude);
  const tLon = Number(tower.longitude);
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 12);
  map.on("error", (e) => console.error("[CELLTOWER MAP DIAG] Mapbox error event:", e?.error || e));
  return new Promise((resolve) => {
    map.on("load", () => {
      // Connecting line Target A → nearest cell tower.
      map.addSource("s4-cell-line", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [[lon, lat], [tLon, tLat]] }, properties: {} },
      });
      map.addLayer({ id: "s4-cell-line-layer", type: "line", source: "s4-cell-line", paint: { "line-color": "#22d3ee", "line-width": 2.5, "line-dasharray": [2, 1.5] } });

      // Cell tower marker (radio-tower pin).
      const cel = document.createElement("div");
      cel.style.cssText = "width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid #22d3ee;border-radius:50%;box-shadow:0 0 12px rgba(34,211,238,0.7);";
      cel.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/></svg>';
      const popHtml = `<div style="font-family:monospace;font-size:11px;"><strong>${tower.site_name || "Cell Site"}</strong><br/>${tower.asr_number && tower.asr_number !== 9999999 ? `ASR #${tower.asr_number}<br/>` : ""}${[tower.city, tower.state].filter(Boolean).join(", ")}${tower.market ? `<br/>${tower.market}` : ""}<br/>${Number(tower.distance_miles).toFixed(2)} mi from Target A</div>`;
      new window.mapboxgl.Marker({ element: cel, anchor: "center" })
        .setLngLat([tLon, tLat])
        .setPopup(new window.mapboxgl.Popup({ offset: 18 }).setHTML(popHtml))
        .addTo(map);

      addTowerMarker(map, lat, lon, owner);

      // Fit both points.
      const b = new window.mapboxgl.LngLatBounds([lon, lat], [lon, lat]);
      b.extend([tLon, tLat]);
      map.fitBounds(b, { padding: 80, duration: 0, maxZoom: 13 });
      resolve(map);
    });
  });
}

// ── Parcel popup Zoneomics zoning lookup (session cache + 300ms debounce) ──
// Keyed by parcel ID for the whole session so repeated hovers don't re-query.
const parcelZoneCache = new Map();

function parcelCentroid(geometry) {
  // Average ring vertices — good enough for a zoneDetail point lookup.
  let coords = [];
  if (geometry?.type === "Polygon") coords = geometry.coordinates?.[0] || [];
  else if (geometry?.type === "MultiPolygon") coords = geometry.coordinates?.[0]?.[0] || [];
  if (!coords.length) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of coords) { sx += x; sy += y; }
  return { lon: sx / coords.length, lat: sy / coords.length };
}

async function lookupParcelZone(pid, lat, lon, zoneomicsKey) {
  if (parcelZoneCache.has(pid)) return parcelZoneCache.get(pid);
  if (!zoneomicsKey || lat == null || lon == null) {
    parcelZoneCache.set(pid, null);
    return null;
  }
  try {
    const url = `https://api.zoneomics.com/v2/zoneDetail?api_key=${zoneomicsKey}&lat=${lat}&lng=${lon}&output_fields=zoning`;
    const res = await fetch(url);
    const json = res.ok ? await res.json() : null;
    const zd = json?.data?.data?.zone_details || json?.data?.zone_details || null;
    const zone = zd?.zone_code ? { zone_code: zd.zone_code, zone_name: zd.zone_name || "" } : null;
    parcelZoneCache.set(pid, zone);
    return zone;
  } catch (_) {
    parcelZoneCache.set(pid, null);
    return null;
  }
}

function zoneLine(zone) {
  if (zone === undefined) return "Zoning: loading…";
  if (!zone) return "Zoning: —";
  return `Zoning: ${zone.zone_code}${zone.zone_name ? ` — ${zone.zone_name}` : ""}`;
}

// ────────────── 6. PARCEL (Realie) ──────────────
// Draw Target A parcel boundary in brand green + adjacent parcels in light grey.
// `parcels` = array of normalized Realie records (with parcel_geometry when present).
// Hover/click a parcel → popup with owner + parcel ID + Zoneomics zoning code.
export async function renderParcel(container, target, parcels, token, zoneomicsKey, ringName, srcLat, srcLon, radiusMiles = 0.5) {
  const { latitude: lat, longitude: lon, owner, apn } = target;
  // Center the parcel map on the SARF center so the whole ring is in view.
  const cLat = Number.isFinite(srcLat) ? srcLat : lat;
  const cLon = Number.isFinite(srcLon) ? srcLon : lon;
  const map = await makeMap(container, SAT_STYLE, [cLon, cLat], token, 15);
  return new Promise((resolve) => {
    map.on("load", () => {
      // SARF search ring outline (the radius the user selected).
      if (Number.isFinite(srcLat) && Number.isFinite(srcLon)) {
        const ring = buildCircle(cLat, cLon, radiusMiles);
        map.addSource("s4-sarf-ring", { type: "geojson", data: ring });
        map.addLayer({ id: "s4-sarf-ring-line", type: "line", source: "s4-sarf-ring", paint: { "line-color": "#facc15", "line-width": 2.5, "line-dasharray": [3, 2] } });
      }

      // Compact dimension label for a parcel — acreage and/or frontage×depth.
      const dimText = (p) => {
        const parts = [];
        if (p.acreage != null && Number(p.acreage) > 0) parts.push(`${Number(p.acreage).toFixed(2)} ac`);
        if (p.lot_frontage_ft && p.lot_depth_ft) parts.push(`${Math.round(p.lot_frontage_ft)}×${Math.round(p.lot_depth_ft)} ft`);
        else if (p.lot_size_sqft && Number(p.lot_size_sqft) > 0) parts.push(`${Math.round(Number(p.lot_size_sqft)).toLocaleString()} sf`);
        return parts.join(" · ");
      };

      // All parcels in the SARF ring — visible cyan boundaries (those with geometry).
      const adj = {
        type: "FeatureCollection",
        features: (parcels || [])
          .filter((p) => p.parcel_geometry && p.apn !== apn)
          .map((p) => ({
            type: "Feature",
            geometry: p.parcel_geometry,
            properties: {
              apn: p.apn || "",
              owner: p.owner_name || p.owner || "",
              dims: dimText(p),
              clat: parcelCentroid(p.parcel_geometry)?.lat ?? null,
              clon: parcelCentroid(p.parcel_geometry)?.lon ?? null,
            },
          })),
      };
      if (adj.features.length) {
        map.addSource("s4-adj", { type: "geojson", data: adj });
        // Faint fill so the whole parcel area is hover/click targetable + visible.
        map.addLayer({ id: "s4-adj-fill", type: "fill", source: "s4-adj", paint: { "fill-color": "#22d3ee", "fill-opacity": 0.08 } });
        map.addLayer({ id: "s4-adj-line", type: "line", source: "s4-adj", paint: { "line-color": "#22d3ee", "line-width": 2.2, "line-opacity": 1 } });
      }

      // Target A parcel — brand green highlight (if its geometry is available).
      const targetParcel = (parcels || []).find((p) => p.apn === apn && p.parcel_geometry);
      if (targetParcel) {
        const tc = parcelCentroid(targetParcel.parcel_geometry);
        const fc = {
          type: "Feature",
          geometry: targetParcel.parcel_geometry,
          properties: { apn: targetParcel.apn || apn || "", owner: owner || "", dims: dimText(targetParcel), clat: tc?.lat ?? lat, clon: tc?.lon ?? lon },
        };
        map.addSource("s4-target", { type: "geojson", data: fc });
        map.addLayer({ id: "s4-target-fill", type: "fill", source: "s4-target", paint: { "fill-color": BRAND_GREEN, "fill-opacity": 0.3 } });
        map.addLayer({ id: "s4-target-line", type: "line", source: "s4-target", paint: { "line-color": BRAND_GREEN, "line-width": 3 } });
      }

      // ── Interactive popup: owner + parcel ID + Zoneomics zoning (cached + debounced) ──
      const popup = new window.mapboxgl.Popup({ closeButton: true, closeOnClick: false, offset: 8 });
      let debounceTimer = null;

      const popupHTML = (props, zone) => {
        const pid = props.apn || "—";
        const dimsRow = props.dims ? `<span style="color:#3b82f6;">Dimensions: ${props.dims}</span><br/>` : "";
        return `<div style="font-family:monospace;font-size:11px;line-height:1.5;color:#3b82f6;">
          <strong style="color:#3b82f6;">${props.owner || "Owner —"}</strong><br/>
          <span style="color:#3b82f6;">Parcel ID: ${pid}</span><br/>
          ${dimsRow}
          <span data-zone="${pid}" style="color:#3b82f6;">${zoneLine(zone)}</span>
        </div>`;
      };

      const showPopup = (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const props = f.properties || {};
        const pid = props.apn || `${props.clon},${props.clat}`;
        map.getCanvas().style.cursor = "pointer";

        const cached = parcelZoneCache.has(pid) ? parcelZoneCache.get(pid) : undefined;
        popup.setLngLat(e.lngLat).setHTML(popupHTML(props, cached)).addTo(map);

        // Already resolved this parcel — no lookup needed.
        if (cached !== undefined) return;

        // Debounce the Zoneomics lookup by 300ms.
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          const clat = props.clat != null ? Number(props.clat) : null;
          const clon = props.clon != null ? Number(props.clon) : null;
          const zone = await lookupParcelZone(pid, clat, clon, zoneomicsKey);
          // Only patch if the popup is still showing this parcel.
          const span = popup.isOpen() && popup.getElement()?.querySelector(`[data-zone="${props.apn || "—"}"]`);
          if (span) span.textContent = zoneLine(zone);
        }, 300);
      };

      const clearCursor = () => { map.getCanvas().style.cursor = ""; };

      for (const layerId of ["s4-adj-fill", "s4-target-fill"]) {
        if (!map.getLayer(layerId)) continue;
        map.on("mousemove", layerId, showPopup);
        map.on("click", layerId, showPopup);
        map.on("mouseleave", layerId, clearCursor);
      }

      // Per-parcel labels at each centroid: APN on line 1, dimensions on line 2.
      const apnPoints = {
        type: "FeatureCollection",
        features: (parcels || [])
          .filter((p) => p.parcel_geometry && p.apn && p.apn !== apn)
          .map((p) => {
            const c = parcelCentroid(p.parcel_geometry);
            if (!c) return null;
            const dims = dimText(p);
            return { type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: { label: dims ? `${p.apn}\n${dims}` : p.apn } };
          })
          .filter(Boolean),
      };
      if (apnPoints.features.length) {
        map.addSource("s4-apn", { type: "geojson", data: apnPoints });
        map.addLayer({
          id: "s4-apn-layer", type: "symbol", source: "s4-apn",
          layout: { "text-field": ["get", "label"], "text-size": 10, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": false },
          paint: { "text-color": "#fff", "text-halo-color": "#0f172a", "text-halo-width": 2 },
        });
      }

      // Label + tower marker on Target A — ring name (user input) + parcel number.
      const labelText = `${ringName || "Search Ring"}${apn ? ` · ${apn}` : ""}`;
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
      // Fit the whole SARF ring so every parcel boundary in the radius is visible.
      fitToRing(map, cLat, cLon, radiusMiles);
      resolve(map);
    });
  });
}