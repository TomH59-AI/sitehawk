/**
 * InfrastructureMap — Section 3.1 interactive map.
 *
 * One Mapbox GL JS satellite map with:
 *   • Search ring center waypoint (red pulse)
 *   • Target A tower icon
 *   • Toggle: Power Location (APWA red — poles, transformers, substations, lines)
 *   • Toggle: Fiber Optics Location (APWA orange — telecom cabinets, lines, manholes)
 *   • Built-in Mapbox zoom + compass control
 *
 * Powered by the existing infrastructureAssets backend function (OSM Overpass).
 */

import { useEffect, useRef, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { infrastructureAssets } from "@/functions/infrastructureAssets";
import { Loader2, Zap, Cable } from "lucide-react";

async function loadMapboxGL() {
  if (window.mapboxgl) return window.mapboxgl;
  await new Promise((resolve) => {
    if (document.querySelector('link[data-mapbox-gl-css]')) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.5.2/mapbox-gl.css";
    link.setAttribute("data-mapbox-gl-css", "true");
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });
  await new Promise((resolve, reject) => {
    if (window.mapboxgl) return resolve();
    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.5.2/mapbox-gl.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Mapbox GL JS"));
    document.head.appendChild(script);
  });
  return window.mapboxgl;
}

export default function InfrastructureMap({ centerLat, centerLon, targetLat, targetLon, onAssetsReady }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPower, setShowPower] = useState(true);
  const [showFiber, setShowFiber] = useState(true);
  const [assets, setAssets] = useState(null);

  // Init map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await loadPublicConfig();
        const token = cfg.mapboxAccessToken;
        if (!token) throw new Error("Mapbox token missing");
        const mapboxgl = await loadMapboxGL();
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = token;

        const lat = parseFloat(targetLat || centerLat);
        const lon = parseFloat(targetLon || centerLon);

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [isFinite(lon) ? lon : -82.4572, isFinite(lat) ? lat : 27.9506],
          zoom: 14,
          attributionControl: false,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
        map.addControl(new mapboxgl.FullscreenControl(), "top-right");
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;

          // Center waypoint marker (red pulse)
          if (isFinite(parseFloat(centerLat)) && isFinite(parseFloat(centerLon))) {
            const el = document.createElement("div");
            el.style.cssText =
              "width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 0 0 4px rgba(220,38,38,0.35);";
            new mapboxgl.Marker(el)
              .setLngLat([parseFloat(centerLon), parseFloat(centerLat)])
              .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML("<strong>SARF Center</strong>"))
              .addTo(map);
          }

          // Target A tower icon
          if (isFinite(parseFloat(targetLat)) && isFinite(parseFloat(targetLon))) {
            const el = document.createElement("div");
            el.innerHTML = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px #00d4ff)"><path d="M12 2L8 7l4 -2 4 2z"/><path d="M12 5v17"/><path d="M5 22h14"/><path d="M7 12h10"/><path d="M6 17h12"/></svg>`;
            new mapboxgl.Marker({ element: el, anchor: "bottom" })
              .setLngLat([parseFloat(targetLon), parseFloat(targetLat)])
              .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML("<strong>Target A · Tower</strong>"))
              .addTo(map);
          }

          setReady(true);
        });
      } catch (e) {
        if (!cancelled) setError(e.message || "Map init failed");
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) mapRef.current.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addAssetLayers(map, electric, fiber) {
    const removeIfExists = (id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };
    ["power-lines", "power-points", "fiber-lines", "fiber-points"].forEach(removeIfExists);

    // Electric lines (APWA red)
    map.addSource("power-lines", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: electric.lines.map((l) => ({
          type: "Feature",
          properties: { voltage: l.voltage || "" },
          geometry: { type: "LineString", coordinates: l.coords },
        })),
      },
    });
    map.addLayer({
      id: "power-lines", type: "line", source: "power-lines",
      paint: { "line-color": "#dc2626", "line-width": 2.5, "line-opacity": 0.85 },
    });
    map.addSource("power-points", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: electric.points.map((p) => ({
          type: "Feature",
          properties: { kind: p.kind },
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        })),
      },
    });
    map.addLayer({
      id: "power-points", type: "circle", source: "power-points",
      paint: {
        "circle-radius": ["match", ["get", "kind"], "substation", 7, "transformer", 5, 3.5],
        "circle-color": "#dc2626", "circle-stroke-color": "#fff", "circle-stroke-width": 1.2, "circle-opacity": 0.9,
      },
    });

    // Fiber lines (APWA orange)
    map.addSource("fiber-lines", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: fiber.lines.map((l) => ({
          type: "Feature",
          properties: { operator: l.operator || "" },
          geometry: { type: "LineString", coordinates: l.coords },
        })),
      },
    });
    map.addLayer({
      id: "fiber-lines", type: "line", source: "fiber-lines",
      paint: { "line-color": "#f97316", "line-width": 2.5, "line-opacity": 0.85, "line-dasharray": [2, 1.5] },
    });
    map.addSource("fiber-points", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: fiber.points.map((p) => ({
          type: "Feature",
          properties: { kind: p.kind },
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        })),
      },
    });
    map.addLayer({
      id: "fiber-points", type: "circle", source: "fiber-points",
      paint: {
        "circle-radius": 4, "circle-color": "#f97316",
        "circle-stroke-color": "#fff", "circle-stroke-width": 1.2, "circle-opacity": 0.9,
      },
    });
  }

  async function handleGenerate() {
    const lat = parseFloat(targetLat || centerLat);
    const lon = parseFloat(targetLon || centerLon);
    if (!isFinite(lat) || !isFinite(lon) || !mapRef.current || !ready) {
      setError("Map not ready or Target A coordinates missing.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await infrastructureAssets({ lat, lon, radius_m: 1609 });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setAssets(data);
      addAssetLayers(mapRef.current, data.electric, data.fiber);
      onAssetsReady?.(data);
    } catch (e) {
      setError(e.message || "Asset lookup failed");
    } finally {
      setLoading(false);
    }
  }

  // Visibility toggles
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    ["power-lines", "power-points"].forEach((id) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", showPower ? "visible" : "none");
    });
  }, [showPower, ready, assets]);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    ["fiber-lines", "fiber-points"].forEach((id) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", showFiber ? "visible" : "none");
    });
  }, [showFiber, ready, assets]);

  return (
    <div className="bg-card">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPower((p) => !p)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider border transition-colors ${
              showPower ? "bg-red-600 text-white border-red-700" : "bg-card text-red-700 border-red-300"
            }`}
          >
            <Zap className="w-3 h-3" /> POWER {showPower ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => setShowFiber((p) => !p)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider border transition-colors ${
              showFiber ? "bg-orange-500 text-white border-orange-600" : "bg-card text-orange-700 border-orange-300"
            }`}
          >
            <Cable className="w-3 h-3" /> FIBER {showFiber ? "ON" : "OFF"}
          </button>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading || !ready}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold tracking-wider bg-cyan-500 text-[#0C1B2E] hover:bg-cyan-400 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "🛰"}
          {loading ? "PULLING ASSETS…" : assets ? "REFRESH OVERLAYS" : "GENERATE INFRASTRUCTURE OVERLAYS"}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}

      <div ref={containerRef} style={{ width: "100%", height: 520 }} />

      {assets && (
        <div className="px-3 py-2 border-t border-border text-[11px] font-mono text-muted-foreground">
          {assets.electric.count} electric assets · {assets.fiber.count} fiber/telecom assets within 1.0 mi
        </div>
      )}
    </div>
  );
}