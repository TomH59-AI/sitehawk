import { useEffect, useRef } from "react";

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

export default function ScanResultsMap({ results, searchCenter, selectedIndex, onPinClick, flyToRef }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const centerMarkerRef = useRef(null);
  const circleRef = useRef(null);
  const LRef = useRef(null);

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

  // Re-render markers when selection changes
  useEffect(() => {
    if (!mapRef.current || !LRef.current) return;
    renderMarkers(LRef.current, mapRef.current);
  }, [selectedIndex, results]);

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
      <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#0a0e17" }} />
    </>
  );
}