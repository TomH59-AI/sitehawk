/**
 * ViewshedPanel — 4-directional antenna viewshed maps (N, S, E, W)
 * Uses Mapbox Static Images API with bearing + pitch to simulate
 * what antennas on top of a tower would see looking in each direction.
 *
 * Each panel shows a ~0.5mi corridor in that direction at a pitched
 * satellite-terrain view so RF engineers can assess treeline, buildings,
 * and obstructions for each azimuth sector.
 */

import { useState } from "react";
import { X, Compass, Download, ChevronDown, ChevronUp } from "lucide-react";

const MAPBOX_TOKEN = "pk.eyJ1IjoidGhvZGdlcyIsImEiOiJjbWlxZzBmbmQwMTA4M2txNGY5OXhyOWppIn0.sjlKabo3VGDU-hKE2Br3bQ";

// Directions: bearing = degrees from north (0=N, 90=E, 180=S, 270=W)
const DIRECTIONS = [
  { label: "North", short: "N", bearing: 0,   color: "#00d4ff", desc: "0° azimuth — looking north" },
  { label: "East",  short: "E", bearing: 90,  color: "#22c55e", desc: "90° azimuth — looking east" },
  { label: "South", short: "S", bearing: 180, color: "#f59e0b", desc: "180° azimuth — looking south" },
  { label: "West",  short: "W", bearing: 270, color: "#a78bfa", desc: "270° azimuth — looking west" },
];

// Offset center point slightly in the direction of view so the horizon
// falls near the center of frame rather than behind the pin
function offsetCoord(lat, lon, bearing, distMiles = 0.25) {
  const R = 3958.8; // Earth radius miles
  const d = distMiles;
  const brg = (bearing * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d / R) + Math.cos(lat1) * Math.sin(d / R) * Math.cos(brg)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(d / R) * Math.cos(lat1),
      Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2)
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (lon2 * 180) / Math.PI,
  };
}

