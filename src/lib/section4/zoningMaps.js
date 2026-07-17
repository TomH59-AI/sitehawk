/**
 * section4/zoningMaps — zoning + Future Land Use (FLUM) renderers for the HAWK
 * TARGET A MAP SUITE, plus the Zoneomics raster-tile helpers. Covers:
 *   - Zoneomics raster zoning overlay (renderZoning)
 *   - zoneDetail grid zoning overlay (renderZoningGrid)
 *   - Zoneomics FLUM vector tiles (renderFlum)
 *   - zoneResolve / FL GeoPlan FLU polygon (renderFlumPolygon)
 *   - Regrid parcel zoning/FLU map, color-coded by district (renderRegridZoningMap)
 */

import {
  SAT_STYLE, LIGHT_STYLE, BRAND_GREEN,
  makeMap, fitToRing, addTowerMarker, parcelCentroid,
} from "./mapCore";

// ────────────── Zoneomics raster tile helpers ──────────────
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

// ────────────── 4. ZONING (Zoneomics raster) ──────────────
// Color-coded Zoneomics raster zoning overlay on the SATELLITE base, centered on
// Target A. Falls back to a label-only render when the raster tiles are
// unavailable (`tilesOk` false).
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
// becomes a small filled square colored by its district. Target A parcel
// boundary + pill label on top.
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

// ────────────── 4c. FLUM (Future Land Use — Zoneomics vector tiles) ──────────────
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

// ────────────── 4d. FLUM POLYGON (zoneResolve / FL GeoPlan) ──────────────
// Draw the REAL Future Land Use polygon GeoJSON returned by zoneResolve.
export async function renderFlumPolygon(container, target, token, fluFeature, flumLabel) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = await makeMap(container, LIGHT_STYLE, [lon, lat], token, 14);
  map.on("error", (e) => console.error("[FLUM MAP DIAG] Mapbox error event:", e?.error || e));
  const color = flumColor(flumLabel);
  return new Promise((resolve) => {
    map.on("load", () => {
      if (fluFeature?.geometry) {
        map.addSource("s4-flu", { type: "geojson", data: fluFeature });
        map.addLayer({ id: "s4-flu-fill", type: "fill", source: "s4-flu", paint: { "fill-color": color, "fill-opacity": 0.35 } });
        map.addLayer({ id: "s4-flu-line", type: "line", source: "s4-flu", paint: { "line-color": color, "line-width": 2, "line-opacity": 0.85 } });
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
      // Fit the FLU polygon bounds when present, else a small ring around Target A.
      if (fluFeature?.geometry) {
        const coords = [];
        const walk = (a) => Array.isArray(a) && typeof a[0] === "number" ? coords.push(a) : (a || []).forEach(walk);
        walk(fluFeature.geometry.coordinates);
        if (coords.length) {
          const b = new window.mapboxgl.LngLatBounds(coords[0], coords[0]);
          coords.forEach((c) => b.extend(c));
          map.fitBounds(b, { padding: 50, duration: 0, maxZoom: 16 });
        } else fitToRing(map, lat, lon, 0.45);
      } else fitToRing(map, lat, lon, 0.45);
      resolve(map);
    });
  });
}

