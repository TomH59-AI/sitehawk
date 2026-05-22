/**
 * SCIPThematicMaps — Eight thematic maps for the SCIP MAPS section.
 *
 * Each map = Mapbox satellite base + SARF center waypoint + 0.5/1.0-mi rings,
 * with a thematic raster overlay layered on top (USGS topo, FEMA NFHL flood,
 * USFWS NWI wetlands, etc.).
 *
 * All 8 are individually toggleable so the user can pick what prints.
 *   • Aerial         — clean satellite, no overlay
 *   • Topography     — USGS National Map topo tiles
 *   • Floodplain     — FEMA NFHL flood hazard zones
 *   • Zoning         — neutral base + zoning label (data varies by jurisdiction)
 *   • FLU            — Future Land Use (jurisdiction-dependent, shown as topo base)
 *   • Wetlands       — USFWS NWI wetlands
 *   • Parcel         — Regrid / county parcel boundary lines (uses satellite + parcel pin)
 *   • Wind Speed     — ASCE 7-22 wind speed zones (rendered as label, value comes from candidate)
 */

import { useEffect, useMemo, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const IMG_W = 1024;
const IMG_H = 1024;
const ZOOM = 13.6;

// ─── Geometry helpers ────────────────────────────────────────────────
function buildCircle(lat, lon, radiusMiles, points = 96) {
  const coords = [];
  const radiusM = radiusMiles * 1609.344;
  const dx = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = radiusM / 110540;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([lon + dx * Math.cos(theta), lat + dy * Math.sin(theta)]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

function buildRingsGeoJSON(lat, lon) {
  return encodeURIComponent(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
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
      ],
    })
  );
}

// Compute the bbox shown by Mapbox static at the chosen center/zoom/size.
// At the equator: 360° / 512px-per-tile / 2^zoom is degrees-per-pixel for lon.
// Latitude uses standard Web Mercator math.
function bboxFromCenter(lat, lon, zoom, widthPx, heightPx) {
  const worldSize = 512 * Math.pow(2, zoom);
  const lonPerPx = 360 / worldSize;
  const halfLonSpan = (widthPx / 2) * lonPerPx;
  const west = lon - halfLonSpan;
  const east = lon + halfLonSpan;

  const sinLat = Math.sin((lat * Math.PI) / 180);
  const yCenter = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
  const yTop = yCenter - heightPx / 2;
  const yBottom = yCenter + heightPx / 2;
  const tile2lat = (y) => {
    const n = Math.PI - (2 * Math.PI * y) / worldSize;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };
  const north = tile2lat(yTop);
  const south = tile2lat(yBottom);
  return { west, south, east, north };
}

// ─── Mapbox base URL builder ─────────────────────────────────────────
function buildMapboxBase(token, lat, lon, style = "satellite-streets-v12", extraPins = "") {
  const geo = buildRingsGeoJSON(lat, lon);
  const waypoint = `pin-l-circle+2563EB(${lon},${lat})`;
  const overlays = [`geojson(${geo})`, waypoint, extraPins].filter(Boolean).join(",");
  return (
    `https://api.mapbox.com/styles/v1/mapbox/${style}/static/` +
    `${overlays}/` +
    `${lon},${lat},${ZOOM},0,0/` +
    `${IMG_W}x${IMG_H}@2x` +
    `?access_token=${token}`
  );
}

// ─── WMS overlay URL builders (semi-transparent raster on top of Mapbox base) ─
function femaWmsUrl(lat, lon) {
  const bb = bboxFromCenter(lat, lon, ZOOM, IMG_W, IMG_H);
  return (
    `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export` +
    `?bbox=${bb.west},${bb.south},${bb.east},${bb.north}` +
    `&bboxSR=4326&imageSR=4326&size=${IMG_W * 2},${IMG_H * 2}` +
    `&dpi=192&format=png32&transparent=true&f=image&layers=show:28`
  );
}

