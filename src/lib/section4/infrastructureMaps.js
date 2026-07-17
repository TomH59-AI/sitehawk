/**
 * section4/infrastructureMaps — nearest-airport, nearest-cell-tower, fiber-optics
 * and power-grid renderers for the HAWK TARGET A MAP SUITE, plus the HIFLD power
 * infrastructure fetch. Every map centers on Target A.
 */

import {
  SAT_STYLE, BRAND_GREEN,
  makeMap, buildCircle, fitToRing, addTowerMarker, haversineMiles,
} from "./mapCore";

// ────────────── 7. NEAREST AIRPORT ──────────────
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

// ────────────── 11. FIBER OPTICS (CarrierFinder) ──────────────
const FIBER_GREEN = "#16A34A";   // On-Net (lit fiber)
const FIBER_YELLOW = "#EAB308";  // Near-Net (fiber nearby)

export async function renderFiber(container, target, litBuildings, token, radiusMiles = 0.5) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 14);
  map.on("error", (e) => console.error("[FIBER MAP DIAG] Mapbox error event:", e?.error || e));
  return new Promise((resolve) => {
    map.on("load", () => {
      // Fiber-search ring (the radius CarrierFinder searched).
      const ring = buildCircle(lat, lon, radiusMiles);
      map.addSource("s4-fiber-ring", { type: "geojson", data: ring });
      map.addLayer({ id: "s4-fiber-ring-line", type: "line", source: "s4-fiber-ring", paint: { "line-color": "#FF8C00", "line-width": 2.5, "line-dasharray": [3, 2] } });

      // Lit / near-net building markers (only those with coordinates).
      const pts = (litBuildings || []).filter((b) => Number.isFinite(b.lon) && Number.isFinite(b.lat));
      const fc = {
        type: "FeatureCollection",
        features: pts.map((b) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [b.lon, b.lat] },
          properties: {
            carrier: b.carrier || "Carrier",
            carriertype: b.carriertype || "",
            onnet: b.xnet_code === "O",
            street: b.street || "",
            city: b.city || "",
            state: b.state || "",
            distance: b.distance != null ? String(b.distance) : "",
            carrier_count: b.carrier_count != null ? String(b.carrier_count) : "",
            datacenter: b.datacenter ? "1" : "",
          },
        })),
      };
      if (fc.features.length) {
        map.addSource("s4-fiber", { type: "geojson", data: fc });
        map.addLayer({
          id: "s4-fiber-pt", type: "circle", source: "s4-fiber",
          paint: {
            "circle-radius": 7,
            "circle-color": ["case", ["get", "onnet"], FIBER_GREEN, FIBER_YELLOW],
            "circle-stroke-color": "#fff", "circle-stroke-width": 2,
          },
        });
        map.addLayer({
          id: "s4-fiber-label", type: "symbol", source: "s4-fiber",
          layout: {
            "text-field": ["get", "carrier"], "text-size": 11, "text-offset": [0, 1.3],
            "text-anchor": "top", "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": false,
          },
          paint: { "text-color": "#fff", "text-halo-color": "#0f172a", "text-halo-width": 2 },
        });

        // Click/hover popup with carrier + address + distance.
        const popup = new window.mapboxgl.Popup({ closeButton: false, offset: 12 });
        const show = (e) => {
          const p = e.features[0].properties;
          map.getCanvas().style.cursor = "pointer";
          const net = p.onnet === true || p.onnet === "true" ? "On-Net (fiber lit)" : "Near-Net";
          const color = p.onnet === true || p.onnet === "true" ? FIBER_GREEN : FIBER_YELLOW;
          const addr = [p.street, p.city, p.state].filter(Boolean).join(", ");
          popup.setLngLat(e.lngLat).setHTML(
            `<div style="font-family:monospace;font-size:11px;line-height:1.45;">` +
            `<strong style="color:${color};">🔌 ${p.carrier}${p.carriertype ? ` · ${p.carriertype}` : ""}</strong><br/>` +
            `<b>Status:</b> ${net}<br/>` +
            `${p.datacenter ? `<b>Data Center</b><br/>` : ""}` +
            `${addr ? `${addr}<br/>` : ""}` +
            `${p.distance ? `<b>Distance:</b> ${p.distance} ft<br/>` : ""}` +
            `${p.carrier_count ? `<b>Carriers at site:</b> ${p.carrier_count}` : ""}</div>`
          ).addTo(map);
        };
        const clear = () => { map.getCanvas().style.cursor = ""; popup.remove(); };
        map.on("mouseenter", "s4-fiber-pt", show);
        map.on("click", "s4-fiber-pt", show);
        map.on("mouseleave", "s4-fiber-pt", clear);
      }

      addTowerMarker(map, lat, lon, owner);
      fitToRing(map, lat, lon, radiusMiles);
      resolve(map);
    });
  });
}

