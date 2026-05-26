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

    const el = document.createElement("div");
    el.style.cssText = `
      width: 22px; height: 22px; border-radius: 50%;
      background: #06b6d4; border: 3px solid #fff;
      box-shadow: 0 0 0 2px #06b6d4, 0 0 12px rgba(6,182,212,0.8);
    `;
    new window.mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat([lonNum, latNum])
      .setPopup(new window.mapboxgl.Popup({ offset: 18 }).setHTML(
        `<div style="font-family:monospace;font-size:11px;"><strong>SEARCH CENTER</strong><br/>${latNum.toFixed(6)}, ${lonNum.toFixed(6)}</div>`
      ))
      .addTo(map);

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