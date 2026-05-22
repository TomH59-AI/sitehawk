/**
 * SCIPCompoundOverlayMap — true-scale Mapbox Static satellite render that
 * overlays the proposed tower compound footprint, fall-zone radius, tower
 * base point, and access easement directly on top of the Target A parcel.
 *
 * All geometry comes straight from the Tower Placement engine
 * (lib/towerPlacement.js) so the map matches the SVG site plan exactly.
 *
 * Mapbox Static URLs are length-capped at ~8192 chars, so we keep the GeoJSON
 * lean: compact precision, no extra rings, no markers we don't strictly need.
 */

import { useEffect, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { ftToLatLon } from "@/lib/towerPlacement";

const IMG_W = 1280;
const IMG_H = 900;

// Build the 4-corner compound polygon (centered on the tower base, square)
function buildCompoundPolygon(analysis) {
  const { placement, parcelDims, compoundSizeFt } = analysis;
  const half = compoundSizeFt / 2;
  const { centroid, ftPerLon, ftPerLat } = parcelDims;
  const corners = [
    [placement.x_ft - half, placement.y_ft - half],
    [placement.x_ft + half, placement.y_ft - half],
    [placement.x_ft + half, placement.y_ft + half],
    [placement.x_ft - half, placement.y_ft + half],
  ];
  const ring = corners.map(([x, y]) => {
    const { lat, lon } = ftToLatLon(x, y, centroid, ftPerLon, ftPerLat);
    return [+lon.toFixed(6), +lat.toFixed(6)];
  });
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

// Build the parcel polygon at compact precision (must be Polygon, not Multi).
function buildParcelPolygon(candidate) {
  const geom = candidate?.parcel_geometry;
  if (!geom) return null;
  let ring;
  if (geom.type === "Polygon") ring = geom.coordinates?.[0];
  else if (geom.type === "MultiPolygon") ring = geom.coordinates?.[0]?.[0];
  if (!ring) return null;
  const trimmed = ring.map(([lon, lat]) => [+lon.toFixed(6), +lat.toFixed(6)]);
  return { type: "Polygon", coordinates: [trimmed] };
}

// Build the fall-zone radius circle around the tower base (radius = setbackFt)
function buildFallZoneCircle(analysis, points = 48) {
  const { placement, parcelDims, setbackFt } = analysis;
  const { centroid, ftPerLon, ftPerLat } = parcelDims;
  const coords = [];
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = placement.x_ft + setbackFt * Math.cos(theta);
    const y = placement.y_ft + setbackFt * Math.sin(theta);
    const { lat, lon } = ftToLatLon(x, y, centroid, ftPerLon, ftPerLat);
    coords.push([+lon.toFixed(5), +lat.toFixed(5)]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

function buildStaticUrl(token, lat, lon, overlays) {
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${overlays}/${lon},${lat},18,0,0/${IMG_W}x${IMG_H}@2x` +
    `?access_token=${token}`
  );
}

function buildOverlayUrl(token, candidate, analysis) {
  const parcel = buildParcelPolygon(candidate);
  const compound = buildCompoundPolygon(analysis);
  const fallZone = buildFallZoneCircle(analysis);
  const towerLat = analysis.placement.lat;
  const towerLon = analysis.placement.lon;

  const features = [];
  if (parcel) {
    features.push({
      type: "Feature",
      properties: { stroke: "#EAB308", "stroke-width": 3, "stroke-opacity": 0.95, fill: "#EAB308", "fill-opacity": 0.05 },
      geometry: parcel,
    });
  }
  // Fall-zone radius (red dashed circle = tower-height setback)
  features.push({
    type: "Feature",
    properties: { stroke: "#DC2626", "stroke-width": 2, "stroke-opacity": 0.85, fill: "#DC2626", "fill-opacity": 0.06 },
    geometry: fallZone,
  });
  // Compound footprint (cyan filled square = lease area)
  features.push({
    type: "Feature",
    properties: { stroke: "#06B6D4", "stroke-width": 3, "stroke-opacity": 1, fill: "#06B6D4", "fill-opacity": 0.35 },
    geometry: compound,
  });

  const geo = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }));
  const towerPin = `pin-l-communications-tower+0C1B2E(${towerLon},${towerLat})`;
  const overlays = `geojson(${geo}),${towerPin}`;
  return buildStaticUrl(token, towerLat, towerLon, overlays);
}

export default function SCIPCompoundOverlayMap({ candidate, analysis }) {
  const [token, setToken] = useState("");

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  if (!token || !analysis?.ok || !candidate) return null;

  const url = buildOverlayUrl(token, candidate, analysis);
  const { towerHeightFt, setbackFt, compoundSizeFt, placement } = analysis;

  return (
    <div className="rounded-md border border-border overflow-hidden bg-[#0a0e17]">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0C1B2E] text-white text-[10px] font-bold tracking-widest uppercase">
        <span>True-Scale Compound Overlay — Target A</span>
        <a href={url} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 font-mono normal-case tracking-normal">
          Open full-res
        </a>
      </div>

      <div className="relative">
        <img
          src={url}
          alt="Tower compound overlay on parcel"
          crossOrigin="anonymous"
          className="w-full block"
          style={{ aspectRatio: `${IMG_W}/${IMG_H}`, objectFit: "cover" }}
        />

        {/* Tower-height callout — anchored to map corner, references the pin */}
        <div className="absolute top-3 right-3 bg-[#0C1B2E]/95 text-white rounded-md px-3 py-2 text-xs font-mono shadow-lg border border-cyan-500/40">
          <div className="text-[9px] uppercase tracking-widest text-cyan-400">Proposed Tower</div>
          <div className="font-bold text-base leading-tight mt-0.5">{towerHeightFt} ft AGL</div>
          <div className="text-[10px] text-white/70 mt-0.5">Fall-zone: {setbackFt} ft radius</div>
          <div className="text-[10px] text-white/70">Compound: {compoundSizeFt}' × {compoundSizeFt}'</div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-card/95 backdrop-blur rounded-md p-2.5 text-[10px] space-y-1 shadow-lg border border-border">
          <div className="flex items-center gap-2">
            <div style={{ width: 18, height: 3, background: "#EAB308" }} />
            <span className="text-foreground/80">Parcel Boundary</span>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ width: 14, height: 14, background: "#06B6D4", opacity: 0.6, border: "2px solid #06B6D4" }} />
            <span className="text-foreground/80">Compound ({compoundSizeFt}' × {compoundSizeFt}')</span>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px dashed #DC2626", background: "rgba(220,38,38,0.06)" }} />
            <span className="text-foreground/80">Fall-zone ({setbackFt} ft)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">📡</span>
            <span className="text-foreground/80">
              Tower base · {placement.lat.toFixed(6)}, {placement.lon.toFixed(6)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}