/**
 * SARFMap — single Mapbox satellite map showing the search center waypoint
 * with two concentric rings: 0.50-mile (yellow) and 1-mile (red).
 * Distance labels are drawn directly on the map.
 */

import { useEffect, useRef, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

// Build a GeoJSON polygon circle around (lat, lon) with given radius in miles.
function buildCircle(lat, lon, radiusMiles, steps = 96) {
  const R = 3958.7613; // earth radius miles
  const d = radiusMiles / R;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (i * 2 * Math.PI) / steps;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
    );
    const lon2 =
      lonRad +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(lat2)
      );
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  };
}

// Bearing-offset point used to place ring distance labels at the top of each ring.
function offsetPoint(lat, lon, radiusMiles, bearingDeg = 0) {
  const R = 3958.7613;
  const d = radiusMiles / R;
  const brng = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
  );
  const lon2 =
    lonRad +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
      Math.cos(d) - Math.sin(latRad) * Math.sin(lat2)
    );
  return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

export default function SARFMap({ lat, lon, label }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (!token || cancelled) return;

      if (!window.mapboxgl) {
        await new Promise((resolve, reject) => {
          const css = document.createElement("link");
          css.rel = "stylesheet";
          css.href = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
          document.head.appendChild(css);
          const s = document.createElement("script");
          s.src = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      if (cancelled) return;

      window.mapboxgl.accessToken = token;
      const map = new window.mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [lon, lat],
        zoom: 13.2,
      });
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

      map.on("load", () => {
        const halfMile = buildCircle(lat, lon, 0.5);
        const oneMile = buildCircle(lat, lon, 1.0);

        map.addSource("ring-1mi", { type: "geojson", data: oneMile });
        map.addLayer({
          id: "ring-1mi-fill",
          type: "fill",
          source: "ring-1mi",
          paint: { "fill-color": "#ef4444", "fill-opacity": 0.08 },
        });
        map.addLayer({
          id: "ring-1mi-line",
          type: "line",
          source: "ring-1mi",
          paint: { "line-color": "#ef4444", "line-width": 3 },
        });

        map.addSource("ring-half", { type: "geojson", data: halfMile });
        map.addLayer({
          id: "ring-half-fill",
          type: "fill",
          source: "ring-half",
          paint: { "fill-color": "#facc15", "fill-opacity": 0.1 },
        });
        map.addLayer({
          id: "ring-half-line",
          type: "line",
          source: "ring-half",
          paint: { "line-color": "#facc15", "line-width": 3 },
        });

        // Distance labels at the top (north) of each ring.
        const labels = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: offsetPoint(lat, lon, 0.5, 0) },
              properties: { label: "0.50 MILE", color: "#facc15" },
            },
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: offsetPoint(lat, lon, 1.0, 0) },
              properties: { label: "1.00 MILE", color: "#ef4444" },
            },
          ],
        };
        map.addSource("ring-labels", { type: "geojson", data: labels });
        map.addLayer({
          id: "ring-labels-layer",
          type: "symbol",
          source: "ring-labels",
          layout: {
            "text-field": ["get", "label"],
            "text-size": 13,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-offset": [0, -0.8],
            "text-anchor": "bottom",
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": ["get", "color"],
            "text-halo-color": "#000",
            "text-halo-width": 2,
          },
        });

        // Center waypoint marker
        const el = document.createElement("div");
        el.style.cssText = `
          width: 22px; height: 22px; border-radius: 50%;
          background: #06b6d4; border: 3px solid #fff;
          box-shadow: 0 0 0 2px #06b6d4, 0 0 12px rgba(6,182,212,0.8);
        `;
        new window.mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([lon, lat])
          .setPopup(
            new window.mapboxgl.Popup({ offset: 18 }).setHTML(
              `<div style="font-family:monospace;font-size:11px;">
                <strong>${label || "SEARCH CENTER"}</strong><br/>
                ${lat.toFixed(6)}, ${lon.toFixed(6)}
              </div>`
            )
          )
          .addTo(map);

        // Fit the 1-mile ring with padding.
        const coords = oneMile.geometry.coordinates[0];
        const lons = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 60, duration: 0 }
        );

        setReady(true);
      });

      mapRef.current = map;
    }
    init();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lon, label]);

  return (
    <div className="relative w-full h-[560px] rounded-lg overflow-hidden border border-border bg-card">
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-cyan-300 text-xs font-mono">
          Loading SARF map…
        </div>
      )}
      {/* Legend */}
      <div className="absolute bottom-3 right-3 bg-black/80 text-white text-[11px] font-mono px-3 py-2 rounded space-y-1 z-[1]">
        <div className="text-cyan-300 tracking-wider mb-1">SARF RINGS</div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-1.5 rounded" style={{ background: "#facc15" }} />
          0.50 mile radius
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-1.5 rounded" style={{ background: "#ef4444" }} />
          1.00 mile radius
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-white" style={{ background: "#06b6d4" }} />
          Search center
        </div>
      </div>
    </div>
  );
}