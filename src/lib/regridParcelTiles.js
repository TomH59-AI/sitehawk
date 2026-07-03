import { regridParcelTiles } from "@/functions/regridParcelTiles";

const SOURCE_ID = "regrid-parcel-tiles";
export const PARCEL_LINES_LAYER_ID = "regrid-parcel-lines";
const HIT_LAYER_ID = "regrid-parcel-hit";
const HIGHLIGHT_SOURCE_ID = "regrid-parcel-highlight";
const HIGHLIGHT_LAYER_ID = "regrid-parcel-highlight-line";
const EMPTY = { type: "FeatureCollection", features: [] };

let tilesPromise = null;

/** Fetch (once per session) the tokenized Regrid MVT tile config. */
export function loadParcelTileConfig() {
  if (!tilesPromise) {
    tilesPromise = regridParcelTiles({})
      .then((res) => res.data)
      .catch((e) => {
        tilesPromise = null;
        throw e;
      });
  }
  return tilesPromise;
}

/**
 * Ensure the Regrid parcel layers exist on a Mapbox GL map:
 * visible boundary lines, an invisible fill for click hit-testing,
 * and a highlight layer for the selected parcel. Idempotent.
 */
export async function ensureParcelLinesLayer(map) {
  if (!map || map.getLayer(PARCEL_LINES_LAYER_ID)) return PARCEL_LINES_LAYER_ID;
  const cfg = await loadParcelTileConfig();
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "vector",
      tiles: cfg.tiles,
      minzoom: 10,
      maxzoom: Math.min(cfg.max_zoom || 21, 21),
    });
  }
  // Invisible fill — makes whole parcels clickable, not just the thin lines.
  map.addLayer({
    id: HIT_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    "source-layer": cfg.source_layer,
    minzoom: 12,
    paint: { "fill-color": "#000000", "fill-opacity": 0 },
  });
  map.addLayer({
    id: PARCEL_LINES_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    "source-layer": cfg.source_layer,
    minzoom: 12,
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

/** Show/hide the parcel-lines layer (adds it on first show). */
export async function setParcelLinesVisible(map, visible) {
  if (!map) return;
  if (visible) await ensureParcelLinesLayer(map);
  [PARCEL_LINES_LAYER_ID, HIT_LAYER_ID, HIGHLIGHT_LAYER_ID].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  });
  if (!visible) highlightParcel(map, null);
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