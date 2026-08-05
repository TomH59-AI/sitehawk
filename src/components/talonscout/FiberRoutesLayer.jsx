import { Fragment, useEffect, useState } from "react";
import { GeoJSON, CircleMarker, Tooltip } from "react-leaflet";
import { queryFiberProviderRoutes, fiberLegend } from "@/lib/fiber/queryProviderRoutes";

// Imported provider fiber routes (KMZ → PostGIS) drawn inside the scout ring.
// Nothing is inferred — only what each provider's imported file actually contains.
// Shares the bounded query with Map 11, so a stalled provider drops out here too
// instead of leaving the layer permanently empty with no signal.
export default function FiberRoutesLayer({ center, radiusMiles = 2, onLoaded }) {
  const [sets, setSets] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await queryFiberProviderRoutes(center.lat, center.lon, radiusMiles);
      if (cancelled) return;
      setSets(loaded);
      onLoaded?.(fiberLegend(loaded));
    })();
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lon, radiusMiles]);

  return (
    <>
      {sets.map((s) => (
        <Fragment key={s.id}>
          <GeoJSON
            data={{
              type: "FeatureCollection",
              features: s.features.filter((f) => f.geometry?.type !== "Point"),
            }}
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
        </Fragment>
      ))}
    </>
  );
}