// ────────────── 12. POWER GRID (HIFLD) ──────────────
const HIFLD_SUBSTATIONS_URL =
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Substations_1/FeatureServer/0/query";
const HIFLD_POWERLINES_URL =
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query";

// Fetch HIFLD substations + transmission lines inside a ~5mi envelope of Target A.
export async function fetchPowerInfrastructure(lat, lon) {
  const offset = 0.07; // ~5 miles in degrees
  const envelope = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
  const common = `geometry=${envelope}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=true&f=geojson`;
  const [subRes, lineRes] = await Promise.all([
    fetch(`${HIFLD_SUBSTATIONS_URL}?where=1=1&outFields=NAME,STATUS,LINES,MAX_VOLT,VOLTAGE&${common}`).then((r) => r.json()).catch(() => null),
    fetch(`${HIFLD_POWERLINES_URL}?where=1=1&outFields=ID,TYPE,STATUS,VOLTAGE,OWNER&${common}`).then((r) => r.json()).catch(() => null),
  ]);
  const subs = subRes?.features || [];
  const lines = lineRes?.features || [];

  let closest = null;
  let min = Infinity;
  for (const s of subs) {
    const c = s.geometry?.coordinates;
    if (!c || c.length < 2) continue;
    const d = haversineMiles(lat, lon, c[1], c[0]);
    if (d < min) {
      min = d;
      const v = s.properties?.MAX_VOLT ?? s.properties?.VOLTAGE;
      closest = {
        name: s.properties?.NAME || "Unknown Substation",
        voltage: v != null && v > 0 ? v : null,
        status: s.properties?.STATUS || null,
        distanceMiles: Number(d.toFixed(2)),
        lat: c[1],
        lon: c[0],
      };
    }
  }

  return {
    closestSubstation: closest,
    transmissionLines: lines.length,
    geo: { substations: { type: "FeatureCollection", features: subs }, lines: { type: "FeatureCollection", features: lines } },
  };
}

const POWER_YELLOW = "#FACC15";
const POWER_ORANGE = "#FB923C";