function buildViewshedUrl(lat, lon, bearing, width = 600, height = 340) {
  const center = offsetCoord(lat, lon, bearing, 0.18);
  // pitch=60 gives a strong low-angle "antenna eye" perspective
  // zoom=14 shows roughly 0.5mi corridor
  const cameraSpec = encodeURIComponent(
    `[${center.lon},${center.lat},14,${bearing},60]`
  );

  // Tower marker at actual parcel location
  const marker = `pin-l-tower+ef4444(${lon},${lat})`;

  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${marker}/` +
    `[${center.lon},${center.lat},14,${bearing},60]/` +
    `${width}x${height}@2x` +
    `?access_token=${MAPBOX_TOKEN}`
  );
}

function DirectionCard({ dir, lat, lon, expanded, onToggle }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const url = buildViewshedUrl(lat, lon, dir.bearing);

  return (
    <div style={{
      border: `1px solid ${dir.color}33`,
      borderRadius: 10,
      overflow: "hidden",
      background: "#0d1829",
    }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "#111827",
          border: "none",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: dir.color + "22",
            border: `2px solid ${dir.color}66`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Space Mono', monospace",
            fontWeight: 700, fontSize: 13, color: dir.color,
          }}>{dir.short}</div>
          <div style={{ textAlign: "left" }}>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700, fontSize: 15, color: "#f8fafc",
            }}>{dir.label} Sector View</div>
            <div style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 9, color: "#475569", letterSpacing: "0.05em",
            }}>{dir.desc}</div>
          </div>
        </div>
        <div style={{ color: "#475569" }}>
          {expanded
            ? <ChevronUp size={16} />
            : <ChevronDown size={16} />
          }
        </div>
      </button>

      {/* Map image */}
      {expanded && (
        <div style={{ position: "relative" }}>
          {!imgLoaded && !imgError && (
            <div style={{
              height: 220, display: "flex", alignItems: "center", justifyContent: "center",
              background: "#0a0e17",
            }}>
              <div style={{
                width: 20, height: 20, border: "2px solid #1e293b",
                borderTopColor: dir.color, borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
          {imgError ? (
            <div style={{
              height: 140, display: "flex", alignItems: "center", justifyContent: "center",
              background: "#0a0e17", color: "#475569",
              fontFamily: "'Space Mono', monospace", fontSize: 10,
            }}>
              Map unavailable — check coordinates
            </div>
          ) : (
            <img
              src={url}
              alt={`${dir.label} viewshed`}
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgError(true); setImgLoaded(true); }}
              style={{
                width: "100%",
                display: imgLoaded ? "block" : "none",
                maxHeight: 260,
                objectFit: "cover",
              }}
            />
          )}

          {/* Overlay compass badge */}
          {imgLoaded && !imgError && (
            <div style={{
              position: "absolute", top: 8, left: 8,
              background: "#00000088", backdropFilter: "blur(4px)",
              border: `1px solid ${dir.color}55`,
              borderRadius: 6, padding: "4px 9px",
              fontFamily: "'Space Mono', monospace",
              fontSize: 10, color: dir.color, fontWeight: 700,
              letterSpacing: "0.08em",
            }}>
              {dir.bearing}° · {dir.label.toUpperCase()} SECTOR
            </div>
          )}

          {/* Download link */}
          {imgLoaded && !imgError && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title="Open full-res map"
              style={{
                position: "absolute", top: 8, right: 8,
                background: "#00000088", backdropFilter: "blur(4px)",
                border: "1px solid #334155",
                borderRadius: 6, padding: "4px 8px",
                display: "flex", alignItems: "center", gap: 4,
                color: "#94a3b8", textDecoration: "none",
                fontSize: 10, fontFamily: "'Space Mono', monospace",
              }}
            >
              <Download size={10} /> Open
            </a>
          )}

          {/* RF annotation bar */}
          <div style={{
            background: "#0d1829",
            borderTop: `1px solid ${dir.color}22`,
            padding: "7px 12px",
            display: "flex", flexWrap: "wrap", gap: 8,
            fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#64748b",
          }}>
            <span style={{ color: dir.color }}>📡 Antenna bearing: {dir.bearing}°</span>
            <span>· Pitch: 60° (low-angle)</span>
            <span>· ~0.5 mi corridor</span>
            <span>· Satellite + terrain overlay</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ViewshedPanel({ candidate, onClose }) {
  const { latitude: lat, longitude: lon, site_name, match_score } = candidate;

  // Default: all 4 expanded
  const [expanded, setExpanded] = useState({ N: true, E: true, S: true, W: true });

  const toggle = (short) =>
    setExpanded(prev => ({ ...prev, [short]: !prev[short] }));

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%", maxWidth: 680,
          maxHeight: "90vh", overflowY: "auto",
          background: "#0a0e17",
          border: "1px solid #1e293b",
          borderRadius: 14,
          boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: "#111827",
          borderBottom: "1px solid #1e293b",
          padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderRadius: "14px 14px 0 0",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Compass size={20} color="#00d4ff" />
            <div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700, fontSize: 16, color: "#f8fafc",
              }}>
                Antenna Viewshed — N · S · E · W
              </div>
              <div style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 9, color: "#475569", letterSpacing: "0.06em",
              }}>
                {site_name || "Candidate"} · {lat?.toFixed(5)}, {lon?.toFixed(5)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              background: "#00d4ff22", color: "#00d4ff",
              border: "1px solid #00d4ff44",
              fontFamily: "'Space Mono', monospace",
              fontSize: 10, fontWeight: 700,
              padding: "2px 10px", borderRadius: 20,
            }}>{match_score}% match</span>
            <button
              onClick={onClose}
              style={{
                background: "#1e293b", border: "1px solid #334155",
                borderRadius: 7, padding: "5px 8px",
                cursor: "pointer", color: "#94a3b8",
                display: "flex", alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Explainer */}
        <div style={{
          padding: "10px 18px",
          background: "#0d1829",
          borderBottom: "1px solid #1e293b",
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 12, color: "#64748b", lineHeight: 1.5,
        }}>
          Low-angle satellite views (60° pitch) showing what antennas at the top of a proposed tower would face in each cardinal sector.
          Use these to assess treeline clearance, building obstructions, and line-of-sight before submitting your SCIP.
        </div>

        {/* 4 Direction Cards */}
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {DIRECTIONS.map(dir => (
            <DirectionCard
              key={dir.short}
              dir={dir}
              lat={lat}
              lon={lon}
              expanded={expanded[dir.short]}
              onToggle={() => toggle(dir.short)}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 18px",
          borderTop: "1px solid #1e293b",
          textAlign: "center",
          fontFamily: "'Space Mono', monospace",
          fontSize: 9, color: "#334155", letterSpacing: "0.12em",
        }}>
          VIEWSHED DATA · MAPBOX SATELLITE-STREETS · SITEHAWK RF ANALYSIS
        </div>
      </div>
    </div>
  );
}