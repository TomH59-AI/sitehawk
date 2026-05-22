/**
 * SCIPPage1SARFMap — Auto-generated SARF (Search Area Ring Form) map.
 *
 * Reads the Latitude, Longitude, and Search Radius the user typed into the
 * "SEARCH RING INFORMATION" block on Page 1, then renders a Mapbox satellite
 * static image centered on those coordinates with a red-highlighted circle
 * drawn at the chosen radius.
 *
 * Lives in the SCIP Page-1 hierarchy directly under the Search Ring Information
 * editable rows, matching the template's "SARF" row.
 */

import { useEffect, useMemo, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const IMG_W = 1280;
const IMG_H = 960;

// Parse "0.5 mi", "1.0 mile", "1", etc. → miles as a number.
function parseRadiusMiles(input) {
  if (input == null) return null;
  const s = String(input).toLowerCase().trim();
  if (!s) return null;
  const num = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!isFinite(num) || num <= 0) return null;
  if (s.includes("km")) return num * 0.621371;
  if (s.includes("ft")) return num / 5280;
  if (s.includes("m") && !s.includes("mi")) return num / 1609.344;
  return num; // default: miles
}

function parseCoord(input) {
  if (input == null) return null;
  const n = parseFloat(String(input).trim());
  return isFinite(n) ? n : null;
}

// Choose a zoom that fits the ring with comfortable padding.
function zoomForRadius(radiusMiles) {
  if (radiusMiles >= 2) return 12.2;
  if (radiusMiles >= 1.5) return 12.6;
  if (radiusMiles >= 1) return 13.2;
  if (radiusMiles >= 0.75) return 13.6;
  if (radiusMiles >= 0.5) return 14.0;
  if (radiusMiles >= 0.25) return 14.8;
  return 15.4;
}

// 36-point GeoJSON circle, 5-decimal precision — keeps Mapbox Static URL under
// the 8192-char limit while staying visually smooth.
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

function buildSARFUrl(token, lat, lon, radiusMiles) {
  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          stroke: "#DC2626",
          "stroke-width": 4,
          "stroke-opacity": 1,
          fill: "#DC2626",
          "fill-opacity": 0.12,
        },
        geometry: buildCircle(lat, lon, radiusMiles),
      },
    ],
  };
  const geo = encodeURIComponent(JSON.stringify(geojson));
  const centerPin = `pin-l-circle+DC2626(${lon},${lat})`;
  const overlays = `geojson(${geo}),${centerPin}`;
  const zoom = zoomForRadius(radiusMiles);
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${overlays}/` +
    `${lon},${lat},${zoom},0,0/` +
    `${IMG_W}x${IMG_H}@2x` +
    `?access_token=${token}`
  );
}

export default function SCIPPage1SARFMap({ values }) {
  const [token, setToken] = useState("");

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  const lat = parseCoord(values?.latitude);
  const lon = parseCoord(values?.longitude);
  const radiusMiles = parseRadiusMiles(values?.search_radius);

  const url = useMemo(() => {
    if (!token || lat == null || lon == null || !radiusMiles) return null;
    return buildSARFUrl(token, lat, lon, radiusMiles);
  }, [token, lat, lon, radiusMiles]);

  return (
    <div className="border-t border-border">
      <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase">
        SARF
      </div>

      {!url ? (
        <div className="px-4 py-6 text-sm text-muted-foreground bg-muted/20">
          Enter <span className="font-semibold text-foreground">Latitude</span>,{" "}
          <span className="font-semibold text-foreground">Longitude</span>, and a{" "}
          <span className="font-semibold text-foreground">Search Radius</span> above to
          auto-generate the SARF map.
        </div>
      ) : (
        <div className="bg-[#0a0e17]">
          <div className="relative" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
            <img
              src={url}
              alt="SARF Map"
              crossOrigin="anonymous"
              className="absolute inset-0 w-full h-full block"
              style={{ objectFit: "cover" }}
            />
          </div>
          <div className="px-3 py-2 flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800">
            <span>
              Center:{" "}
              <span className="text-cyan-400">
                {lat.toFixed(6)}, {lon.toFixed(6)}
              </span>{" "}
              · Radius:{" "}
              <span className="text-red-400">{radiusMiles.toFixed(2)} mi</span>
            </span>
            <span>Source: Mapbox Satellite-Streets</span>
          </div>
        </div>
      )}
    </div>
  );
}