/**
 * CoverageMap — Mapbox GL satellite map for /coverage-analysis.
 * Click to drop a transmitter pin, render CloudRF PNG_Mercator overlay.
 */

import { useEffect, useRef, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { arcgisPointFeatures } from "@/functions/arcgisPointFeatures";
import CoverageLegend from "./CoverageLegend.jsx";

const PIN_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 24 16 24s16-13 16-24C32 7.2 24.8 0 16 0z" fill="#a855f7" stroke="#fff" stroke-width="2"/>
    <circle cx="16" cy="16" r="6" fill="#fff"/>
  </svg>`;

export default function CoverageMap({ pin, onPlacePin, overlay }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
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
        center: [-98.5, 39.5],
        zoom: 4,
      });
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");

      map.on("load", () => {
        map.addSource("cell-towers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "cell-towers-layer",
          type: "circle",
          source: "cell-towers",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3, 14, 7],
            "circle-color": "#22d3ee",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1.2,
            "circle-opacity": 0.9,
          },
        });

        map.on("click", "cell-towers-layer", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          e.originalEvent?.stopPropagation?.();
          const p = f.properties || {};
          const heightFt = p.AllStruc || p.SupStruc || null;
          onPlacePin({
            lat: e.lngLat.lat,
            lon: e.lngLat.lng,
            source: "cell_tower",
            label: [p.Licensee, p.Callsign].filter(Boolean).join(" · "),
            heightFt: heightFt ? Math.round(Number(heightFt)) : null,
          });
        });
        map.on("mouseenter", "cell-towers-layer", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "cell-towers-layer", () => (map.getCanvas().style.cursor = ""));

        map.on("click", (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ["cell-towers-layer"] });
          if (features.length > 0) return;
          onPlacePin({ lat: e.lngLat.lat, lon: e.lngLat.lng, source: "manual" });
        });

        async function fetchTowers() {
          if (map.getZoom() < 8) {
            map.getSource("cell-towers")?.setData({ type: "FeatureCollection", features: [] });
            return;
          }
          const b = map.getBounds();
          try {
            const resp = await arcgisPointFeatures({
              dataset: "cell_towers",
              bbox: { minLon: b.getWest(), minLat: b.getSouth(), maxLon: b.getEast(), maxLat: b.getNorth() },
              limit: 1000,
            });
            map.getSource("cell-towers")?.setData(resp.data);
          } catch (err) {
            console.warn("cell tower fetch failed:", err.message);
          }
        }
        map.on("moveend", fetchTowers);

        setReady(true);
      });

      mapRef.current = map;
    }
    init();
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (!pin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = "transform: translateY(-20px);";
      el.innerHTML = PIN_SVG;
      markerRef.current = new window.mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([pin.lon, pin.lat])
        .addTo(map);
      map.flyTo({ center: [pin.lon, pin.lat], zoom: Math.max(map.getZoom(), 11), speed: 1.4 });
    } else {
      markerRef.current.setLngLat([pin.lon, pin.lat]);
    }
  }, [pin, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const SRC = "rf-overlay-src";
    const LYR = "rf-overlay-layer";

    if (map.getLayer(LYR)) map.removeLayer(LYR);
    if (map.getSource(SRC)) map.removeSource(SRC);

    if (!overlay?.png_url || !overlay?.bounds) return;

    const raw = overlay.bounds;
    const b = Array.isArray(raw)
      ? { north: raw[0], east: raw[1], south: raw[2], west: raw[3] }
      : raw;
    const coordinates = [
      [b.west, b.north],
      [b.east, b.north],
      [b.east, b.south],
      [b.west, b.south],
    ];

    map.addSource(SRC, { type: "image", url: overlay.png_url, coordinates });
    map.addLayer({
      id: LYR,
      type: "raster",
      source: SRC,
      paint: { "raster-opacity": 0.7, "raster-fade-duration": 200 },
    });

    map.fitBounds(
      [[b.west, b.south], [b.east, b.north]],
      { padding: 60, duration: 800 }
    );
  }, [overlay, ready]);

  return (
    <div className="relative w-full h-[640px] rounded-lg overflow-hidden border border-border">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute top-3 left-3 bg-black/70 text-cyan-300 text-[10px] font-mono px-2 py-1 rounded">
        Click map to drop transmitter · zoom ≥ 8 shows HIFLD cell towers
      </div>
      <CoverageLegend visible={!!overlay?.png_url} />
    </div>
  );
}