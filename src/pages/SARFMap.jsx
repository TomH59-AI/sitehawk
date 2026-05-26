import { useEffect, useRef, useState } from "react";
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

// Geodesic circle polygon using great-circle math (64 steps).
function buildCircle(lat, lon, radiusMiles, steps = 64) {
  const R = 3958.7613; // Earth radius in miles
  const d = radiusMiles / R;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (i * 2 * Math.PI) / steps;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(d) +
        Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
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

export default function SARFMap() {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    return () => {
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, []);

  async function handleDraw() {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return;

    const cfg = await loadPublicConfig();
    const token = cfg.mapboxAccessToken;
    if (!token) return;

    await ensureMapboxLoaded();

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    window.mapboxgl.accessToken = token;
    const map = new window.mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [lonNum, latNum],
      zoom: 13,
    });
    map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
    map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

    map.on("load", () => {
      const halfMile = buildCircle(latNum, lonNum, 0.5);
      const oneMile = buildCircle(latNum, lonNum, 1.0);

      // 0.5-mile yellow ring
      map.addSource("ring-half", { type: "geojson", data: halfMile });
      map.addLayer({
        id: "ring-half-fill",
        type: "fill",
        source: "ring-half",
        paint: { "fill-color": "#facc15", "fill-opacity": 0.05 },
      });
      map.addLayer({
        id: "ring-half-line",
        type: "line",
        source: "ring-half",
        paint: { "line-color": "#facc15", "line-width": 3 },
      });

      // 1.0-mile red ring
      map.addSource("ring-one", { type: "geojson", data: oneMile });
      map.addLayer({
        id: "ring-one-fill",
        type: "fill",
        source: "ring-one",
        paint: { "fill-color": "#ef4444", "fill-opacity": 0.05 },
      });
      map.addLayer({
        id: "ring-one-line",
        type: "line",
        source: "ring-one",
        paint: { "line-color": "#ef4444", "line-width": 3 },
      });

      // Fit map to the 1-mile ring
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
    });

    mapRef.current = map;
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <h1 className="font-heading font-bold text-2xl text-foreground">SARF Map</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Latitude</label>
          <input
            type="text"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="e.g. 33.4484"
            className="px-3 py-2 rounded-md border border-border bg-background text-sm font-mono w-44 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Longitude</label>
          <input
            type="text"
            inputMode="decimal"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            placeholder="e.g. -112.0740"
            className="px-3 py-2 rounded-md border border-border bg-background text-sm font-mono w-44 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          onClick={handleDraw}
          className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Draw
        </button>
      </div>

      <div className="flex-1 rounded-xl overflow-hidden border border-border" style={{ minHeight: "500px" }}>
        <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: "500px" }} />
      </div>
    </div>
  );
}