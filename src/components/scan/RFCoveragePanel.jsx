import { useEffect, useRef, useState } from "react";

const MAPBOX_TOKEN = "pk.eyJ1IjoidGhvZGdlcyIsImEiOiJjbWlxZzBmbmQwMTA4M2txNGY5OXhyOWppIn0.sjlKabo3VGDU-hKE2Br3bQ";
const TILE_URL = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;

// Friis path-loss + terrain-naïve model
// Returns signal strength in dBm at distance d (meters) for given params
function calcSignaldBm(d, txPowerDbm, antennaGainDbi, freqMhz) {
  if (d < 1) d = 1;
  const lambda = (3e8) / (freqMhz * 1e6);
  const fspl = 20 * Math.log10(4 * Math.PI * d / lambda); // free-space path loss
  return txPowerDbm + antennaGainDbi - fspl;
}

// Convert dBm to opacity/color fraction 0–1 (−60 dBm = excellent, −110 dBm = edge)
function signalToAlpha(dbm) {
  const min = -110, max = -50;
  return Math.max(0, Math.min(1, (dbm - min) / (max - min)));
}

function signalToColor(alpha) {
  // Green → Yellow → Orange → Red → transparent
  if (alpha > 0.75) return `rgba(34,197,94,${alpha * 0.55})`;
  if (alpha > 0.5)  return `rgba(234,179,8,${alpha * 0.55})`;
  if (alpha > 0.25) return `rgba(249,115,22,${alpha * 0.5})`;
  return `rgba(239,68,68,${alpha * 0.45})`;
}

// Draw signal heatmap onto a canvas overlay (Leaflet canvas layer)
function drawHeatmap(canvas, map, L, lat, lon, params) {
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);

  const { txPower, gain, freqMhz, maxRangeM } = params;
  const centerPx = map.latLngToContainerPoint([lat, lon]);

  // Sample grid
  const step = 4; // pixels per sample
  for (let px = 0; px < size; px += step) {
    for (let py = 0; py < size; py += step) {
      const latlng = map.containerPointToLatLng([px, py]);
      const d = L.latLng(lat, lon).distanceTo(latlng);
      if (d > maxRangeM) continue;
      const dbm = calcSignaldBm(d, txPower, gain, freqMhz);
      const alpha = signalToAlpha(dbm);
      if (alpha < 0.05) continue;
      ctx.fillStyle = signalToColor(alpha);
      ctx.fillRect(px, py, step, step);
    }
  }
}

const DEFAULT_PARAMS = {
  txPower: 33,       // dBm  (2W typical small cell)
  gain: 14,          // dBi  (directional panel)
  freqMhz: 850,      // MHz  (low-band LTE)
  maxRangeM: 3000,   // meters
  heightFt: 150,     // ft (for display)
};

const FREQ_PRESETS = [
  { label: "700 MHz (Band 12/17)", value: 700 },
  { label: "850 MHz (Band 5)", value: 850 },
  { label: "1900 MHz (Band 2)", value: 1900 },
  { label: "2100 MHz (Band 4)", value: 2100 },
  { label: "2500 MHz (Band 41)", value: 2500 },
  { label: "3500 MHz (CBRS)", value: 3500 },
];

