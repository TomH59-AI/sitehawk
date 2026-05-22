/**
 * SCIPViewshedSection — N/S/E/W tree-line 2D viewsheds for the SCIP PHOTOGRAPHS section.
 *
 * Auto-generates four pitched satellite views (60° tilt) at high resolution (1280×720 @2x = 2560×1440)
 * for Target A (the candidate passed in). These slot directly into the SCIP template's
 * PHOTOGRAPHS section (North/South/East/West from Site).
 *
 * Uses Mapbox Static Images API which delivers 4K-class pitched satellite renders with
 * embedded streets + terrain shading — perfect for assessing treeline obstructions.
 */

import { useEffect, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const DIRECTIONS = [
  { label: "North from Site", short: "N", bearing: 0,   color: "#00d4ff" },
  { label: "East from Site",  short: "E", bearing: 90,  color: "#22c55e" },
  { label: "South from Site", short: "S", bearing: 180, color: "#f59e0b" },
  { label: "West from Site",  short: "W", bearing: 270, color: "#a78bfa" },
];

// Offset the map center forward along the bearing so the horizon falls
// in the middle of the frame rather than behind the tower pin.
function offsetCoord(lat, lon, bearing, distMiles = 0.18) {
  const R = 3958.8;
  const d = distMiles;
  const brg = (bearing * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d / R) + Math.cos(lat1) * Math.sin(d / R) * Math.cos(brg)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(brg) * Math.sin(d / R) * Math.cos(lat1),
    Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2)
  );
  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (lon2 * 180) / Math.PI,
  };
}

// 4K-class viewshed render: 1280×720 @2x = 2560×1440 actual pixels.
function buildViewshedUrl(token, lat, lon, bearing) {
  const center = offsetCoord(lat, lon, bearing, 0.18);
  const marker = `pin-l+ef4444(${lon},${lat})`;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${marker}/` +
    `${center.lon},${center.lat},14,${bearing},60/` +
    `1280x720@2x` +
    `?access_token=${token}`
  );
}

export default function SCIPViewshedSection({ candidate }) {
  const [open, setOpen] = useState(true);
  const [token, setToken] = useState("");

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  const lat = candidate?.latitude;
  const lon = candidate?.longitude;

  if (!lat || !lon) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="font-heading font-bold text-foreground">Photographs — N/S/E/W Viewsheds</div>
        <p className="text-sm text-muted-foreground mt-2">No coordinates available for this candidate.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0C1B2E] text-white hover:bg-[#13294a] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">Photographs</span>
          <span className="font-heading font-bold">N · S · E · W from Site — Tree-line 2D Viewsheds</span>
        </div>
        <span className="text-cyan-400 text-sm">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            High-resolution pitched satellite viewsheds (60° tilt, ~0.5-mi corridor) generated for{" "}
            <span className="font-semibold text-foreground">Target A — {candidate?.site_name || "this candidate"}</span>,
            each overlaid with a transparent <span className="font-semibold">conical RF propagation lobe</span> so you can
            visually check for treeline or building obstructions along the frequency path per cardinal sector.
          </p>

          {!token ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {DIRECTIONS.map((dir) => {
                const url = buildViewshedUrl(token, lat, lon, dir.bearing);
                return (
                  <div
                    key={dir.short}
                    className="rounded-lg overflow-hidden border"
                    style={{ borderColor: `${dir.color}55` }}
                  >
                    {/* Header */}
                    <div
                      className="flex items-center justify-between px-3 py-2"
                      style={{ background: "#0d1829", borderBottom: `1px solid ${dir.color}33` }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs"
                          style={{
                            background: `${dir.color}22`,
                            border: `2px solid ${dir.color}66`,
                            color: dir.color,
                          }}
                        >
                          {dir.short}
                        </span>
                        <span className="text-sm font-semibold text-white">{dir.label}</span>
                      </div>
                      <span
                        className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded"
                        style={{ background: `${dir.color}22`, color: dir.color }}
                      >
                        {dir.bearing}°
                      </span>
                    </div>

                    {/* Image + RF propagation cone overlay */}
                    <div className="relative" style={{ aspectRatio: "16/9" }}>
                      <img
                        src={url}
                        alt={`${dir.label} viewshed for ${candidate?.site_name}`}
                        crossOrigin="anonymous"
                        className="absolute inset-0 w-full h-full block"
                        style={{ objectFit: "cover", background: "#0a0e17" }}
                      />
                      {/* Transparent conical RF propagation overlay — apex at tower (bottom-center), fanning to horizon */}
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 w-full h-full pointer-events-none"
                      >
                        <defs>
                          <radialGradient
                            id={`cone-grad-${dir.short}`}
                            cx="50%"
                            cy="100%"
                            r="100%"
                            fx="50%"
                            fy="100%"
                          >
                            <stop offset="0%" stopColor={dir.color} stopOpacity="0.55" />
                            <stop offset="55%" stopColor={dir.color} stopOpacity="0.22" />
                            <stop offset="100%" stopColor={dir.color} stopOpacity="0" />
                          </radialGradient>
                        </defs>
                        {/* 60° main lobe cone */}
                        <polygon
                          points="50,100 15,15 85,15"
                          fill={`url(#cone-grad-${dir.short})`}
                          stroke={dir.color}
                          strokeOpacity="0.5"
                          strokeWidth="0.3"
                        />
                        {/* Beam centerline */}
                        <line
                          x1="50"
                          y1="100"
                          x2="50"
                          y2="15"
                          stroke={dir.color}
                          strokeOpacity="0.7"
                          strokeWidth="0.25"
                          strokeDasharray="1.5 1"
                        />
                        {/* Edge bearings */}
                        <line x1="50" y1="100" x2="15" y2="15" stroke={dir.color} strokeOpacity="0.4" strokeWidth="0.2" />
                        <line x1="50" y1="100" x2="85" y2="15" stroke={dir.color} strokeOpacity="0.4" strokeWidth="0.2" />
                      </svg>
                    </div>

                    {/* Caption */}
                    <div
                      className="px-3 py-1.5 text-[10px] font-mono text-slate-500 flex flex-wrap gap-x-3"
                      style={{ background: "#0d1829" }}
                    >
                      <span style={{ color: dir.color }}>📡 RF cone · {dir.bearing}°</span>
                      <span>· 60° beamwidth</span>
                      <span>· 60° pitch</span>
                      <span>· ~0.5 mi</span>
                      <span>· 2560×1440</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-[10px] text-muted-foreground pt-1">
            Source: Mapbox Satellite-Streets · Pitched static-image renders · Generated for SCIP PHOTOGRAPHS section
          </div>
        </div>
      )}
    </div>
  );
}