/**
 * section4/fiberOpticsMap — MAP 11 · TARGET A Fiber Optics Map.
 *
 * Replaces the retired CarrierFinder lit-building renderer. Data shown is ONLY
 * what the sources actually publish:
 *   - fiber hookup / splice point  → targetAConnectionPoints (OSM mapped telecom
 *     asset; flagged `assumed` when fiber is presumed at the road ROW)
 *   - access road frontage point   → targetAConnectionPoints
 * Nothing is invented — an absent value renders as "No data available".
 */

import { SAT_STYLE, makeMap, buildCircle, fitToRing, addTowerMarker } from "./mapCore";
import { addFiberProviderRoutes } from "./fiberProviderOverlay";

const FIBER_PURPLE = "#7C3AED";
const ACCESS_BLUE = "#2563EB";

function pinEl(color, svg) {
  const el = document.createElement("div");
  el.style.cssText = `width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid ${color};border-radius:50%;box-shadow:0 0 12px ${color}99;`;
  el.innerHTML = svg;
  return el;
}

/**
 * Resolve once the style is actually ready to take layers.
 *
 * MAP 11 is late in the Section 4 sequence, so by the time it runs the browser
 * may refuse another WebGL context. Mapbox then fires `error` and NEVER fires
 * `load` — the old code awaited `load` alone, so the step hung forever on a
 * black panel with no message. Now a failure surfaces as a real error that
 * MapSubStep renders with a Retry button.
 */
const FIBER_LOAD_TIMEOUT_MS = 20000;

function whenStyleReady(map) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(
      () => finish(new Error(
        "Fiber map canvas never finished loading — the browser may have run out of live map canvases. Regenerate this map."
      )),
      FIBER_LOAD_TIMEOUT_MS
    );

    if (typeof map.isStyleLoaded === "function" && map.isStyleLoaded()) return finish();
    map.on("load", () => finish());
    map.on("error", (e) => {
      const msg = String(e?.error?.message || e?.error || "");
      if (/webgl|context|canvas/i.test(msg)) {
        finish(new Error(`Fiber map could not create a map canvas: ${msg}`));
      }
    });
  });
}

export async function renderFiberOptics(container, target, data, token, radiusMiles = 0.5) {
  const { latitude: lat, longitude: lon, owner } = target;
  const fiber = data?.fiber || null;
  const access = data?.access || null;
  const map = await makeMap(container, SAT_STYLE, [lon, lat], token, 15);
  map.on("error", (e) => console.error("[FIBER MAP] Mapbox error event:", e?.error || e));

  await whenStyleReady(map);

  // Search ring used for the fiber asset lookup.
      map.addSource("s4-fiber-ring", { type: "geojson", data: buildCircle(lat, lon, radiusMiles) });
      map.addLayer({
        id: "s4-fiber-ring-line", type: "line", source: "s4-fiber-ring",
        paint: { "line-color": "#FF8C00", "line-width": 2.5, "line-dasharray": [3, 2] },
      });

      // Imported provider fiber routes (KMZ → PostGIS). Deliberately NOT awaited:
      // a slow or unreachable provider store must never stall the hookup pin, the
      // access-frontage pin, or this map's own resolve. Layers are inserted beneath
      // the ring line, so the routes stay under everything drawn below.
      addFiberProviderRoutes(map, lat, lon, radiusMiles, { beforeId: "s4-fiber-ring-line" })
        .then((legend) => {
          if (legend.length) console.info("[FIBER MAP] provider routes drawn:", legend);
        })
        .catch((err) => console.error("[FIBER MAP] provider routes failed:", err?.message || err));

      // Fiber hookup / splice point + dashed run from Target A.
      if (fiber?.point) {
        map.addSource("s4-fiber-run", {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: [[lon, lat], [fiber.point.lon, fiber.point.lat]] }, properties: {} },
        });
        map.addLayer({
          id: "s4-fiber-run-line", type: "line", source: "s4-fiber-run",
          paint: { "line-color": FIBER_PURPLE, "line-width": 3, "line-dasharray": [2, 1.5] },
        });
        const html =
          `<div style="font-family:monospace;font-size:11px;line-height:1.45;">` +
          `<strong style="color:${FIBER_PURPLE};">🔌 ${fiber.assumed ? "Assumed fiber hookup (road ROW)" : (fiber.asset || "Mapped telecom asset")}</strong><br/>` +
          `<b>Operator:</b> ${fiber.operator || "No data available"}<br/>` +
          `<b>Distance from Target A:</b> ${fiber.distance_ft != null ? `${fiber.distance_ft} ft` : "No data available"}<br/>` +
          `<b>Lat/Lon:</b> ${fiber.point.lat.toFixed(6)}, ${fiber.point.lon.toFixed(6)}<br/>` +
          `<span style="opacity:.8">${fiber.note || ""}</span></div>`;
        new window.mapboxgl.Marker({
          element: pinEl(FIBER_PURPLE, `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${FIBER_PURPLE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><path d="M9 8h6v4a3 3 0 0 1-3 3 3 3 0 0 0-3 3v4"/></svg>`),
          anchor: "center",
        })
          .setLngLat([fiber.point.lon, fiber.point.lat])
          .setPopup(new window.mapboxgl.Popup({ offset: 18 }).setHTML(html))
          .addTo(map);
      }

      // Access / road frontage point (where the fiber run would enter the site).
      if (access?.point && (!fiber?.point || access.point.lat !== fiber.point.lat || access.point.lon !== fiber.point.lon)) {
        new window.mapboxgl.Marker({
          element: pinEl(ACCESS_BLUE, `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${ACCESS_BLUE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M8 19 12 5l4 14"/></svg>`),
          anchor: "center",
        })
          .setLngLat([access.point.lon, access.point.lat])
          .setPopup(new window.mapboxgl.Popup({ offset: 18 }).setHTML(
            `<div style="font-family:monospace;font-size:11px;line-height:1.45;"><strong style="color:${ACCESS_BLUE};">Access / road frontage</strong><br/>` +
            `<b>Road:</b> ${access.road_name || "No data available"}<br/>` +
            `<b>Distance:</b> ${access.distance_ft != null ? `${access.distance_ft} ft` : "No data available"}</div>`
          ))
          .addTo(map);
      }

      addTowerMarker(map, lat, lon, owner);

      if (fiber?.point) {
        const b = new window.mapboxgl.LngLatBounds([lon, lat], [lon, lat]);
        b.extend([fiber.point.lon, fiber.point.lat]);
        if (access?.point) b.extend([access.point.lon, access.point.lat]);
        map.fitBounds(b, { padding: 90, duration: 0, maxZoom: 17 });
      } else {
        fitToRing(map, lat, lon, radiusMiles);
      }

  return map;
}