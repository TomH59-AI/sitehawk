import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import * as turf from "@turf/turf";

const SITE_SRC = "rfi-my-sites";
const RING_SRC = "rfi-my-rings";
const RING_MILES = 1;

// Loads the user's saved site candidates (SearchResult) and search-ring centers
// (SearchHistory) and draws them ON TOP of the RfiMap. Visibility is driven by
// the `show` prop { sites, rings } toggled from the page control panel.
export default function RfiOverlays({ map, ready, show }) {
  const loaded = useRef(false);

  // One-time: add sources + layers and load the data.
  useEffect(() => {
    if (!map || !ready || loaded.current) return;
    loaded.current = true;

    map.addSource(SITE_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource(RING_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

    // Search rings (drawn under pins)
    map.addLayer({
      id: "rfi-my-rings-fill",
      type: "fill",
      source: RING_SRC,
      paint: { "fill-color": "#8B5CF6", "fill-opacity": 0.1 },
    });
    map.addLayer({
      id: "rfi-my-rings-line",
      type: "line",
      source: RING_SRC,
      paint: { "line-color": "#8B5CF6", "line-width": 2, "line-dasharray": [2, 1] },
    });

    // Site pins
    map.addLayer({
      id: "rfi-my-sites",
      type: "circle",
      source: SITE_SRC,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 12, 7],
        "circle-color": "#22c55e",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: "rfi-my-sites-label",
      type: "symbol",
      source: SITE_SRC,
      layout: {
        "text-field": ["get", "site_name"],
        "text-size": 11,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
      },
      paint: { "text-color": "#f8fafc", "text-halo-color": "#0f172a", "text-halo-width": 1.5 },
    });

    map.on("click", "rfi-my-sites", (e) => {
      const p = e.features?.[0]?.properties || {};
      new window.mapboxgl.Popup({ offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-family:sans-serif;font-size:12px;line-height:1.5">
            <b>${p.site_name || "Site"}</b><br/>
            ${p.parcel_address || ""}<br/>
            <span style="opacity:.6">${p.owner_name || ""}</span>
          </div>`
        )
        .addTo(map);
    });

    (async () => {
      try {
        const [sites, rings] = await Promise.all([
          base44.entities.SearchResult.list("-created_date", 500),
          base44.entities.SearchHistory.list("-created_date", 200),
        ]);

        const siteFeats = (sites || [])
          .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
          .map((s) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [s.longitude, s.latitude] },
            properties: {
              site_name: s.site_name || "Site",
              parcel_address: s.parcel_address || "",
              owner_name: s.owner_name || "",
            },
          }));
        map.getSource(SITE_SRC)?.setData({ type: "FeatureCollection", features: siteFeats });

        const ringFeats = (rings || [])
          .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
          .map((r) => {
            const c = turf.circle([r.longitude, r.latitude], RING_MILES * 1.60934, {
              units: "kilometers",
              steps: 64,
            });
            c.properties = { label: r.search_label || "" };
            return c;
          });
        map.getSource(RING_SRC)?.setData({ type: "FeatureCollection", features: ringFeats });
      } catch {
        /* leave overlays empty on failure */
      }
    })();
  }, [map, ready]);

  // Toggle visibility.
  useEffect(() => {
    if (!map || !ready) return;
    const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("rfi-my-sites", show.sites);
    vis("rfi-my-sites-label", show.sites);
    vis("rfi-my-rings-fill", show.rings);
    vis("rfi-my-rings-line", show.rings);
  }, [map, ready, show.sites, show.rings]);

  return null;
}