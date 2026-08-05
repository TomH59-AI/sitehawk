/**
 * Draws the imported provider fiber routes (KMZ → PostGIS) onto a Mapbox map.
 * Only what the imported files contain is drawn — nothing is inferred.
 */
import { base44 } from "@/api/base44Client";
import { FIBER_PROVIDERS } from "@/components/maps/fiberLayers";

const MI_TO_DEG_LAT = 1 / 69;

export async function addFiberProviderRoutes(map, lat, lon, radiusMiles = 0.5) {
  const dLat = radiusMiles * MI_TO_DEG_LAT;
  const dLon = dLat / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat];

  const sets = await Promise.all(
    FIBER_PROVIDERS.map(async (p) => {
      try {
        const { data } = await base44.functions.invoke("fiberProviderRoutes", {
          action: "query_layer",
          layer: `fiberkmz_${p.id}`,
          bbox,
          candidate: { lat, lon },
        });
        const features = data?.features || [];
        return features.length ? { ...p, features } : null;
      } catch {
        return null;
      }
    })
  );

  const loaded = sets.filter(Boolean);
  for (const s of loaded) {
    const sourceId = `s4-fiberkmz-${s.id}`;
    if (map.getSource(sourceId)) continue;
    map.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: s.features } });
    map.addLayer({
      id: `${sourceId}-line`,
      type: "line",
      source: sourceId,
      filter: ["!=", ["geometry-type"], "Point"],
      paint: { "line-color": s.color, "line-width": 2.5, "line-opacity": 0.9 },
    });
    map.addLayer({
      id: `${sourceId}-pt`,
      type: "circle",
      source: sourceId,
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 4, "circle-color": s.color, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 },
    });
  }

  return loaded.map((s) => ({ id: s.id, name: s.name, color: s.color, count: s.features.length }));
}