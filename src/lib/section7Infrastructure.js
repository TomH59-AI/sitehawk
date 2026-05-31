/**
 * section7Infrastructure — Mapbox GL renderer for the HAWK INFRASTRUCTURE VISION
 * (Section 7). ONE interactive map, centered on Target A, that the user drives
 * with toggles after it loads. APWA color convention inside the map:
 *   POWER = red (#E60000) markers (poles + transformers)
 *   FIBER = orange (#FF8C00) lines + splice/handhole markers
 * Brand green (#628C83) for the Target A tower icon.
 */

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";

export const STREETS_STYLE = "mapbox://styles/mapbox/streets-v12";
export const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

export const BRAND_GREEN = "#628C83";
export const POWER_RED = "#E60000";   // APWA — electric
export const FIBER_ORANGE = "#FF8C00"; // APWA — communication / fiber

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

const esc = (v) => (v == null ? "" : String(v));

// Build the GeoJSON sources for power markers, fiber lines + fiber markers.
function buildSources(data) {
  const power = {
    type: "FeatureCollection",
    features: (data.power?.points || []).map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        id: p.id, kind: p.kind, voltage: p.voltage || "",
        company: p.utility_company || p.operator || "", phone: p.utility_phone || "",
      },
    })),
  };
  const fiberLines = {
    type: "FeatureCollection",
    features: (data.fiber?.lines || []).map((l) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: l.coords },
      properties: { id: l.id, company: l.fiber_company || "" },
    })),
  };
  const fiberPoints = {
    type: "FeatureCollection",
    features: (data.fiber?.points || []).map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { id: p.id, kind: p.kind, company: p.fiber_company || "" },
    })),
  };
  return { power, fiberLines, fiberPoints };
}

// Add all infrastructure layers (idempotent — call after each style load).
function addInfraLayers(map, sources) {
  map.addSource("s7-power", { type: "geojson", data: sources.power });
  map.addSource("s7-fiber-lines", { type: "geojson", data: sources.fiberLines });
  map.addSource("s7-fiber-points", { type: "geojson", data: sources.fiberPoints });

  // Fiber runs — orange lines (drawn first, under markers).
  map.addLayer({
    id: "s7-fiber-line", type: "line", source: "s7-fiber-lines",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": FIBER_ORANGE, "line-width": 3 },
  });
  // Fiber splice points / handholes — small orange diamonds.
  map.addLayer({
    id: "s7-fiber-pt", type: "circle", source: "s7-fiber-points",
    paint: {
      "circle-radius": 5, "circle-color": FIBER_ORANGE,
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.5,
    },
  });
  // Power poles / transformers — red markers. Transformers/substations render as
  // larger squares; poles/towers as smaller circles (data-driven by 'kind').
  map.addLayer({
    id: "s7-power-pt", type: "circle", source: "s7-power",
    paint: {
      "circle-radius": [
        "match", ["get", "kind"],
        "transformer", 8, "substation", 9,
        6,
      ],
      "circle-color": POWER_RED,
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.5,
    },
  });
}

// Wire hover/click popups for power + fiber features.
function wirePopups(map) {
  const popup = new window.mapboxgl.Popup({ closeButton: false, offset: 12 });

  const showPower = (e) => {
    const p = e.features[0].properties;
    map.getCanvas().style.cursor = "pointer";
    popup.setLngLat(e.lngLat).setHTML(
      `<div style="font-family:monospace;font-size:11px;line-height:1.45;">` +
      `<strong style="color:${POWER_RED};">⚡ ${esc(p.kind).toUpperCase()} · ${esc(p.id)}</strong><br/>` +
      `${p.voltage ? `Voltage: ${esc(p.voltage)}<br/>` : ""}` +
      `<b>Contact:</b> ${esc(p.company) || "—"}<br/>` +
      `${p.phone ? `📞 ${esc(p.phone)}` : ""}</div>`
    ).addTo(map);
  };
  const showFiber = (e) => {
    const p = e.features[0].properties;
    map.getCanvas().style.cursor = "pointer";
    popup.setLngLat(e.lngLat).setHTML(
      `<div style="font-family:monospace;font-size:11px;line-height:1.45;">` +
      `<strong style="color:${FIBER_ORANGE};">🔶 FIBER · ${esc(p.id)}</strong><br/>` +
      `<b>Contact:</b> ${esc(p.company) || "Unknown carrier"}</div>`
    ).addTo(map);
  };
  const clear = () => { map.getCanvas().style.cursor = ""; popup.remove(); };

  ["s7-power-pt"].forEach((id) => {
    map.on("mouseenter", id, showPower);
    map.on("click", id, showPower);
    map.on("mouseleave", id, clear);
  });
  ["s7-fiber-pt", "s7-fiber-line"].forEach((id) => {
    map.on("mouseenter", id, showFiber);
    map.on("click", id, showFiber);
    map.on("mouseleave", id, clear);
  });
}

// Brand-green Target A tower icon at the centerpoint.
function addTowerMarker(map, lat, lon, label) {
  const el = document.createElement("div");
  el.style.cssText = `
    width:32px;height:32px;display:flex;align-items:center;justify-content:center;
    background:rgba(15,23,42,0.92);border:2px solid ${BRAND_GREEN};border-radius:50%;
    box-shadow:0 0 0 2px rgba(98,140,131,0.5),0 0 12px rgba(98,140,131,0.85);font-size:16px;`;
  el.textContent = "📡";
  return new window.mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat([lon, lat])
    .setPopup(new window.mapboxgl.Popup({ offset: 20 }).setHTML(
      `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A</strong>${label ? `<br/>${label}` : ""}<br/>${lat.toFixed(6)}, ${lon.toFixed(6)}</div>`
    ))
    .addTo(map);
}

/**
 * Render the interactive infrastructure map. Returns a controller object:
 *   { map, setBaseStyle(style), toggleLayer(which, visible),
 *     resetView(), destroy() }
 */
export async function renderInfrastructure(container, target, data, token) {
  await ensureMapboxLoaded();
  window.mapboxgl.accessToken = token;
  const lat = Number(target.latitude);
  const lon = Number(target.longitude);
  const label = target.owner || target.parcel_address || "";

  const map = new window.mapboxgl.Map({
    container, style: STREETS_STYLE, center: [lon, lat], zoom: 14.5,
    preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  const sources = buildSources(data);
  let towerMarker = null;

  return await new Promise((resolve) => {
    const onLoad = () => {
      addInfraLayers(map, sources);
      wirePopups(map);
      if (!towerMarker) towerMarker = addTowerMarker(map, lat, lon, label);

      resolve({
        map,
        setBaseStyle: (style) => {
          // Re-add layers + tower after a style swap.
          map.once("styledata", () => {
            if (!map.getSource("s7-power")) {
              addInfraLayers(map, sources);
              wirePopups(map);
            }
          });
          map.setStyle(style);
        },
        toggleLayer: (which, visible) => {
          const vis = visible ? "visible" : "none";
          const ids = which === "power"
            ? ["s7-power-pt"]
            : ["s7-fiber-line", "s7-fiber-pt"];
          ids.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis); });
        },
        resetView: () => map.flyTo({ center: [lon, lat], zoom: 14.5, duration: 600 }),
        zoomIn: () => map.zoomIn(),
        zoomOut: () => map.zoomOut(),
        destroy: () => { try { map.remove(); } catch { /* noop */ } },
      });
    };
    map.on("load", onLoad);
  });
}