import { regridParcelTiles } from "@/functions/regridParcelTiles";

const SOURCE_ID = "regrid-parcel-tiles";
export const PARCEL_LINES_LAYER_ID = "regrid-parcel-lines";

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
 * Ensure the Regrid parcel-lines vector layer exists on a Mapbox GL map.
 * Idempotent — safe to call repeatedly. Returns the layer id.
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
  return PARCEL_LINES_LAYER_ID;
}

/** Show/hide the parcel-lines layer (adds it on first show). */
export async function setParcelLinesVisible(map, visible) {
  if (!map) return;
  if (visible) {
    await ensureParcelLinesLayer(map);
    map.setLayoutProperty(PARCEL_LINES_LAYER_ID, "visibility", "visible");
  } else if (map.getLayer(PARCEL_LINES_LAYER_ID)) {
    map.setLayoutProperty(PARCEL_LINES_LAYER_ID, "visibility", "none");
  }
}