export default function RFCoveragePanel({ candidate, onClose }) {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [applied, setApplied] = useState(false);
  const mapRef = useRef(null);
  const LRef = useRef(null);
  const canvasLayerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Load Leaflet if not already present
    const initMap = () => {
      const L = window.L;
      LRef.current = L;

      const map = L.map(containerRef.current, {
        center: [candidate.latitude, candidate.longitude],
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer(TILE_URL, {
        tileSize: 512, zoomOffset: -1,
        attribution: "© Mapbox",
        maxZoom: 19,
      }).addTo(map);

      // Tower marker
      const icon = L.divIcon({
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#ef4444;border:2.5px solid #fff;box-shadow:0 0 10px #ef4444aa;"></div>`,
        className: "", iconSize: [16, 16], iconAnchor: [8, 8],
      });
      L.marker([candidate.latitude, candidate.longitude], { icon }).addTo(map)
        .bindPopup(`<b>${candidate.site_name || "Tower Site"}</b>`);

      mapRef.current = map;

      // Re-draw on map move/zoom
      map.on("moveend zoomend", () => {
        if (canvasLayerRef.current && applied) {
          const canvas = canvasLayerRef.current;
          canvas.width = map.getContainer().offsetWidth;
          canvas.height = map.getContainer().offsetHeight;
          drawHeatmap(canvas, map, L, candidate.latitude, candidate.longitude, params);
        }
      });
    };

    if (window.L) {
      initMap();
    } else {
      // Load leaflet CSS + JS
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css"; link.rel = "stylesheet";
        link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
        document.head.appendChild(link);
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  const applyHeatmap = () => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    // Remove old canvas layer
    if (canvasLayerRef.current) {
      canvasLayerRef.current.remove();
      canvasLayerRef.current = null;
    }

    const w = map.getContainer().offsetWidth;
    const h = map.getContainer().offsetHeight;

    // Create a canvas pane overlay
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:500;`;
    map.getContainer().appendChild(canvas);
    canvasLayerRef.current = canvas;

    drawHeatmap(canvas, map, L, candidate.latitude, candidate.longitude, params);

    // Re-draw when map moves
    map.off("moveend zoomend");
    map.on("moveend zoomend", () => {
      canvas.width = map.getContainer().offsetWidth;
      canvas.height = map.getContainer().offsetHeight;
      drawHeatmap(canvas, map, L, candidate.latitude, candidate.longitude, params);
    });

    setApplied(true);
  };

  const clearHeatmap = () => {
    if (canvasLayerRef.current) {
      canvasLayerRef.current.remove();
      canvasLayerRef.current = null;
    }
    setApplied(false);
  };

  const set = (key, val) => setParams(p => ({ ...p, [key]: val }));

  const inputStyle = {
    width: "100%", padding: "5px 8px", borderRadius: 5,
    background: "#0d1829", border: "1px solid #1e3a5f",
    color: "#e2e8f0", fontSize: 12, fontFamily: "'Space Mono', monospace",
    outline: "none",
  };
  const labelStyle = {
    fontSize: 9, color: "#64748b", fontFamily: "'Space Mono', monospace",
    letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3, display: "block",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Rajdhani', sans-serif",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0a0e17", border: "1px solid #1e3a5f",
          borderRadius: 14, width: "min(98vw, 900px)", maxHeight: "92vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 0 40px rgba(0,212,255,0.12)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: "#111827", borderBottom: "1px solid #1e293b",
          padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📡</span>
              <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 16, letterSpacing: "0.03em" }}>
                RF Coverage Simulator
              </span>
              <span style={{
                background: "#00d4ff22", color: "#00d4ff", border: "1px solid #00d4ff44",
                fontSize: 9, fontWeight: 700, padding: "1px 8px", borderRadius: 10,
                letterSpacing: "0.08em", fontFamily: "'Space Mono', monospace",
              }}>Friis Path-Loss Model</span>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {candidate.site_name || "Candidate Site"} · {candidate.latitude?.toFixed(5)}, {candidate.longitude?.toFixed(5)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

          {/* Left panel — parameters */}
          <div style={{
            width: 220, flexShrink: 0, background: "#0d1829",
            borderRight: "1px solid #1e293b", padding: "14px 14px",
            overflowY: "auto", display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div>
              <span style={{ ...labelStyle, color: "#00d4ff" }}>TX Power (dBm)</span>
              <input type="number" min={0} max={60} value={params.txPower}
                onChange={e => set("txPower", +e.target.value)} style={inputStyle} />
              <div style={{ fontSize: 9, color: "#475569", marginTop: 3, fontFamily: "'Space Mono', monospace" }}>
                Typical: 30–43 dBm (1W–20W)
              </div>
            </div>

            <div>
              <span style={{ ...labelStyle, color: "#00d4ff" }}>Antenna Gain (dBi)</span>
              <input type="number" min={0} max={30} value={params.gain}
                onChange={e => set("gain", +e.target.value)} style={inputStyle} />
              <div style={{ fontSize: 9, color: "#475569", marginTop: 3, fontFamily: "'Space Mono', monospace" }}>
                Omni: 2–5 · Panel: 12–18
              </div>
            </div>

            <div>
              <span style={{ ...labelStyle, color: "#00d4ff" }}>Antenna Height (ft)</span>
              <input type="number" min={20} max={500} value={params.heightFt}
                onChange={e => set("heightFt", +e.target.value)} style={inputStyle} />
            </div>

            <div>
              <span style={{ ...labelStyle, color: "#00d4ff" }}>Frequency Band</span>
              <select value={params.freqMhz}
                onChange={e => set("freqMhz", +e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}>
                {FREQ_PRESETS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div>
              <span style={{ ...labelStyle, color: "#00d4ff" }}>Max Range (m)</span>
              <input type="range" min={500} max={10000} step={250} value={params.maxRangeM}
                onChange={e => set("maxRangeM", +e.target.value)}
                style={{ width: "100%", accentColor: "#00d4ff" }} />
              <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
                {(params.maxRangeM / 1000).toFixed(2)} km ({(params.maxRangeM * 0.000621371).toFixed(2)} mi)
              </div>
            </div>

            <button
              onClick={applyHeatmap}
              style={{
                padding: "9px 0", borderRadius: 7, cursor: "pointer",
                background: "linear-gradient(135deg,#0f2850,#1e3a6e)",
                border: "1px solid #2563eb44", color: "#00d4ff",
                fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700,
              }}>
              ▶ Generate Heatmap
            </button>

            {applied && (
              <button onClick={clearHeatmap} style={{
                padding: "7px 0", borderRadius: 7, cursor: "pointer",
                background: "transparent", border: "1px solid #334155",
                color: "#64748b", fontFamily: "'Space Mono', monospace", fontSize: 10,
              }}>Clear Overlay</button>
            )}

            {/* Legend */}
            <div style={{ marginTop: 6, borderTop: "1px solid #1e293b", paddingTop: 12 }}>
              <div style={{ fontSize: 9, color: "#64748b", fontFamily: "'Space Mono', monospace", marginBottom: 8, letterSpacing: "0.06em" }}>
                SIGNAL LEGEND
              </div>
              {[
                { color: "rgba(34,197,94,0.7)", label: "Excellent (> −65 dBm)" },
                { color: "rgba(234,179,8,0.7)", label: "Good (−65 to −80)" },
                { color: "rgba(249,115,22,0.65)", label: "Fair (−80 to −95)" },
                { color: "rgba(239,68,68,0.6)", label: "Weak (< −95 dBm)" },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "'Space Mono', monospace" }}>{label}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 9, color: "#334155", fontFamily: "'Space Mono', monospace", lineHeight: 1.5, borderTop: "1px solid #1e293b", paddingTop: 10 }}>
              ⚠ Simulation uses Friis free-space model. Actual propagation varies with terrain, buildings &amp; foliage. Use as planning estimate only.
            </div>
          </div>

          {/* Right — map */}
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 420 }} />
            {!applied && (
              <div style={{
                position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
                background: "#111827ee", border: "1px solid #1e3a5f", borderRadius: 8,
                padding: "7px 16px", fontSize: 11, color: "#64748b",
                fontFamily: "'Space Mono', monospace", pointerEvents: "none",
              }}>
                Set parameters → click Generate Heatmap
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}