export async function renderPower(container, target, power, token) {
  const { latitude: lat, longitude: lon, owner } = target;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 12);
  map.on("error", (e) => console.error("[POWER MAP DIAG] Mapbox error event:", e?.error || e));
  return new Promise((resolve) => {
    map.on("load", () => {
      // Transmission lines (corridors) — orange. Click/hover shows the operating
      // company (OWNER), voltage and line type already fetched from HIFLD.
      if (power?.geo?.lines?.features?.length) {
        map.addSource("s4-power-lines", { type: "geojson", data: power.geo.lines });
        map.addLayer({ id: "s4-power-lines-layer", type: "line", source: "s4-power-lines", paint: { "line-color": POWER_ORANGE, "line-width": 2.5, "line-opacity": 0.9 } });
        const linePopup = new window.mapboxgl.Popup({ closeButton: false, offset: 8 });
        const showLine = (e) => {
          const p = e.features[0].properties || {};
          map.getCanvas().style.cursor = "pointer";
          const v = p.VOLTAGE;
          linePopup.setLngLat(e.lngLat).setHTML(
            `<div style="font-family:monospace;font-size:11px;line-height:1.4;"><strong style="color:${POWER_ORANGE};">⚡ ${p.OWNER || "Transmission Line"}</strong><br/>${v && v > 0 ? `Voltage: ${v} kV<br/>` : ""}${p.TYPE ? `Type: ${p.TYPE}` : ""}</div>`
          ).addTo(map);
        };
        map.on("mouseenter", "s4-power-lines-layer", showLine);
        map.on("click", "s4-power-lines-layer", showLine);
        map.on("mouseleave", "s4-power-lines-layer", () => { map.getCanvas().style.cursor = ""; linePopup.remove(); });
      }

      // Substations (transformers / connection points) — yellow dots.
      if (power?.geo?.substations?.features?.length) {
        map.addSource("s4-power-subs", { type: "geojson", data: power.geo.substations });
        map.addLayer({
          id: "s4-power-subs-pt", type: "circle", source: "s4-power-subs",
          paint: { "circle-radius": 6, "circle-color": POWER_YELLOW, "circle-stroke-color": "#0f172a", "circle-stroke-width": 1.5 },
        });
        const popup = new window.mapboxgl.Popup({ closeButton: false, offset: 10 });
        const show = (e) => {
          const p = e.features[0].properties || {};
          map.getCanvas().style.cursor = "pointer";
          const v = p.MAX_VOLT ?? p.VOLTAGE;
          popup.setLngLat(e.lngLat).setHTML(
            `<div style="font-family:monospace;font-size:11px;line-height:1.4;"><strong>⚡ ${p.NAME || "Substation"}</strong><br/>${v && v > 0 ? `Voltage: ${v} kV<br/>` : ""}${p.STATUS ? `Status: ${p.STATUS}` : ""}</div>`
          ).addTo(map);
        };
        map.on("mouseenter", "s4-power-subs-pt", show);
        map.on("click", "s4-power-subs-pt", show);
        map.on("mouseleave", "s4-power-subs-pt", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
      }

      // Dashed connector to the nearest substation + distance label.
      const cs = power?.closestSubstation;
      if (cs) {
        map.addSource("s4-power-tie", {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: [[lon, lat], [cs.lon, cs.lat]] }, properties: {} },
        });
        map.addLayer({ id: "s4-power-tie-layer", type: "line", source: "s4-power-tie", paint: { "line-color": POWER_YELLOW, "line-width": 2.5, "line-dasharray": [2, 1.5] } });

        // Nearest-substation pin with bigger marker.
        const el = document.createElement("div");
        el.style.cssText = "width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid " + POWER_YELLOW + ";border-radius:50%;box-shadow:0 0 12px rgba(250,204,21,0.7);";
        el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="' + POWER_YELLOW + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
        new window.mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([cs.lon, cs.lat])
          .setPopup(new window.mapboxgl.Popup({ offset: 18 }).setHTML(
            `<div style="font-family:monospace;font-size:11px;"><strong>${cs.name}</strong><br/>${cs.voltage ? `${cs.voltage} kV<br/>` : ""}${cs.distanceMiles} mi from Target A</div>`
          ))
          .addTo(map);
      }

      addTowerMarker(map, lat, lon, owner);

      // Fit Target A + nearest substation (fallback to a 3mi ring).
      if (cs) {
        const b = new window.mapboxgl.LngLatBounds([lon, lat], [lon, lat]);
        b.extend([cs.lon, cs.lat]);
        map.fitBounds(b, { padding: 80, duration: 0, maxZoom: 13 });
      } else {
        fitToRing(map, lat, lon, 3);
      }
      resolve(map);
    });
  });
}