/**
 * SCIPInfrastructureTab — Tab 3 of the SCIP.
 *
 * Three satellite renders, all using the same SARF base (center waypoint + 0.5/1.0-mi rings):
 *   1. Clean Satellite — with a SiteHawk recon-style hawk-eye reticle overlay (compass rose,
 *      crosshair, corner brackets) so the page doesn't look empty
 *   2. Electric Infrastructure — APWA RED pins for poles/transformers/substations + red
 *      polylines for overhead/underground power
 *   3. Fiber / Telecom — APWA ORANGE pins for telecom cabinets/manholes/splices + orange
 *      polylines for communication lines
 *
 * Asset locations come from the new `infrastructureAssets` backend function which queries
 * OpenStreetMap Overpass for everything within a 1-mile radius of the SARF center.
 */

import { useEffect, useMemo, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { infrastructureAssets } from "@/functions/infrastructureAssets";

const IMG_W = 1280;
const IMG_H = 1024;
const ZOOM = 13.6;

// APWA color standards
const APWA_RED = "DC2626";    // Electric
const APWA_ORANGE = "F97316"; // Communication / fiber

// ─── Geometry ────────────────────────────────────────────────────────
// 36 points + 5-decimal precision keeps the encoded GeoJSON small enough
// to stay under Mapbox's static API 8192-char URL limit (96 points blew
// past it and silently dropped the rings from every map).
function buildCircle(lat, lon, radiusMiles, points = 36) {
  const coords = [];
  const radiusM = radiusMiles * 1609.344;
  const dx = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = radiusM / 110540;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([
      +(lon + dx * Math.cos(theta)).toFixed(5),
      +(lat + dy * Math.sin(theta)).toFixed(5),
    ]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

function ringFeatures(lat, lon) {
  return [
    {
      type: "Feature",
      properties: { stroke: "#DC2626", "stroke-width": 3, "stroke-opacity": 0.95, "fill-opacity": 0 },
      geometry: buildCircle(lat, lon, 1.0),
    },
    {
      type: "Feature",
      properties: { stroke: "#EAB308", "stroke-width": 3, "stroke-opacity": 0.95, "fill-opacity": 0 },
      geometry: buildCircle(lat, lon, 0.5),
    },
  ];
}

function lineFeature(coords, color, width = 3, opacity = 0.85) {
  return {
    type: "Feature",
    properties: { stroke: `#${color}`, "stroke-width": width, "stroke-opacity": opacity, "fill-opacity": 0 },
    geometry: { type: "LineString", coordinates: coords },
  };
}

function encodeGeoJSON(features) {
  return encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }));
}

