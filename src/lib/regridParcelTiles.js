/**
 * Parcel-lines layer — REALIE-BACKED (no Regrid).
 *
 * Previously this drew Regrid's tokenized MVT vector tiles. It now draws parcel
 * boundaries from Realie parcel DATA (via the authenticated `realieParcelsInRing`
 * backend function) so no Regrid credits are ever spent. The exported API is
 * unchanged, so every caller (SARF map, ParcelLinesToggle, etc.) keeps working:
 *   - ensureParcelLinesLayer(map)
 *   - setParcelLinesVisible(map, visible)
 *   - queryParcelAt(map, point)
 *   - highlightParcel(map, feature)
 *   - PARCEL_LINES_LAYER_ID
 *
 * On show, and on every map moveend while visible, we pull the parcels inside the
 * current view center (ring mode, radius sized to the viewport) and render their
 * geometry as boundary lines + an invisible fill for click hit-testing.
 */

import { realieParcelsInRing } from "@/functions/realieParcelsInRing";

const SOURCE_ID = "regrid-parcel-tiles"; // kept for layer-id stability
export const PARCEL_LINES_LAYER_ID = "regrid-parcel-lines";
const HIT_LAYER_ID = "regrid-parcel-hit";
const HIGHLIGHT_SOURCE_ID = "regrid-parcel-highlight";
const HIGHLIGHT_LAYER_ID = "regrid-parcel-highlight-line";
const EMPTY = { type: "FeatureCollection", features: [] };

// Convert a Realie parcel list into a boundary FeatureCollection.
function parcelsToFC(parcels = []) {
  return {
    type: "FeatureCollection",
    features: parcels
      .filter((p) => p && p.parcel_geometry)
      .map((p) => ({
        type: "Feature",
        geometry: p.parcel_geometry,
        properties: {
          apn: p.apn || "",
          owner: p.owner_name || "",
          address: p.parcel_address || "",
          headline: p.parcel_address || p.owner_name || p.apn || "",
          acres: p.acreage != null ? Number(p.acreage).toFixed(3) : "",
        },
      })),
  };
}

// Radius (miles) that roughly covers the current viewport, capped to keep the
// Realie pull cheap. Small at low zoom (skips huge fetches), ~viewport at high zoom.
function viewportRadiusMiles(map) {
  const z = map.getZoom();
  if (z < 12) return 0; // too zoomed out — skip (would be a huge, useless pull)
  if (z < 14) return 0.5;
  if (z < 16) return 0.35;
  return 0.25;
}

// Fetch parcels for the current view and push them into the line + hit sources.
let inFlight = false;
async function refreshParcels(map) {
  if (!map || inFlight) return;
  const radius = viewportRadiusMiles(map);
  const src = map.getSource(SOURCE_ID);
  if (!src) return;
  if (!radius) { src.setData(EMPTY); return; }
  const c = map.getCenter();
  inFlight = true;
  try {
    const res = await realieParcelsInRing({ mode: "ring", lat: c.lat, lon: c.lng, radius_miles: radius });
    const parcels = res?.data?.parcels || res?.parcels || [];
    if (map.getSource(SOURCE_ID)) map.getSource(SOURCE_ID).setData(parcelsToFC(parcels));
  } catch {
    /* leave whatever is currently drawn */
  } finally {
    inFlight = false;
  }
}

// Debounced moveend handler stored per-map so we can add/remove it cleanly.
const moveHandlers = new WeakMap();

/**
 * Ensure the Realie parcel-lines layers exist on a Mapbox GL map:
 * visible boundary lines, an invisible fill for click hit-testing, and a
 * highlight layer for the selected parcel. Idempotent.
 */
export async function ensureParcelLinesLayer(map) {
  if (!map || map.getLayer(PARCEL_LINES_LAYER_ID)) return PARCEL_LINES_LAYER_ID;

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY });
  }
  // Invisible fill — makes whole parcels clickable, not just the thin lines.
  map.addLayer({
    id: HIT_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: { "fill-color": "#000000", "fill-opacity": 0 },
  });
  map.addLayer({
    id: PARCEL_LINES_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 15, 1, 18, 1.6],
      "line-opacity": 0.85,
    },
  });
  if (!map.getSource(HIGHLIGHT_SOURCE_ID)) {
    map.addSource(HIGHLIGHT_SOURCE_ID, { type: "geojson", data: EMPTY });
    map.addLayer({
      id: HIGHLIGHT_LAYER_ID,
      type: "line",
      source: HIGHLIGHT_SOURCE_ID,
      paint: { "line-color": "#10b981", "line-width": 3.5 },
    });
  }
  return PARCEL_LINES_LAYER_ID;
}

/** Show/hide the parcel-lines layer (adds it + a moveend refetch on first show). */
export async function setParcelLinesVisible(map, visible) {
  if (!map) return;
  if (visible) await ensureParcelLinesLayer(map);
  [PARCEL_LINES_LAYER_ID, HIT_LAYER_ID, HIGHLIGHT_LAYER_ID].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  });

  if (visible) {
    // Refetch parcels for the view now, and whenever the map settles after a move.
    refreshParcels(map);
    if (!moveHandlers.has(map)) {
      let t = null;
      const handler = () => {
        if (map.getLayoutProperty(PARCEL_LINES_LAYER_ID, "visibility") === "none") return;
        clearTimeout(t);
        t = setTimeout(() => refreshParcels(map), 400);
      };
      map.on("moveend", handler);
      moveHandlers.set(map, handler);
    }
  } else {
    highlightParcel(map, null);
  }
}

/** Returns the parcel feature under a click point, or null (safe if layer absent). */
export function queryParcelAt(map, point) {
  if (!map || !map.getLayer(HIT_LAYER_ID)) return null;
  if (map.getLayoutProperty(HIT_LAYER_ID, "visibility") === "none") return null;
  const feats = map.queryRenderedFeatures(point, { layers: [HIT_LAYER_ID] });
  return feats?.[0] || null;
}

/** Outline the given parcel feature (pass null to clear). */
export function highlightParcel(map, feature) {
  const src = map?.getSource(HIGHLIGHT_SOURCE_ID);
  if (!src) return;
  src.setData(
    feature
      ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: feature.geometry }] }
      : EMPTY
  );
}