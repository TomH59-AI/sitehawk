import { useEffect, useRef } from "react";
import { Plane } from "lucide-react";
import { ensureMapboxLoaded } from "@/lib/section6Proximity";
import { loadPublicConfig } from "@/lib/publicConfig";
import { SKYWAVE } from "@/lib/skywave";

// Live US Airport map — connects a Mapbox GL geojson source DIRECTLY to the FAA
// ArcGIS REST Feature API. No data is downloaded, stored, or cached locally.
// Centered on the selected Target A waypoint.
const FAA_AIRPORTS_GEOJSON =
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/US_Airport/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultType=tile";

export default function LiveAirportMap({ lat, lon, label }) {
  const ref = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadPublicConfig();
      if (cancelled || !ref.current) return;
      await ensureMapboxLoaded();
      if (cancelled || !ref.current) return;
      window.mapboxgl.accessToken = cfg.mapboxAccessToken;

      const center = [Number(lon), Number(lat)];
      const map = new window.mapboxgl.Map({
        container: ref.current,
        style: "mapbox://styles/mapbox/light-v11",
        center,
        zoom: 9,
      });
      mapRef.current = map;
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

      map.on("load", () => {
        // 1 + 2 + 3 — live FAA GeoJSON source with clustering
        map.addSource("airports", {
          type: "geojson",
          data: FAA_AIRPORTS_GEOJSON,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 50,
        });

        // Clustered circles
        map.addLayer({
          id: "airport-clusters",
          type: "circle",
          source: "airports",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": SKYWAVE.blue,
            "circle-opacity": 0.85,
            "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 24],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
        map.addLayer({
          id: "airport-cluster-count",
          type: "symbol",
          source: "airports",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
          paint: { "text-color": "#fff" },
        });

        // 4 — individual airport markers
        map.addLayer({
          id: "airport-markers",
          type: "circle",
          source: "airports",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#0891B2",
            "circle-radius": 6,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });

        // Target A waypoint marker
        const el = document.createElement("div");
        el.style.cssText =
          `width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid ${SKYWAVE.blue};border-radius:50%;box-shadow:0 0 12px rgba(37,99,235,0.7);font-size:14px;`;
        el.textContent = "📡";
        new window.mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(center).addTo(map);

        // Zoom into a cluster on click
        map.on("click", "airport-clusters", (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ["airport-clusters"] });
          const clusterId = features[0].properties.cluster_id;
          map.getSource("airports").getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: features[0].geometry.coordinates, zoom });
          });
        });

        // 5 — popup with live attributes
        map.on("click", "airport-markers", (e) => {
          const f = e.features[0];
          const p = f.properties || {};
          const coords = f.geometry.coordinates.slice();
          const html = `
            <div style="font-family:sans-serif;font-size:12px;line-height:1.5;min-width:160px">
              <div style="font-weight:700;color:${SKYWAVE.navy};margin-bottom:4px">${p.Facility_Name || "Airport"}</div>
              <div><strong>ID:</strong> ${p.Location_ID || "—"}</div>
              <div><strong>City:</strong> ${p.City || "—"}</div>
              <div><strong>State:</strong> ${p.State || "—"}</div>
              <div><strong>Ownership:</strong> ${p.Ownership || "—"}</div>
            </div>`;
          new window.mapboxgl.Popup().setLngLat(coords).setHTML(html).addTo(map);
        });

        const setPointer = (on) => () => { map.getCanvas().style.cursor = on ? "pointer" : ""; };
        ["airport-markers", "airport-clusters"].forEach((id) => {
          map.on("mouseenter", id, setPointer(true));
          map.on("mouseleave", id, setPointer(false));
        });

        requestAnimationFrame(() => requestAnimationFrame(() => { try { map.resize(); } catch { /* disposed */ } }));
      });
    })();
    return () => { cancelled = true; mapRef.current?.remove?.(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: SKYWAVE.line }}>
      <div className="px-3 py-2 flex items-center gap-2 text-white text-xs font-bold uppercase" style={{ background: SKYWAVE.blue }}>
        <Plane className="w-4 h-4" /> Live US Airports {label ? `· ${label}` : ""}
      </div>
      <div ref={ref} className="w-full" style={{ height: 460 }} />
      <div className="px-3 py-1.5 text-[10px]" style={{ color: SKYWAVE.muted }}>
        Live FAA airport data — click a point for details. Source: FAA ArcGIS Feature Service.
      </div>
    </div>
  );
}