function nwiWmsUrl(lat, lon) {
  const bb = bboxFromCenter(lat, lon, ZOOM, IMG_W, IMG_H);
  return (
    `https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export` +
    `?bbox=${bb.west},${bb.south},${bb.east},${bb.north}` +
    `&bboxSR=4326&imageSR=4326&size=${IMG_W * 2},${IMG_H * 2}` +
    `&dpi=192&format=png32&transparent=true&f=image`
  );
}

function usgsTopoUrl(lat, lon) {
  const bb = bboxFromCenter(lat, lon, ZOOM, IMG_W, IMG_H);
  return (
    `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/export` +
    `?bbox=${bb.west},${bb.south},${bb.east},${bb.north}` +
    `&bboxSR=4326&imageSR=4326&size=${IMG_W * 2},${IMG_H * 2}` +
    `&dpi=192&format=png32&transparent=true&f=image`
  );
}

// ─── Map definitions ─────────────────────────────────────────────────
function buildMapDefs(token, candidate, sarfLat, sarfLon) {
  const targetPin =
    candidate?.latitude && candidate?.longitude
      ? `pin-l-communications-tower+EF4444(${candidate.longitude},${candidate.latitude})`
      : "";

  return [
    {
      key: "aerial",
      title: "Aerial",
      caption: "High-resolution satellite — search ring overview",
      base: buildMapboxBase(token, sarfLat, sarfLon, "satellite-streets-v12", targetPin),
      overlay: null,
      overlayLabel: null,
    },
    {
      key: "topo",
      title: "Topography",
      caption: "USGS National Map topographic contours overlay",
      base: buildMapboxBase(token, sarfLat, sarfLon, "satellite-streets-v12", targetPin),
      overlay: usgsTopoUrl(sarfLat, sarfLon),
      overlayLabel: "USGS Topo",
      overlayOpacity: 0.55,
    },
    {
      key: "flood",
      title: "Floodplain Map",
      caption: "FEMA NFHL flood hazard zones (AE, X, VE, etc.)",
      base: buildMapboxBase(token, sarfLat, sarfLon, "satellite-streets-v12", targetPin),
      overlay: femaWmsUrl(sarfLat, sarfLon),
      overlayLabel: "FEMA NFHL",
      overlayOpacity: 0.6,
    },
    {
      key: "zoning",
      title: "Zoning Map",
      caption: "Base aerial + zoning classification (per Notion master zoning DB)",
      base: buildMapboxBase(token, sarfLat, sarfLon, "streets-v12", targetPin),
      overlay: null,
      overlayLabel: candidate?.zoning_classification ? `Zone: ${candidate.zoning_classification}` : null,
    },
    {
      key: "flu",
      title: "FLU Map",
      caption: "Future Land Use — neutral street base (jurisdiction layer varies)",
      base: buildMapboxBase(token, sarfLat, sarfLon, "outdoors-v12", targetPin),
      overlay: null,
      overlayLabel: "Future Land Use",
    },
    {
      key: "wetlands",
      title: "Wetlands Map",
      caption: "USFWS NWI wetlands overlay",
      base: buildMapboxBase(token, sarfLat, sarfLon, "satellite-streets-v12", targetPin),
      overlay: nwiWmsUrl(sarfLat, sarfLon),
      overlayLabel: "USFWS NWI",
      overlayOpacity: 0.7,
    },
    {
      key: "parcel",
      title: "Parcel Map",
      caption: "Parcel boundary view — Target A parcel highlighted",
      base: buildMapboxBase(token, sarfLat, sarfLon, "satellite-streets-v12", targetPin),
      overlay: null,
      overlayLabel: candidate?.parcel_id ? `Parcel ${candidate.parcel_id}` : null,
    },
    {
      key: "wind",
      title: "Wind Speed Map",
      caption: "ASCE 7-22 design wind speed (3-sec gust, Risk Category II)",
      base: buildMapboxBase(token, sarfLat, sarfLon, "outdoors-v12", targetPin),
      overlay: null,
      overlayLabel:
        candidate?.wind_speed_mph != null
          ? `${candidate.wind_speed_mph} mph${candidate.wind_mri ? ` · ${candidate.wind_mri}` : ""}`
          : "Wind Speed (ASCE 7-22)",
    },
  ];
}