// ────────────── 4e. REGRID ZONING / FLU PARCEL MAP ──────────────
// Draw Regrid parcel boundaries color-coded by their zoning or FLU code. Each
// unique zone/FLU code gets a deterministic BRIGHT color; Target A is highlighted
// in brand green with a "TARGET A" pill; a legend sits on the map.
//   parcelsFC: GeoJSON FeatureCollection — each feature has { zoning | flu } property
//   labelText: pill label (e.g. "Zoning: A-1" or "FLUM: Residential")
//   fieldKey:  "zoning" | "flu" — which property to read for coloring
export async function renderRegridZoningMap(container, target, token, parcelsFC, labelText, fieldKey = "zoning") {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 15);
  map.on("error", (e) => console.error("[REGRID ZONING DIAG] Mapbox error event:", e?.error || e));

  // Build a deterministic BRIGHT color per unique zone code. Higher saturation +
  // lightness so surrounding parcels read as vivid zoning colors on satellite.
  const codeSet = new Set((parcelsFC?.features || []).map((f) => f.properties?.[fieldKey] || "—"));
  const palette = {};
  let hueStep = 0;
  for (const code of codeSet) {
    // Spread hues evenly, avoid red (0°) for ROW parcels confusion
    const h = (30 + hueStep * 137.5) % 360; // golden-angle spread
    palette[code] = `hsl(${Math.round(h)}, 90%, 62%)`; // brighter: 90% sat, 62% light
    hueStep++;
  }

  return new Promise((resolve) => {
    map.on("load", () => {
      // 1) All parcels colored by zone code
      const colored = {
        type: "FeatureCollection",
        features: (parcelsFC?.features || []).map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            _color: palette[f.properties?.[fieldKey] || "—"] || "#888",
          },
        })),
      };
      map.addSource("s4-rg-zone", { type: "geojson", data: colored });
      // Brighter fill + bolder outlines so surrounding zoning colors pop.
      map.addLayer({ id: "s4-rg-zone-fill", type: "fill", source: "s4-rg-zone", paint: { "fill-color": ["get", "_color"], "fill-opacity": 0.6 } });
      map.addLayer({ id: "s4-rg-zone-line", type: "line", source: "s4-rg-zone", paint: { "line-color": ["get", "_color"], "line-width": 2, "line-opacity": 1 } });

      // 2) Highlight Target A parcel boundary in brand green + a clear pill label.
      const targetGeom = (parcelsFC?.features || []).find((f) => f.properties?.apn === target.apn || f.properties?.apn === target.parcel_id);
      if (targetGeom) {
        map.addSource("s4-rg-target", { type: "geojson", data: targetGeom });
        map.addLayer({ id: "s4-rg-target-fill", type: "fill", source: "s4-rg-target", paint: { "fill-color": BRAND_GREEN, "fill-opacity": 0.25 } });
        map.addLayer({ id: "s4-rg-target-line", type: "line", source: "s4-rg-target", paint: { "line-color": BRAND_GREEN, "line-width": 4 } });
        // "TARGET A" pill anchored on the target parcel centroid.
        const tc = parcelCentroid(targetGeom.geometry);
        if (tc) {
          const tEl = document.createElement("div");
          tEl.textContent = "TARGET A";
          tEl.style.cssText = `
            font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; color:#fff; letter-spacing:0.08em;
            background:${BRAND_GREEN}; padding:5px 10px; border-radius:9999px;
            white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.5); border:1.5px solid #fff;
          `;
          new window.mapboxgl.Marker({ element: tEl, anchor: "center" }).setLngLat([tc.lon, tc.lat]).addTo(map);
        }
      }

      // 3) Hover popup showing zone code + owner
      const popup = new window.mapboxgl.Popup({ closeButton: false, offset: 8 });
      map.on("mousemove", "s4-rg-zone-fill", (e) => {
        const p = e.features?.[0]?.properties || {};
        map.getCanvas().style.cursor = "pointer";
        popup.setLngLat(e.lngLat).setHTML(
          `<div style="font-family:monospace;font-size:11px;line-height:1.4;">` +
          `<strong>${p.owner || p.apn || "Parcel"}</strong><br/>` +
          `${fieldKey === "zoning" ? "Zone" : "FLU"}: <strong>${p[fieldKey] || "—"}</strong>` +
          `${p.apn ? `<br/>APN: ${p.apn}` : ""}</div>`
        ).addTo(map);
      });
      map.on("mouseleave", "s4-rg-zone-fill", () => { map.getCanvas().style.cursor = ""; popup.remove(); });

      // 4) Pill label
      const el = document.createElement("div");
      el.textContent = labelText || "—";
      el.style.cssText = `
        font: 600 12px/1 ui-sans-serif, system-ui, sans-serif; color:#fff;
        background:${BRAND_GREEN}; padding:6px 12px; border-radius:9999px;
        white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.3);
      `;
      new window.mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([lon, lat]).addTo(map);

      // 5) Legend pills for each zone code — top-right corner
      const legendEl = document.createElement("div");
      legendEl.style.cssText = "position:absolute;top:8px;right:48px;z-index:10;display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;";
      for (const [code, color] of Object.entries(palette)) {
        const pill = document.createElement("div");
        pill.style.cssText = `display:flex;align-items:center;gap:6px;background:rgba(15,23,42,0.85);border-radius:4px;padding:2px 7px;`;
        const swatch = document.createElement("div");
        swatch.style.cssText = `width:12px;height:12px;border-radius:2px;background:${color};flex-shrink:0;`;
        const label = document.createElement("span");
        label.style.cssText = "font:600 10px/1 monospace;color:#fff;white-space:nowrap;";
        label.textContent = code;
        pill.appendChild(swatch);
        pill.appendChild(label);
        legendEl.appendChild(pill);
      }
      container.style.position = "relative";
      container.appendChild(legendEl);

      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, 0.5);
      resolve(map);
    });
  });
}