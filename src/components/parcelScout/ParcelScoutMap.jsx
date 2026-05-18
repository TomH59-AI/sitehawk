import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { loadPublicConfig } from "@/lib/publicConfig";

async function loadMapbox() {
  if (window.mapboxgl) return window.mapboxgl;

  await new Promise((resolve, reject) => {
    if (!document.getElementById("parcel-scout-mapbox-css")) {
      const css = document.createElement("link");
      css.id = "parcel-scout-mapbox-css";
      css.rel = "stylesheet";
      css.href = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
      document.head.appendChild(css);
    }

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });

  return window.mapboxgl;
}

function toFeature(result) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [result.longitude, result.latitude] },
    properties: {
      id: result.id,
      site_name: result.site_name || "Unnamed parcel",
      owner_name: result.owner_name || "Unknown owner",
      parcel_address: result.parcel_address || "No address",
      match_score: Math.round(result.match_score || 0),
      parcel_size_acres: result.parcel_size_acres || "",
    },
  };
}

export default function ParcelScoutMap({ results = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);

  const validResults = useMemo(
    () => results.filter((r) => r.latitude != null && r.longitude != null),
    [results]
  );

  const geojson = useMemo(() => ({
    type: "FeatureCollection",
    features: validResults.map(toFeature),
  }), [validResults]);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      const [mapboxgl, config] = await Promise.all([loadMapbox(), loadPublicConfig()]);
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = config.mapboxAccessToken || "";
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: validResults.length ? [validResults[0].longitude, validResults[0].latitude] : [-98.5, 39.5],
        zoom: validResults.length ? 5 : 3.5,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        map.addSource("parcel-scout-results", {
          type: "geojson",
          data: geojson,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 50,
        });

        map.addLayer({
          id: "parcel-scout-clusters",
          type: "circle",
          source: "parcel-scout-results",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": ["step", ["get", "point_count"], "#2563eb", 10, "#0891b2", 30, "#16a34a"],
            "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 32],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.addLayer({
          id: "parcel-scout-cluster-count",
          type: "symbol",
          source: "parcel-scout-results",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });

        map.addLayer({
          id: "parcel-scout-points",
          type: "circle",
          source: "parcel-scout-results",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["step", ["get", "match_score"], "#ef4444", 40, "#f59e0b", 60, "#3b82f6", 80, "#10b981"],
            "circle-radius": 8,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.on("click", "parcel-scout-clusters", (event) => {
          const features = map.queryRenderedFeatures(event.point, { layers: ["parcel-scout-clusters"] });
          const clusterId = features[0].properties.cluster_id;
          map.getSource("parcel-scout-results").getClusterExpansionZoom(clusterId, (error, zoom) => {
            if (error) return;
            map.easeTo({ center: features[0].geometry.coordinates, zoom });
          });
        });

        map.on("click", "parcel-scout-points", (event) => {
          const props = event.features[0].properties;
          const coordinates = event.features[0].geometry.coordinates.slice();
          new mapboxgl.Popup({ offset: 14 })
            .setLngLat(coordinates)
            .setHTML(`
              <div style="font-family:system-ui;min-width:210px">
                <div style="font-weight:700;font-size:13px;margin-bottom:4px">${props.site_name}</div>
                <div style="font-size:11px;color:#666;margin-bottom:6px">${props.parcel_address}</div>
                <div style="font-size:11px"><b>Owner:</b> ${props.owner_name}</div>
                <div style="font-size:11px"><b>Score:</b> ${props.match_score}%</div>
                ${props.parcel_size_acres ? `<div style="font-size:11px"><b>Size:</b> ${props.parcel_size_acres} ac</div>` : ""}
              </div>
            `)
            .addTo(map);
        });

        ["parcel-scout-clusters", "parcel-scout-points"].forEach((layer) => {
          map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
        });

        setReady(true);
      });
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("parcel-scout-results");
    if (!ready || !map || !source) return;

    source.setData(geojson);

    if (validResults.length === 1) {
      map.flyTo({ center: [validResults[0].longitude, validResults[0].latitude], zoom: 13 });
    } else if (validResults.length > 1) {
      const bounds = new window.mapboxgl.LngLatBounds();
      validResults.forEach((r) => bounds.extend([r.longitude, r.latitude]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 700 });
    }
  }, [geojson, ready, validResults]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h2 className="font-heading font-semibold text-foreground">ParcelScout Map View</h2>
          <span className="text-xs text-muted-foreground">· {validResults.length} mapped result{validResults.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <Legend color="#10b981" label="80+" />
          <Legend color="#3b82f6" label="60-79" />
          <Legend color="#f59e0b" label="40-59" />
          <Legend color="#ef4444" label="<40" />
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} className="w-full h-[360px] bg-secondary" />
        {validResults.length === 0 && ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-center px-4">
            <p className="text-sm text-muted-foreground">No mapped ParcelScout results yet. Add parcels with coordinates to see them clustered here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}