// ─── Mapbox static URL builder ───────────────────────────────────────
//
// IMPORTANT: Mapbox static URLs have a ~8KB length cap. Hundreds of pin markers
// blow that budget instantly, so we only pin a sampled subset and render lines
// as a single GeoJSON FeatureCollection (which is far more compact than many
// path() overlays).
function sample(arr, max) {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

function buildBaseUrl(token, lat, lon, geoFeatures, pinSpecs) {
  const geo = encodeGeoJSON(geoFeatures);
  const waypoint = `pin-l-circle+2563EB(${lon},${lat})`;
  const overlays = [`geojson(${geo})`, waypoint, ...pinSpecs].filter(Boolean).join(",");
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${overlays}/${lon},${lat},${ZOOM},0,0/${IMG_W}x${IMG_H}@2x` +
    `?access_token=${token}`
  );
}

function buildCleanUrl(token, lat, lon) {
  return buildBaseUrl(token, lat, lon, ringFeatures(lat, lon), []);
}

function buildElectricUrl(token, lat, lon, electric) {
  const lineFeats = (electric?.lines || []).map((l) => lineFeature(l.coords, APWA_RED, 3, 0.9));
  // Cap to 12 point pins to stay under URL length limit (~8KB)
  const pinPts = sample(electric?.points || [], 12);
  const pins = pinPts.map((p) => `pin-s+${APWA_RED}(${p.lon},${p.lat})`);
  return buildBaseUrl(token, lat, lon, [...ringFeatures(lat, lon), ...lineFeats], pins);
}

function buildFiberUrl(token, lat, lon, fiber) {
  const lineFeats = (fiber?.lines || []).map((l) => lineFeature(l.coords, APWA_ORANGE, 4, 0.95));
  const pinPts = sample(fiber?.points || [], 12);
  const pins = pinPts.map((p) => `pin-s+${APWA_ORANGE}(${p.lon},${p.lat})`);
  return buildBaseUrl(token, lat, lon, [...ringFeatures(lat, lon), ...lineFeats], pins);
}

// ─── Hawk-eye reticle overlay for the "clean" satellite map ──────────
function HawkReticleOverlay() {
  return (
    <svg
      viewBox="0 0 1280 1024"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ mixBlendMode: "screen" }}
    >
      <defs>
        <radialGradient id="reticleGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00d4ff" stopOpacity="0" />
          <stop offset="70%" stopColor="#00d4ff" stopOpacity="0" />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <rect width="1280" height="1024" fill="url(#reticleGlow)" />

      {/* Corner brackets */}
      {[
        { x: 60, y: 60, dx: 1, dy: 1 },
        { x: 1220, y: 60, dx: -1, dy: 1 },
        { x: 60, y: 964, dx: 1, dy: -1 },
        { x: 1220, y: 964, dx: -1, dy: -1 },
      ].map((c, i) => (
        <g key={i} stroke="#00d4ff" strokeWidth="3" fill="none" opacity="0.85">
          <line x1={c.x} y1={c.y} x2={c.x + 60 * c.dx} y2={c.y} />
          <line x1={c.x} y1={c.y} x2={c.x} y2={c.y + 60 * c.dy} />
        </g>
      ))}

      {/* Compass rose (top-left) */}
      <g transform="translate(140, 140)" fontFamily="'Space Mono', monospace">
        <circle cx="0" cy="0" r="50" fill="#0a0e17" fillOpacity="0.7" stroke="#00d4ff" strokeWidth="2" />
        <polygon points="0,-40 8,0 0,40 -8,0" fill="#00d4ff" />
        <polygon points="0,-40 8,0 0,0" fill="#22d3ee" />
        <text x="0" y="-55" textAnchor="middle" fill="#00d4ff" fontSize="14" fontWeight="700">N</text>
        <text x="0" y="63" textAnchor="middle" fill="#00d4ff" fontSize="14" fontWeight="700">S</text>
        <text x="-58" y="5" textAnchor="middle" fill="#00d4ff" fontSize="14" fontWeight="700">W</text>
        <text x="58" y="5" textAnchor="middle" fill="#00d4ff" fontSize="14" fontWeight="700">E</text>
      </g>

      {/* Scale bar (bottom-left) */}
      <g transform="translate(80, 940)" fontFamily="'Space Mono', monospace">
        <rect x="0" y="0" width="200" height="28" fill="#0a0e17" fillOpacity="0.8" stroke="#00d4ff" strokeWidth="1" rx="3" />
        <line x1="15" y1="20" x2="185" y2="20" stroke="#00d4ff" strokeWidth="2" />
        <line x1="15" y1="14" x2="15" y2="26" stroke="#00d4ff" strokeWidth="2" />
        <line x1="100" y1="14" x2="100" y2="26" stroke="#00d4ff" strokeWidth="2" />
        <line x1="185" y1="14" x2="185" y2="26" stroke="#00d4ff" strokeWidth="2" />
        <text x="100" y="12" textAnchor="middle" fill="#00d4ff" fontSize="11" fontWeight="700">~ 1 MILE</text>
      </g>

      {/* Top-right callsign tag */}
      <g transform="translate(1080, 100)" fontFamily="'Space Mono', monospace">
        <rect x="0" y="0" width="160" height="50" fill="#0a0e17" fillOpacity="0.8" stroke="#00d4ff" strokeWidth="1" rx="3" />
        <text x="80" y="20" textAnchor="middle" fill="#00d4ff" fontSize="11" fontWeight="700" letterSpacing="2">SARF · BASE</text>
        <text x="80" y="38" textAnchor="middle" fill="#94a3b8" fontSize="9" letterSpacing="1.5">SITEHAWK RECON</text>
      </g>
    </svg>
  );
}

// ─── Single map card ─────────────────────────────────────────────────
function MapCard({ title, badge, badgeColor, caption, url, overlay, stats }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-[#0C1B2E] text-white">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded"
            style={{ background: `#${badgeColor}22`, color: `#${badgeColor}`, border: `1px solid #${badgeColor}55` }}
          >
            {badge}
          </span>
          <span className="font-heading font-bold">{title}</span>
        </div>
        {stats && (
          <span className="text-[10px] font-mono text-cyan-400">{stats}</span>
        )}
      </div>
      <div className="p-4 space-y-2">
        <p className="text-xs text-muted-foreground">{caption}</p>
        <div className="relative rounded-lg overflow-hidden border border-border bg-[#0a0e17]">
          {url ? (
            <img
              src={url}
              alt={title}
              crossOrigin="anonymous"
              className="w-full block"
              style={{ aspectRatio: `${IMG_W}/${IMG_H}`, objectFit: "cover" }}
            />
          ) : (
            <div style={{ aspectRatio: `${IMG_W}/${IMG_H}` }} className="flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          )}
          {overlay}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────
export default function SCIPInfrastructureTab({ candidate, searchCenter }) {
  const [open, setOpen] = useState(true);
  const [token, setToken] = useState("");
  const [assets, setAssets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  const sarfLat = searchCenter?.lat ?? candidate?.latitude;
  const sarfLon = searchCenter?.lon ?? candidate?.longitude;

  useEffect(() => {
    if (sarfLat == null || sarfLon == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    infrastructureAssets({ lat: sarfLat, lon: sarfLon })
      .then((res) => setAssets(res.data))
      .catch((e) => setError(e.message || "Failed to fetch infrastructure assets"))
      .finally(() => setLoading(false));
  }, [sarfLat, sarfLon]);

  const urls = useMemo(() => {
    if (!token || sarfLat == null || sarfLon == null) return null;
    return {
      clean: buildCleanUrl(token, sarfLat, sarfLon),
      electric: buildElectricUrl(token, sarfLat, sarfLon, assets?.electric),
      fiber: buildFiberUrl(token, sarfLat, sarfLon, assets?.fiber),
    };
  }, [token, sarfLat, sarfLon, assets]);

  if (sarfLat == null || sarfLon == null) return null;

  const electricCount = assets?.electric?.count || 0;
  const fiberCount = assets?.fiber?.count || 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0C1B2E] text-white hover:bg-[#13294a] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">Infrastructure</span>
          <span className="font-heading font-bold">Utility Overview — Satellite · Electric · Fiber</span>
        </div>
        <span className="text-cyan-400 text-sm">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Three views of the SARF: a clean satellite base with recon reticle, electric infrastructure (APWA red),
            and fiber/telecom (APWA orange). All asset locations sourced from OpenStreetMap within 1 mile of the SARF center.
          </p>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400 font-mono">
              {error}
            </div>
          )}

          {/* 1. Clean satellite with hawk-eye reticle */}
          <MapCard
            title="Clean Satellite — SARF Recon View"
            badge="01 · BASE"
            badgeColor="00d4ff"
            caption="High-resolution satellite of the SARF with SiteHawk recon overlay — compass rose, scale bar, and corner brackets."
            url={urls?.clean}
            overlay={<HawkReticleOverlay />}
            stats={`${sarfLat.toFixed(5)}, ${sarfLon.toFixed(5)}`}
          />

          {/* 2. Electric infrastructure */}
          <MapCard
            title="Electric Infrastructure"
            badge="02 · APWA RED"
            badgeColor={APWA_RED}
            caption="Power poles, transformers, substations, and overhead/underground lines within 1 mile of the SARF center."
            url={urls?.electric}
            stats={loading ? "Locating..." : `${electricCount} electric assets · OSM`}
          />

          {/* 3. Fiber / telecom */}
          <MapCard
            title="Fiber / Telecom Infrastructure"
            badge="03 · APWA ORANGE"
            badgeColor={APWA_ORANGE}
            caption="Telecom cabinets, manholes, splice points, and communication lines within 1 mile of the SARF center."
            url={urls?.fiber}
            stats={loading ? "Locating..." : `${fiberCount} fiber/telecom assets · OSM`}
          />

          <div className="text-[10px] text-muted-foreground pt-1">
            Sources: Mapbox Satellite-Streets (base) · OpenStreetMap Overpass (electric + fiber/telecom assets) ·
            APWA Uniform Color Code (red = electric, orange = communication)
          </div>
        </div>
      )}
    </div>
  );
}