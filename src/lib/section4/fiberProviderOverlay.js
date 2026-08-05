/**
 * Draws the imported provider fiber routes (KMZ → PostGIS) onto a Mapbox map.
 * Only what the imported files contain is drawn — nothing is inferred.
 *
 * Called without blocking the rest of the map render, so two things matter:
 *   1. every provider query is bounded (see queryProviderRoutes)
 *   2. the map may have been retired before the query returns — guard before
 *      touching it, or addSource throws into a dead style.
 */
import { queryFiberProviderRoutes, fiberLegend } from "@/lib/fiber/queryProviderRoutes";

/** True only while the map still has a live style we can add layers to. */
function mapAlive(map) {
  try {
    return !!map && map._removed !== true && typeof map.getStyle === "function" && !!map.getStyle();
  } catch {
    return false;
  }
}

/**
 * @param {object}  map          live mapbox-gl map
 * @param {number}  lat
 * @param {number}  lon
 * @param {number}  radiusMiles
 * @param {object}  [options]
 * @param {string}  [options.beforeId] insert routes beneath this layer, so the
 *                  ring, the dashed hookup run and the pins all stay on top.
 * @returns {Promise<Array>} legend rows for the providers that drew
 */
export async function addFiberProviderRoutes(map, lat, lon, radiusMiles = 0.5, options = {}) {
  const { beforeId } = options;
  if (!mapAlive(map)) return [];

  const loaded = await queryFiberProviderRoutes(lat, lon, radiusMiles);
  if (!loaded.length || !mapAlive(map)) return [];

  // Only honour beforeId if that layer is actually still in the style.
  const anchor = beforeId && map.getLayer(beforeId) ? beforeId : undefined;

  const drawn = [];
  for (const s of loaded) {
    const sourceId = `s4-fiberkmz-${s.id}`;
    if (!mapAlive(map)) break;
    if (map.getSource(sourceId)) continue;

    try {
      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: s.features },
      });
      map.addLayer(
        {
          id: `${sourceId}-line`,
          type: "line",
          source: sourceId,
          filter: ["!=", ["geometry-type"], "Point"],
          paint: { "line-color": s.color, "line-width": 2.5, "line-opacity": 0.9 },
        },
        anchor
      );
      map.addLayer(
        {
          id: `${sourceId}-pt`,
          type: "circle",
          source: sourceId,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 4,
            "circle-color": s.color,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1.5,
          },
        },
        anchor
      );
      drawn.push(s);
    } catch (err) {
      console.warn(`[FIBER MAP] could not draw ${s.id}:`, err?.message || err);
    }
  }

  return fiberLegend(drawn);
}
