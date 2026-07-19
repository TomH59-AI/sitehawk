// SARF ring parcel + zoning overlay — parcels come from the Realie ring search
// (realieParcelsInRing) and render on the Section 1 Mapbox SARF map colored by
// zone class, with zoning-classification labels.

export const ZONE_STYLES = {
  RES:   { color: "#EF4444", label: "Residential" },
  COMM:  { color: "#3B82F6", label: "Commercial" },
  IND:   { color: "#8B5CF6", label: "Industrial" },
  AG:    { color: "#22C55E", label: "Agricultural" },
  OS:    { color: "#14B8A6", label: "Open Space" },
  OTHER: { color: "#94A3B8", label: "Other" },
};

export function buildParcelZoningFC(parcels) {
  const features = (parcels || [])
    .filter((p) => p.parcel_geometry)
    .map((p) => ({
      type: "Feature",
      properties: {
        zone: ZONE_STYLES[p.zone_class] ? p.zone_class : "OTHER",
        label: p.zoning_classification || p.land_use || p.zone_class || "",
        apn: p.apn || "",
      },
      geometry: p.parcel_geometry,
    }));
  return { type: "FeatureCollection", features };
}

const matchColor = [
  "match", ["get", "zone"],
  ...Object.entries(ZONE_STYLES).flatMap(([k, v]) => [k, v.color]),
  "#94A3B8",
];

const LAYER_IDS = ["sarf-parcels-fill", "sarf-parcels-line", "sarf-parcels-label"];

// (Re)adds the ring-parcel zoning layers. Idempotent — safe after basemap swaps.
// Inserted below the SARF ring layers so the red ring always stays on top.
export function addSarfZoningLayers(map, fc) {
  LAYER_IDS.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource("sarf-parcels")) map.removeSource("sarf-parcels");
  if (!fc?.features?.length) return;
  map.addSource("sarf-parcels", { type: "geojson", data: fc });
  const before = map.getLayer("sarf-ring-fill") ? "sarf-ring-fill" : undefined;
  map.addLayer({ id: "sarf-parcels-fill", type: "fill", source: "sarf-parcels", paint: { "fill-color": matchColor, "fill-opacity": 0.18 } }, before);
  map.addLayer({ id: "sarf-parcels-line", type: "line", source: "sarf-parcels", paint: { "line-color": matchColor, "line-width": 1.2 } }, before);
  map.addLayer({
    id: "sarf-parcels-label", type: "symbol", source: "sarf-parcels",
    layout: { "text-field": ["get", "label"], "text-size": 10, "symbol-placement": "point", "text-allow-overlap": false },
    paint: { "text-color": "#FFFFFF", "text-halo-color": "#0f172a", "text-halo-width": 1.2 },
  });
}