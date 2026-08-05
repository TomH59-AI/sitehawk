import { useEffect, useState } from "react";
import { GeoJSON, CircleMarker, Tooltip } from "react-leaflet";
import { base44 } from "@/api/base44Client";
import { FIBER_PROVIDERS } from "@/components/maps/fiberLayers";

const MI_TO_DEG_LAT = 1 / 69;

// Imported provider fiber routes (KMZ → PostGIS) drawn inside the scout ring.
// Nothing is inferred — only what each provider's imported file actually contains.
export default function FiberRoutesLayer({ center, radiusMiles = 2, onLoaded }) {
  const [sets, setSets] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dLat = radiusMiles * MI_TO_DEG_LAT;
      const dLon = dLat / Math.max(0.15, Math.cos((center.lat * Math.PI) / 180));
      const bbox = [center.lon - dLon, center.lat - dLat, center.lon + dLon, center.lat + dLat];
      const results = await Promise.all(
        FIBER_PROVIDERS.map(async (p) => {
          try {
            const { data } = await base44.functions.invoke("fiberProviderRoutes", {
              action: "query_layer",
              layer: `fiberkmz_${p.id}`,
              bbox,
              candidate: { lat: center.lat, lon: center.lon },
            });
            const features = data?.features || [];
            return features.length ? { ...p, features } : null;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      const loaded = results.filter(Boolean);
      setSets(loaded);
      onLoaded?.(loaded.map((s) => ({ id: s.id, name: s.name, color: s.color, count: s.features.length })));
    })();
    return () => { cancelled = true; };
  }, [center.lat, center.lon, radiusMiles]);

  return (
    <>
      {sets.map((s) => (
        <div key={s.id} style={{ display: "contents" }}>
          <GeoJSON
            data={{ type: "FeatureCollection", features: s.features.filter((f) => f.geometry?.type !== "Point") }}
            style={{ color: s.color, weight: 2.5, opacity: 0.9 }}
            onEachFeature={(f, layer) =>
              layer.bindTooltip(
                `${s.name}${f.properties?.facility_name ? ` — ${f.properties.facility_name}` : ""}` +
                  (f.properties?.distance_miles != null ? ` · ${f.properties.distance_miles} mi from target` : "") +
                  " · approximate, unverified"
              )
            }
          />
          {s.features
            .filter((f) => f.geometry?.type === "Point")
            .map((f, i) => (
              <CircleMarker
                key={`${s.id}-${i}`}
                center={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
                radius={4}
                pathOptions={{ color: "#fff", weight: 1.5, fillColor: s.color, fillOpacity: 1 }}
              >
                <Tooltip>
                  {s.name} — {f.properties?.facility_name || f.properties?.route_type || "splice point"}
                  {f.properties?.distance_miles != null ? ` · ${f.properties.distance_miles} mi` : ""}
                </Tooltip>
              </CircleMarker>
            ))}
        </div>
      ))}
    </>
  );
}