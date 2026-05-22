/**
 * SCIPBirdsEyeMaps — Two Mapbox Static Image renders for the SCIP template.
 *
 * Cell 14 (SARF Birds-Eye):
 *   Clean overhead satellite of the SARF center with:
 *     • 0.5-mi yellow ring
 *     • 1.0-mi red ring
 *     • Waypoint pin at user-input coordinates
 *
 * Cell 57 (Target A Birds-Eye):
 *   Identical to Cell 14 + a tower icon on Target A (the #1 picked candidate).
 *
 * Both use Mapbox Static Images API at 1280×1024 @2x (≈ 2560×2048).
 */

import { useEffect, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const IMG_W = 1280;
const IMG_H = 1024;
const ZOOM = 13.6; // shows roughly a 2-mile box — fits both rings comfortably

// Build a simple closed-polygon GeoJSON circle (96 points) for ring overlays.
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

function buildGeoJSONOverlay(lat, lon, extraFeatures = []) {
  const geojson = {
    type: "FeatureCollection",
    features: [
      // 1.0-mi outer ring (red)
      {
        type: "Feature",
        properties: { stroke: "#DC2626", "stroke-width": 3, "stroke-opacity": 0.95, "fill-opacity": 0 },
        geometry: buildCircle(lat, lon, 1.0),
      },
      // 0.5-mi inner ring (yellow)
      {
        type: "Feature",
        properties: { stroke: "#EAB308", "stroke-width": 3, "stroke-opacity": 0.95, "fill-opacity": 0 },
        geometry: buildCircle(lat, lon, 0.5),
      },
      ...extraFeatures,
    ],
  };
  return encodeURIComponent(JSON.stringify(geojson));
}

function buildStaticUrl(token, lat, lon, overlays) {
  // overlays is the path-segment string of comma-separated overlay specs
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${overlays}/` +
    `${lon},${lat},${ZOOM},0,0/` +
    `${IMG_W}x${IMG_H}@2x` +
    `?access_token=${token}`
  );
}

// Cell 14: SARF center only — rings + waypoint pin
function buildCell14Url(token, lat, lon) {
  const geo = buildGeoJSONOverlay(lat, lon);
  const waypoint = `pin-l-circle+2563EB(${lon},${lat})`;
  const overlays = `geojson(${geo}),${waypoint}`;
  return buildStaticUrl(token, lat, lon, overlays);
}

// Cell 57: same as Cell 14, plus a tower icon on Target A
function buildCell57Url(token, sarfLat, sarfLon, targetLat, targetLon) {
  const geo = buildGeoJSONOverlay(sarfLat, sarfLon);
  const waypoint = `pin-l-circle+2563EB(${sarfLon},${sarfLat})`;
  // Mapbox Maki "communications-tower" icon — large red pin for Target A
  const towerPin = `pin-l-communications-tower+EF4444(${targetLon},${targetLat})`;
  const overlays = `geojson(${geo}),${waypoint},${towerPin}`;
  return buildStaticUrl(token, sarfLat, sarfLon, overlays);
}

function ImageCard({ cellLabel, title, subtitle, url, footnote }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-[#0C1B2E] text-white">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">{cellLabel}</span>
          <span className="font-heading font-bold">{title}</span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 underline"
        >
          Open full-res
        </a>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        <div className="rounded-lg overflow-hidden border border-border bg-[#0a0e17]">
          <img
            src={url}
            alt={title}
            crossOrigin="anonymous"
            className="w-full block"
            style={{ aspectRatio: `${IMG_W}/${IMG_H}`, objectFit: "cover" }}
          />
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">{footnote}</div>
      </div>
    </div>
  );
}

export default function SCIPBirdsEyeMaps({ candidate, searchCenter }) {
  const [token, setToken] = useState("");

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  // SARF center = user-input coordinates (searchCenter), fallback to candidate's own coords
  const sarfLat = searchCenter?.lat ?? candidate?.latitude;
  const sarfLon = searchCenter?.lon ?? candidate?.longitude;
  const targetLat = candidate?.latitude;
  const targetLon = candidate?.longitude;

  if (sarfLat == null || sarfLon == null) {
    return null;
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  const cell14Url = buildCell14Url(token, sarfLat, sarfLon);
  const cell57Url = (targetLat != null && targetLon != null)
    ? buildCell57Url(token, sarfLat, sarfLon, targetLat, targetLon)
    : null;

  const coordText = `${sarfLat.toFixed(6)}, ${sarfLon.toFixed(6)}`;

  return (
    <div className="space-y-3">
      <ImageCard
        cellLabel="Cell 14"
        title="SARF Birds-Eye — Search Ring Overview"
        subtitle={
          <>
            Clean overhead satellite of the SARF center at user-input coordinates{" "}
            <span className="font-mono font-semibold text-foreground">{coordText}</span>, with
            the <span className="text-yellow-600 font-semibold">0.5-mi</span> and{" "}
            <span className="text-red-600 font-semibold">1.0-mi</span> search rings.
          </>
        }
        url={cell14Url}
        footnote="Source: Mapbox Satellite-Streets · 2560×2048 · SARF center waypoint only"
      />

      {cell57Url && (
        <ImageCard
          cellLabel="Cell 57"
          title="Target A Birds-Eye — #1 Candidate Placed"
          subtitle={
            <>
              Same SARF overview with a tower icon dropped on{" "}
              <span className="font-semibold text-foreground">
                Target A — {candidate?.site_name || "the #1 candidate"}
              </span>{" "}
              at{" "}
              <span className="font-mono text-foreground">
                {targetLat.toFixed(6)}, {targetLon.toFixed(6)}
              </span>
              .
            </>
          }
          url={cell57Url}
          footnote="Source: Mapbox Satellite-Streets · 2560×2048 · SARF center + Target A tower"
        />
      )}
    </div>
  );
}