import { useEffect, useRef, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const STYLE_URL = "mapbox://styles/mapbox/satellite-streets-v12";
// Colored, high-visibility rings matching the Site Search map:
//   0.5 mi → yellow (primary search ring)
//   1.0 mi → red   (outreach ring)
const RINGS = [
  { miles: 0.5, color: "#EAB308", fillOpacity: 0.10, lineWidth: 2.5 },
  { miles: 1.0, color: "#DC2626", fillOpacity: 0.05, lineWidth: 2.5 },
];
const METERS_PER_MILE = 1609.344;

function buildCircleGeoJSON(center, radiusMeters, points = 96) {
  const coords = [];
  const distanceX = radiusMeters / (111320 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = radiusMeters / 110540;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([center[0] + distanceX * Math.cos(theta), center[1] + distanceY * Math.sin(theta)]);
  }
  coords.push(coords[0]);
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] } };
}

function createSubjectPinEl(lat, lon) {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none;";
  const coordText = (lat != null && lon != null) ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : "";
  el.innerHTML = `
    <div style="
      width:48px;height:48px;border-radius:50%;
      background:linear-gradient(135deg,#1e3a5f,#2563EB);
      border:3px solid #fff;
      box-shadow:0 4px 16px rgba(37,99,235,0.6),0 0 0 4px rgba(37,99,235,0.2);
      display:flex;align-items:center;justify-content:center;
      font-size:24px;line-height:1;
      animation:headlineHawkPulse 2.5s ease-in-out infinite;
    ">🦅</div>
    <div style="
      margin-top:4px;background:rgba(15,23,42,0.92);color:#fff;
      font-family:'Space Mono',monospace;font-size:9px;font-weight:700;
      padding:2px 8px;border-radius:4px;letter-spacing:0.1em;white-space:nowrap;
    ">SARF CENTER</div>
    ${coordText ? `<div style="
      margin-top:3px;background:rgba(255,255,255,0.95);color:#0C1B2E;
      font-family:'Space Mono',monospace;font-size:9px;font-weight:700;
      padding:2px 7px;border-radius:4px;white-space:nowrap;
      border:1px solid rgba(37,99,235,0.4);
    ">${coordText}</div>` : ""}
  `;
  if (!document.getElementById("headline-hawk-pulse-style")) {
    const style = document.createElement("style");
    style.id = "headline-hawk-pulse-style";
    style.textContent = `@keyframes headlineHawkPulse { 0%,100%{box-shadow:0 4px 16px rgba(37,99,235,0.6),0 0 0 4px rgba(37,99,235,0.2)} 50%{box-shadow:0 4px 24px rgba(37,99,235,0.9),0 0 0 8px rgba(37,99,235,0.15)} }`;
    document.head.appendChild(style);
  }
  return el;
}

function createTopPinEl(rank, owner, apn) {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;";
  el.title = `${owner || "Unknown owner"}${apn ? ` · APN ${apn}` : ""}`;
  el.innerHTML = `
    <div style="
      width:32px;height:32px;border-radius:50%;
      background:#00d4ff;border:3px solid #fff;
      display:flex;align-items:center;justify-content:center;
      color:#0a0e17;font-family:'Space Mono',monospace;
      font-size:14px;font-weight:700;
      box-shadow:0 4px 16px rgba(0,212,255,0.55),0 0 0 3px rgba(0,212,255,0.25);
      transition:transform 0.15s;
    ">${rank}</div>
  `;
  el.addEventListener("mouseenter", () => {
    el.firstElementChild.style.transform = "scale(1.12)";
  });
  el.addEventListener("mouseleave", () => {
    el.firstElementChild.style.transform = "scale(1)";
  });
  return el;
}

function createSmallDotEl(owner, score) {
  const el = document.createElement("div");
  el.style.cssText = "width:10px;height:10px;border-radius:50%;background:#00d4ff;border:1.5px solid #fff;box-shadow:0 0 6px rgba(0,212,255,0.6);cursor:pointer;";
  el.title = `${owner || "Unknown"} · ${score ?? "—"}%`;
  return el;
}

export default function HeadlineSatelliteMap({ results = [], searchCenter, onCandidateClick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [token, setToken] = useState("");
  const [mapboxReady, setMapboxReady] = useState(false);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [error, setError] = useState(null);

  // Load Mapbox GL JS once
  useEffect(() => {
    if (window.mapboxgl) { setMapboxReady(true); return; }
    if (!document.getElementById("mapbox-gl-css")) {
      const link = document.createElement("link");
      link.id = "mapbox-gl-css";
      link.rel = "stylesheet";
      link.href = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css";
      document.head.appendChild(link);
    }
    if (!document.getElementById("mapbox-gl-script")) {
      const script = document.createElement("script");
      script.id = "mapbox-gl-script";
      script.src = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js";
      script.onload = () => setMapboxReady(true);
      script.onerror = () => setError("Failed to load Mapbox GL JS");
      document.head.appendChild(script);
    }
  }, []);

  // Load public token
  useEffect(() => {
    loadPublicConfig()
      .then((cfg) => setToken(cfg.mapboxAccessToken || ""))
      .catch(() => setError("Failed to load map credentials"));
  }, []);

  // Init map
  useEffect(() => {
    if (!mapboxReady || !token || !searchCenter || mapRef.current) return;
    try {
      const mapboxgl = window.mapboxgl;
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: [searchCenter.lon, searchCenter.lat],
        zoom: 15,
        attributionControl: false,
        collectResourceTiming: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => setStyleLoaded(true));
      map.on("error", (e) => {
        // Swallow tile/style errors so they never bubble up and unmount React
        console.warn("[HeadlineSatelliteMap] mapbox error:", e?.error?.message || e);
      });
      mapRef.current = map;
    } catch (err) {
      console.error("[HeadlineSatelliteMap] init failed:", err);
      setError(err.message || "Map initialization failed");
    }
    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (_) {}
        mapRef.current = null;
      }
    };
  }, [mapboxReady, token, searchCenter]);

  // Draw rings + markers when style and results are ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded || !searchCenter) return;
    const mapboxgl = window.mapboxgl;
    const center = [searchCenter.lon, searchCenter.lat];

    // Clear old markers
    markersRef.current.forEach((m) => {
      try { m.remove(); } catch (_) {}
    });
    markersRef.current = [];

    // Colored radii rings (outer first so inner sits on top)
    [...RINGS].reverse().forEach(({ miles, color, fillOpacity, lineWidth }) => {
      const id = `ring-${miles}`;
      if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`);
      if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
      if (map.getSource(id)) map.removeSource(id);
      map.addSource(id, { type: "geojson", data: buildCircleGeoJSON(center, miles * METERS_PER_MILE) });
      map.addLayer({
        id: `${id}-fill`,
        type: "fill",
        source: id,
        paint: { "fill-color": color, "fill-opacity": fillOpacity },
      });
      map.addLayer({
        id: `${id}-line`,
        type: "line",
        source: id,
        paint: { "line-color": color, "line-width": lineWidth, "line-dasharray": [4, 2] },
      });
    });

    // SARF center waypoint (🦅 + coordinates)
    const subjectMarker = new mapboxgl.Marker({ element: createSubjectPinEl(searchCenter.lat, searchCenter.lon), anchor: "bottom" })
      .setLngLat(center)
      .addTo(map);
    markersRef.current.push(subjectMarker);

    // Sort candidates by match_score desc — top 3 emphasized, rest as dots
    const sorted = [...results]
      .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
      .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));

    sorted.forEach((r, sortedIdx) => {
      // Original index — what the sidebar's cardRefs expects
      const originalIdx = results.indexOf(r);
      const isTop3 = sortedIdx < 3;
      const el = isTop3
        ? createTopPinEl(sortedIdx + 1, r.owner_name, r.parcel_id)
        : createSmallDotEl(r.owner_name, r.match_score);
      el.addEventListener("click", () => onCandidateClick?.(originalIdx));
      const marker = new mapboxgl.Marker({ element: el, anchor: isTop3 ? "bottom" : "center" })
        .setLngLat([r.longitude, r.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    });

    // Fit bounds to the full 1-mile outer ring so the rings are always visible
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend(center);
    const outerRing = buildCircleGeoJSON(center, 1.0 * METERS_PER_MILE);
    outerRing.geometry.coordinates[0].forEach((pt) => bounds.extend(pt));
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
    }
  }, [styleLoaded, results, searchCenter, onCandidateClick]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0a0e17] text-amber-400 text-sm">
        Headline map unavailable: {error}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" style={{ background: "#0a0e17" }} />
      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-[#0a0e17]/85 backdrop-blur border border-[#1e293b] rounded-lg px-3 py-2 text-[11px] text-slate-200 space-y-1 pointer-events-none">
        <div className="flex items-center gap-2"><span className="text-base">🦅</span> SARF Center</div>
        <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-white inline-flex items-center justify-center text-[8px] font-bold text-[#0a0e17]">1</span> Top candidates</div>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-cyan-400 border border-white" /> Other candidates</div>
        <div className="flex items-center gap-2"><span style={{ width: 18, height: 3, background: "#EAB308", borderRadius: 2 }} /> 0.5-mi ring</div>
        <div className="flex items-center gap-2"><span style={{ width: 18, height: 3, background: "#DC2626", borderRadius: 2 }} /> 1.0-mi ring</div>
      </div>
    </div>
  );
}