/**
 * PowerLinesMap — Mapbox GL map that renders HIFLD transmission line segments
 * for the current viewport. Re-fetches on moveend. Click a segment to surface
 * its SUB_1/SUB_2/OWNER/VOLTAGE in a popup (handled by parent via onSelect).
 *
 * Lines are colored by voltage class:
 *   ≥500 kV → red       ≥230 kV → orange
 *   ≥100 kV → yellow    <100 kV → cyan
 */

import { useEffect, useRef, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { hifldTransmissionLines } from "@/functions/hifldTransmissionLines";
import { arcgisPointFeatures } from "@/functions/arcgisPointFeatures";

const LINE_COLOR_EXPR = [
  "case",
  [">=", ["to-number", ["get", "VOLTAGE"], 0], 500], "#ef4444",
  [">=", ["to-number", ["get", "VOLTAGE"], 0], 230], "#f97316",
  [">=", ["to-number", ["get", "VOLTAGE"], 0], 100], "#eab308",
  "#22d3ee",
];

export default function PowerLinesMap({ ownerFilter, onSelect, onCountChange, initialCenter, showCellTowers = false, onTowerCountChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastReqId = useRef(0);

  // Init map
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
        style: "mapbox://styles/mapbox/dark-v11",
        center: initialCenter || [-98.5, 39.5],
        zoom: initialCenter ? 9 : 4,
      });
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");

      map.on("load", () => {
        map.addSource("hifld-lines", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "hifld-lines-layer",
          type: "line",
          source: "hifld-lines",
          paint: {
            "line-color": LINE_COLOR_EXPR,
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 10, 2.2, 14, 3.5],
            "line-opacity": 0.9,
          },
        });
        map.addLayer({
          id: "hifld-lines-hit",
          type: "line",
          source: "hifld-lines",
          paint: { "line-color": "#000", "line-opacity": 0, "line-width": 14 },
        });

        map.on("click", "hifld-lines-hit", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          onSelect?.(f.properties, [e.lngLat.lng, e.lngLat.lat]);
        });
        map.on("mouseenter", "hifld-lines-hit", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "hifld-lines-hit", () => (map.getCanvas().style.cursor = ""));

        // Cell tower layer (HIFLD Cellular_Towers)
        map.addSource("cell-towers", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "cell-towers-layer",
          type: "circle",
          source: "cell-towers",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 12, 6, 16, 9],
            "circle-color": "#a855f7",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
            "circle-opacity": 0.9,
          },
        });
        map.on("click", "cell-towers-layer", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          onSelect?.({ __kind: "cell_tower", ...f.properties }, [e.lngLat.lng, e.lngLat.lat]);
        });
        map.on("mouseenter", "cell-towers-layer", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "cell-towers-layer", () => (map.getCanvas().style.cursor = ""));

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
  }, []);

  // Fetch on moveend or when owner filter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    async function fetchForViewport() {
      const b = map.getBounds();
      const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      // Skip if zoomed way out — too many lines, server-killer.
      if (map.getZoom() < 5) {
        map.getSource("hifld-lines")?.setData({ type: "FeatureCollection", features: [] });
        onCountChange?.(0);
        return;
      }
      const reqId = ++lastReqId.current;
      setLoading(true);
      try {
        const resp = await hifldTransmissionLines({ bbox, owner: ownerFilter || undefined, limit: 2000 });
        if (reqId !== lastReqId.current) return; // stale
        const fc = resp.data;
        map.getSource("hifld-lines")?.setData(fc);
        onCountChange?.(fc.count || 0);
      } catch (err) {
        console.warn("HIFLD fetch failed:", err.message);
      } finally {
        if (reqId === lastReqId.current) setLoading(false);
      }
    }

    fetchForViewport();
    map.on("moveend", fetchForViewport);
    return () => map.off("moveend", fetchForViewport);
  }, [ownerFilter, ready]);

  // Toggle cell tower visibility + fetch on moveend when enabled
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    map.setLayoutProperty("cell-towers-layer", "visibility", showCellTowers ? "visible" : "none");
    if (!showCellTowers) {
      map.getSource("cell-towers")?.setData({ type: "FeatureCollection", features: [] });
      onTowerCountChange?.(0);
      return;
    }

    let towerReqId = 0;
    async function fetchTowers() {
      if (map.getZoom() < 7) {
        map.getSource("cell-towers")?.setData({ type: "FeatureCollection", features: [] });
        onTowerCountChange?.(0);
        return;
      }
      const b = map.getBounds();
      const bbox = {
        minLon: b.getWest(),
        minLat: b.getSouth(),
        maxLon: b.getEast(),
        maxLat: b.getNorth(),
      };
      const reqId = ++towerReqId;
      try {
        const resp = await arcgisPointFeatures({ dataset: "cell_towers", bbox, limit: 2000 });
        if (reqId !== towerReqId) return;
        const fc = resp.data;
        map.getSource("cell-towers")?.setData(fc);
        onTowerCountChange?.(fc.count || 0);
      } catch (err) {
        console.warn("Cell tower fetch failed:", err.message);
      }
    }

    fetchTowers();
    map.on("moveend", fetchTowers);
    return () => map.off("moveend", fetchTowers);
  }, [showCellTowers, ready]);

  return (
    <div className="relative w-full h-[640px] rounded-lg overflow-hidden border border-border">
      <div ref={containerRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute top-3 left-3 bg-black/70 text-cyan-300 text-[11px] font-mono px-2 py-1 rounded">
          LOADING SEGMENTS…
        </div>
      )}
      <div className="absolute bottom-3 left-3 bg-black/70 text-white text-[10px] font-mono px-2 py-1.5 rounded space-y-0.5">
        <div className="text-cyan-300 mb-1">VOLTAGE CLASS</div>
        <div><span className="inline-block w-3 h-1 bg-[#ef4444] mr-1.5 align-middle" />≥ 500 kV</div>
        <div><span className="inline-block w-3 h-1 bg-[#f97316] mr-1.5 align-middle" />≥ 230 kV</div>
        <div><span className="inline-block w-3 h-1 bg-[#eab308] mr-1.5 align-middle" />≥ 100 kV</div>
        <div><span className="inline-block w-3 h-1 bg-[#22d3ee] mr-1.5 align-middle" />&lt; 100 kV</div>
        {showCellTowers && (
          <div className="pt-1 mt-1 border-t border-white/20">
            <div><span className="inline-block w-2 h-2 rounded-full bg-[#a855f7] mr-1.5 align-middle" />Cell Tower</div>
          </div>
        )}
      </div>
    </div>
  );
}