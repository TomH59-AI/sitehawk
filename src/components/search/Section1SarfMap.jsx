import { useEffect, useRef } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";

let mapboxLoadingPromise = null;
async function ensureMapboxLoaded() {
  if (window.mapboxgl) return;
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = MAPBOX_CSS;
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = MAPBOX_JS;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  await mapboxLoadingPromise;
}

// Geodesic circle polygon (great-circle math).
function buildCircle(lat, lon, radiusMiles, steps = 64) {
  const R = 3958.7613;
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
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}

// Section One SARF output — ONE MapBox render: center waypoint, the selected
// radius ring, and the agent-name label. No other layers, no other fetches.
export default function Section1SarfMap({ lat, lon, radiusMiles = 0.5, agentName, onReady }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (!token || cancelled) return;
      await ensureMapboxLoaded();
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      window.mapboxgl.accessToken = token;
      const map = new window.mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [lon, lat],
        zoom: 13,
      });
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

      map.on("load", () => {
        const ring = buildCircle(lat, lon, radiusMiles);
        map.addSource("sarf-ring", { type: "geojson", data: ring });
        map.addLayer({
          id: "sarf-ring-fill",
          type: "fill",
          source: "sarf-ring",
          paint: { "fill-color": "#ef4444", "fill-opacity": 0.06 },
        });
        map.addLayer({
          id: "sarf-ring-line",
          type: "line",
          source: "sarf-ring",
          paint: { "line-color": "#ef4444", "line-width": 3 },
        });

        // Center waypoint marker + agent-name label popup.
        const el = document.createElement("div");
        el.style.cssText = `
          width: 22px; height: 22px; border-radius: 50%;
          background: #06b6d4; border: 3px solid #fff;
          box-shadow: 0 0 0 2px #06b6d4, 0 0 12px rgba(6,182,212,0.8);
        `;
        const marker = new window.mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([lon, lat])
          .addTo(map);
        if (agentName && agentName.trim()) {
          marker.setPopup(
            new window.mapboxgl.Popup({ offset: 18, closeButton: false })
              .setHTML(`<div style="font-family:monospace;font-size:11px;"><strong>${agentName}</strong><br/>${lat.toFixed(6)}, ${lon.toFixed(6)}</div>`)
          );
          marker.togglePopup();
        }

        const coords = ring.geometry.coordinates[0];
        const lons = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          { padding: 60, duration: 0 }
        );
        onReady?.();
      });

      mapRef.current = map;
    }
    draw();
    return () => {
      cancelled = true;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, radiusMiles, agentName]);

  return (
    <div className="rounded-xl overflow-hidden border border-border" style={{ minHeight: "500px" }}>
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: "500px" }} />
    </div>
  );
}