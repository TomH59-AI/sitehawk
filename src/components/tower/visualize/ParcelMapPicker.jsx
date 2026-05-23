/**
 * ParcelMapPicker — Mapbox GL satellite map showing the Realie parcel boundary
 * GeoJSON. The user clicks/taps inside the parcel to drop the proposed compound
 * center; the click is passed up via onPick({ lat, lon }).
 *
 * Falls back to a coords-only marker if no geometry is available yet.
 */

import { useEffect, useRef, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { MapPin } from "lucide-react";

let mapboxLoadedPromise = null;
function ensureMapbox() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (mapboxLoadedPromise) return mapboxLoadedPromise;
  mapboxLoadedPromise = new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css";
    document.head.appendChild(link);
    const s = document.createElement("script");
    s.src = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js";
    s.onload = () => resolve(window.mapboxgl);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return mapboxLoadedPromise;
}

export default function ParcelMapPicker({ parcelGeometry, centroid, onPick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [pick, setPick] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const cfg = await loadPublicConfig();
        const mapboxgl = await ensureMapbox();
        if (cancelled || !mapboxgl || !containerRef.current) return;
        mapboxgl.accessToken = cfg.mapboxAccessToken;

        const center = centroid?.lat
          ? [centroid.lon, centroid.lat]
          : (parcelGeometry?.coordinates?.[0]?.[0] || [-98.5, 39.5]);

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center,
          zoom: 17,
          pitch: 0,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        map.on("load", () => {
          if (parcelGeometry) {
            map.addSource("parcel", {
              type: "geojson",
              data: { type: "Feature", geometry: parcelGeometry, properties: {} },
            });
            map.addLayer({
              id: "parcel-fill",
              type: "fill",
              source: "parcel",
              paint: { "fill-color": "#22d3ee", "fill-opacity": 0.18 },
            });
            map.addLayer({
              id: "parcel-line",
              type: "line",
              source: "parcel",
              paint: { "line-color": "#22d3ee", "line-width": 3 },
            });

            // Fit the parcel
            try {
              const coords = parcelGeometry.coordinates?.flat?.(parcelGeometry.type === "MultiPolygon" ? 2 : 1) || [];
              if (coords.length > 1) {
                const bounds = coords.reduce(
                  (b, c) => b.extend(c),
                  new mapboxgl.LngLatBounds(coords[0], coords[0])
                );
                map.fitBounds(bounds, { padding: 40, animate: false });
              }
            } catch { /* ignore bounds errors */ }
          }
        });

        map.on("click", (e) => {
          const { lng, lat } = e.lngLat;
          if (markerRef.current) markerRef.current.remove();
          markerRef.current = new mapboxgl.Marker({ color: "#f97316" })
            .setLngLat([lng, lat])
            .addTo(map);
          const p = { lat, lon: lng };
          setPick(p);
          onPick?.(p);
        });
      } catch (e) {
        setError(e.message || "Mapbox failed to load");
      }
    }
    init();
    return () => {
      cancelled = true;
      if (mapRef.current) mapRef.current.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelGeometry, centroid?.lat, centroid?.lon]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="w-full h-[380px] rounded-xl overflow-hidden border border-border" />
      {error && <div className="text-xs text-red-500">{error}</div>}
      <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <span>Click anywhere on the parcel to drop the compound center.</span>
        {pick && (
          <span className="text-foreground flex items-center gap-1">
            <MapPin className="w-3 h-3 text-orange-500" />
            {pick.lat.toFixed(6)}, {pick.lon.toFixed(6)}
          </span>
        )}
      </div>
    </div>
  );
}