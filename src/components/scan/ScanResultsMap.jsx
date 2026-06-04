import { useEffect, useRef, useState } from "react";

const MAPBOX_TOKEN = "pk.eyJ1IjoidGhvZGdlcyIsImEiOiJjbWlxZzBmbmQwMTA4M2txNGY5OXhyOWppIn0.sjlKabo3VGDU-hKE2Br3bQ";
const TILE_URL = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;

function scoreColor(score) {
  if (score >= 75) return "#22c55e";
  if (score >= 60) return "#00d4ff";
  return "#f59e0b";
}

function createNumberedIcon(L, number, score, isSelected) {
  const color = scoreColor(score);
  const size = isSelected ? 36 : 30;
  const html = `
    <div style="
      width:${size}px; height:${size}px; border-radius:50%;
      background:#0a0e17; border: 2.5px solid ${color};
      display:flex; align-items:center; justify-content:center;
      font-family:'Space Mono',monospace; font-size:${isSelected ? 13 : 11}px;
      font-weight:700; color:${color};
      box-shadow: 0 0 ${isSelected ? 12 : 6}px ${color}88;
      transition: all 0.2s;
    ">${number}</div>
  `;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function createTowerIcon(L) {
  const html = `
    <div style="width:18px;height:18px;border-radius:50%;background:#ef4444;border:2px solid #fecaca;box-shadow:0 0 14px #ef444499;display:flex;align-items:center;justify-content:center;">
      <div style="width:6px;height:6px;border-radius:50%;background:#fff;"></div>
    </div>
  `;
  return L.divIcon({ html, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
}

function LegendDot({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}99` }} />
      <span>{label}</span>
    </div>
  );
}

export default function ScanResultsMap({ results, searchCenter, selectedIndex, onPinClick, flyToRef }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const coverageLayerRef = useRef(null);
  const centerMarkerRef = useRef(null);
  const circleRef = useRef(null);
  const LRef = useRef(null);
  const [showCoverage, setShowCoverage] = useState(true);
  const [, forceRerender] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // already initialized

    // Load Leaflet CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.onload = () => {
      const L = window.L;
      LRef.current = L;

      const map = L.map(containerRef.current, {
        center: [searchCenter.lat, searchCenter.lon],
        zoom: 15,
        zoomControl: false,
      });

      L.tileLayer(TILE_URL, {
        tileSize: 512,
        zoomOffset: -1,
        attribution: "© Mapbox © OpenStreetMap",
        maxZoom: 20,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Center dot
      const centerIcon = L.divIcon({
        html: `<div style="width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 0 8px #ef444488;"></div>`,
        className: "",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      centerMarkerRef.current = L.marker([searchCenter.lat, searchCenter.lon], { icon: centerIcon }).addTo(map);

      // Search ring — 0.5 mile radius = ~804.7 meters
      circleRef.current = L.circle([searchCenter.lat, searchCenter.lon], {
        radius: 804.7,
        color: "#00d4ff",
        weight: 1.5,
        opacity: 0.7,
        fillOpacity: 0.05,
        dashArray: "6 4",
      }).addTo(map);

      mapRef.current = map;
      renderMarkers(L, map);
      renderCoverageOverlay(L, map);
      forceRerender(n => n + 1);

      // flyTo handler
      flyToRef.current = (candidate) => {
        map.flyTo([candidate.latitude, candidate.longitude], 17, { duration: 0.8 });
      };
    };
    document.head.appendChild(script);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Re-render markers and coverage when map inputs change
  useEffect(() => {
    if (!mapRef.current || !LRef.current) return;
    renderMarkers(LRef.current, mapRef.current);
    renderCoverageOverlay(LRef.current, mapRef.current);
  }, [selectedIndex, results, showCoverage]);

  function renderMarkers(L, map) {
    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    results.forEach((r, idx) => {
      if (!r.latitude || !r.longitude) return;
      const isSelected = idx === selectedIndex;
      const icon = createNumberedIcon(L, idx + 1, r.match_score, isSelected);
      const marker = L.marker([r.latitude, r.longitude], { icon }).addTo(map);

      const popupHtml = `
        <div style="background:#111827;border:1px solid #1e293b;border-radius:10px;padding:14px;min-width:220px;font-family:'Rajdhani',sans-serif;color:#e2e8f0;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-weight:700;font-size:14px;color:#f8fafc;">${r.site_name || `Site ${idx + 1}`}</span>
            <span style="background:${scoreColor(r.match_score)}22;color:${scoreColor(r.match_score)};font-family:'Space Mono',monospace;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid ${scoreColor(r.match_score)}44;">${r.match_score}%</span>
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">${r.parcel_address || "—"}</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Owner: <span style="color:#cbd5e1;">${r.owner_name || "—"}</span></div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Parcel ID: <span style="color:#00d4ff;font-family:'Space Mono',monospace;">${r.parcel_id || "—"}</span></div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Zoning: <span style="color:#cbd5e1;">${r.zoning_classification || "—"}</span> · ${r.parcel_size_acres ? r.parcel_size_acres + " ac" : "—"}</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">FEMA: <span style="color:#cbd5e1;">${r.fema_risk_factor || "—"}</span></div>
          ${r.match_reason ? `<div style="font-size:10px;color:#64748b;border-top:1px solid #1e293b;padding-top:6px;line-height:1.5;">${r.match_reason}</div>` : ""}
        </div>
      `;

      marker.bindPopup(popupHtml, {
        maxWidth: 280,
        className: "hawk-popup",
      });

      marker.on("click", () => onPinClick(idx));
      markersRef.current.push(marker);
    });

    // Auto-open popup for selected
    if (selectedIndex !== null && markersRef.current[selectedIndex]) {
      markersRef.current[selectedIndex].openPopup();
    }
  }

  function renderCoverageOverlay(L, map) {
    if (coverageLayerRef.current) {
      coverageLayerRef.current.remove();
      coverageLayerRef.current = null;
    }
    if (!showCoverage) return;

    const layer = L.layerGroup().addTo(map);
    coverageLayerRef.current = layer;

    const towerMap = new Map();
    results.forEach((result) => {
      (result.cell_towers || []).forEach((tower) => {
        if (!tower.lat || !tower.lon) return;
        if (haversineMiles(searchCenter.lat, searchCenter.lon, tower.lat, tower.lon) > 0.5) return;
        const key = `${tower.lat.toFixed(5)},${tower.lon.toFixed(5)}`;
        if (!towerMap.has(key)) towerMap.set(key, tower);
      });
    });

    const towers = Array.from(towerMap.values());
    towers.forEach((tower) => {
      L.circle([tower.lat, tower.lon], {
        radius: 402,
        color: "#ef4444",
        weight: 1,
        opacity: 0.35,
        fillColor: "#ef4444",
        fillOpacity: 0.12,
      }).addTo(layer);

      L.marker([tower.lat, tower.lon], { icon: createTowerIcon(L) })
        .bindPopup(`<div style="font-family:'Rajdhani',sans-serif;background:#111827;color:#e2e8f0;border:1px solid #ef444455;border-radius:8px;padding:10px;min-width:180px;">
          <b style="color:#fecaca;">Competitor Tower</b><br/>
          <span style="color:#f8fafc;font-size:13px;font-weight:600;">${tower.operator || "Unknown operator"}</span>
          ${tower.operator_confidence === "matched" ? `<span style="background:#22c55e22;color:#22c55e;font-size:9px;padding:1px 6px;border-radius:8px;margin-left:6px;font-family:'Space Mono',monospace;">✓ CARRIER</span>` : ""}
          ${tower.operator_confidence === "raw_osm" ? `<span style="background:#64748b22;color:#94a3b8;font-size:9px;padding:1px 6px;border-radius:8px;margin-left:6px;font-family:'Space Mono',monospace;">OSM</span>` : ""}
          <br/><span style="color:#94a3b8;font-size:11px;">${tower.type || "Communication"}</span>
          ${tower.asrn ? `<br/><span style="color:#00d4ff;font-size:10px;font-family:'Space Mono',monospace;">FCC ASRN: ${tower.asrn}</span>` : ""}
        </div>`, { className: "hawk-popup" })
        .addTo(layer);
    });

    results.forEach((result) => {
      if (!result.latitude || !result.longitude) return;
      const nearestTower = towers.reduce((closest, tower) => {
        const distance = haversineMiles(result.latitude, result.longitude, tower.lat, tower.lon);
        return distance < closest ? distance : closest;
      }, Infinity);

      if (nearestTower <= 0.35) return;
      const strongDemand = nearestTower === Infinity || nearestTower > 0.5;
      L.circle([result.latitude, result.longitude], {
        radius: strongDemand ? 275 : 190,
        color: strongDemand ? "#22c55e" : "#f59e0b",
        weight: 2,
        opacity: 0.75,
        fillColor: strongDemand ? "#22c55e" : "#f59e0b",
        fillOpacity: strongDemand ? 0.22 : 0.16,
        dashArray: strongDemand ? null : "5 5",
      }).bindPopup(`<div style="font-family:'Rajdhani',sans-serif;background:#111827;color:#e2e8f0;border:1px solid ${strongDemand ? "#22c55e66" : "#f59e0b66"};border-radius:8px;padding:10px;min-width:190px;"><b style="color:${strongDemand ? "#86efac" : "#fcd34d"};">${strongDemand ? "High-demand white space" : "Moderate coverage gap"}</b><br/><span style="color:#94a3b8;font-size:12px;">Nearest mapped tower: ${nearestTower === Infinity ? "none inside radius" : `${nearestTower.toFixed(2)} mi`}</span></div>`, { className: "hawk-popup" }).addTo(layer);
    });
  }

  return (
    <>
      <style>{`
        .hawk-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
          padding: 0 !important;
          border-radius: 10px !important;
        }
        .hawk-popup .leaflet-popup-tip { background: #111827 !important; }
        .hawk-popup .leaflet-popup-content { margin: 0 !important; }
        .leaflet-control-zoom a { background: #111827 !important; color: #00d4ff !important; border-color: #1e293b !important; }
        .leaflet-control-zoom a:hover { background: #1e293b !important; }
      `}</style>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#0a0e17" }} />

        <button
          onClick={() => setShowCoverage((value) => !value)}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 500,
            background: showCoverage ? "#00d4ff22" : "#111827dd",
            border: `1px solid ${showCoverage ? "#00d4ff66" : "#334155"}`,
            color: showCoverage ? "#00d4ff" : "#94a3b8",
            borderRadius: 10,
            padding: "9px 12px",
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          Competitor Coverage {showCoverage ? "On" : "Off"}
        </button>
        {showCoverage && (
          <div style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            zIndex: 500,
            background: "#111827dd",
            border: "1px solid #1e293b",
            color: "#cbd5e1",
            borderRadius: 12,
            padding: "10px 12px",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            backdropFilter: "blur(8px)",
          }}>
            <div style={{ color: "#f8fafc", fontWeight: 700, marginBottom: 6 }}>Coverage Heatmap</div>
            <LegendDot color="#ef4444" label="Existing competitor tower coverage" />
            <LegendDot color="#22c55e" label="High-demand white space" />
            <LegendDot color="#f59e0b" label="Moderate coverage gap" />
          </div>
        )}
      </div>
    </>
  );
}