// ─── Single map card ─────────────────────────────────────────────────
function MapCard({ map, enabled, onToggle }) {
  return (
    <div className={`rounded-lg overflow-hidden border ${enabled ? "border-cyan-500/50" : "border-border opacity-60"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#0d1829] hover:bg-[#13294a] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] font-bold ${
              enabled ? "bg-cyan-500 border-cyan-500 text-[#0a0e17]" : "bg-transparent border-slate-600 text-transparent"
            }`}
          >
            ✓
          </span>
          <span className="text-sm font-semibold text-white">{map.title}</span>
        </div>
        {map.overlayLabel && (
          <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
            {map.overlayLabel}
          </span>
        )}
      </button>

      {enabled && (
        <>
          <div className="relative bg-[#0a0e17]" style={{ aspectRatio: "1/1" }}>
            <img
              src={map.base}
              alt={`${map.title} base`}
              crossOrigin="anonymous"
              className="absolute inset-0 w-full h-full block"
              style={{ objectFit: "cover" }}
            />
            {map.overlay && (
              <img
                src={map.overlay}
                alt={`${map.title} overlay`}
                crossOrigin="anonymous"
                className="absolute inset-0 w-full h-full block pointer-events-none"
                style={{
                  objectFit: "cover",
                  opacity: map.overlayOpacity ?? 0.55,
                  mixBlendMode: "normal",
                }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
          </div>
          <div className="px-3 py-1.5 text-[10px] font-mono text-slate-500 bg-[#0d1829]">{map.caption}</div>
        </>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────
export default function SCIPThematicMaps({ candidate, searchCenter }) {
  const [open, setOpen] = useState(true);
  const [token, setToken] = useState("");

  // Default: all 8 maps enabled
  const [enabled, setEnabled] = useState({
    aerial: true,
    topo: true,
    flood: true,
    zoning: true,
    flu: true,
    wetlands: true,
    parcel: true,
    wind: true,
  });

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  const sarfLat = searchCenter?.lat ?? candidate?.latitude;
  const sarfLon = searchCenter?.lon ?? candidate?.longitude;

  const maps = useMemo(() => {
    if (!token || sarfLat == null || sarfLon == null) return [];
    return buildMapDefs(token, candidate, sarfLat, sarfLon);
  }, [token, candidate, sarfLat, sarfLon]);

  if (sarfLat == null || sarfLon == null) return null;

  const toggleOne = (key) => setEnabled((e) => ({ ...e, [key]: !e[key] }));
  const allOn = () =>
    setEnabled({ aerial: true, topo: true, flood: true, zoning: true, flu: true, wetlands: true, parcel: true, wind: true });
  const allOff = () =>
    setEnabled({ aerial: false, topo: false, flood: false, zoning: false, flu: false, wetlands: false, parcel: false, wind: false });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0C1B2E] text-white hover:bg-[#13294a] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">SCIP Maps</span>
          <span className="font-heading font-bold">Aerial · Topo · Flood · Zoning · FLU · Wetlands · Parcel · Wind</span>
        </div>
        <span className="text-cyan-400 text-sm">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-muted-foreground">
              Toggle each map on/off — every enabled map prints into the SCIP MAPS section with the SARF center waypoint
              and the 0.5-mi / 1.0-mi search rings.
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={allOn}
                className="text-[10px] font-mono font-bold tracking-wider px-2 py-1 rounded border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
              >
                ALL ON
              </button>
              <button
                onClick={allOff}
                className="text-[10px] font-mono font-bold tracking-wider px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-700/30"
              >
                ALL OFF
              </button>
            </div>
          </div>

          {!token ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {maps.map((map) => (
                <MapCard
                  key={map.key}
                  map={map}
                  enabled={enabled[map.key]}
                  onToggle={() => toggleOne(map.key)}
                />
              ))}
            </div>
          )}

          <div className="text-[10px] text-muted-foreground pt-1">
            Sources: Mapbox Satellite-Streets (base) · USGS National Map (topo) · FEMA NFHL (flood) · USFWS NWI (wetlands) · ASCE 7-22 (wind)
          </div>
        </div>
      )}
    </div>
  );
}