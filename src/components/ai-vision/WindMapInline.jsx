import { useEffect, useMemo, useState } from "react";
import { Wind } from "lucide-react";
import { loadPublicConfig } from "@/lib/publicConfig";

const IMG_W = 1280;
const IMG_H = 760;

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function windColor(mph) {
  if (!mph) return "#64748b";
  if (mph < 110) return "#16a34a";
  if (mph < 130) return "#d97706";
  if (mph < 150) return "#dc2626";
  return "#7f1d1d";
}

function buildCircle(lat, lon, radiusMiles, points = 36) {
  const coords = [];
  const radiusM = radiusMiles * 1609.344;
  const dx = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = radiusM / 110540;

  for (let i = 0; i < points; i += 1) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([
      +(lon + dx * Math.cos(theta)).toFixed(5),
      +(lat + dy * Math.sin(theta)).toFixed(5),
    ]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

function buildWindUrl(token, lat, lon, radiusMiles, color) {
  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          stroke: color,
          "stroke-width": 4,
          "stroke-opacity": 1,
          fill: color,
          "fill-opacity": 0.14,
        },
        geometry: buildCircle(lat, lon, radiusMiles),
      },
    ],
  };
  const geo = encodeURIComponent(JSON.stringify(geojson));
  const overlays = `geojson(${geo}),pin-l+${color.replace("#", "")}(${lon},${lat})`;
  return (
    "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/" +
    `${overlays}/${lon},${lat},13.7,0,0/${IMG_W}x${IMG_H}@2x` +
    `?access_token=${token}`
  );
}

export default function WindMapInline({ site, wind }) {
  const [token, setToken] = useState("");
  const lat = asNumber(site?.lat);
  const lon = asNumber(site?.lon);
  const radius = asNumber(site?.radius) || 0.5;
  const mph = asNumber(wind?.wind_speed_mph);
  const color = windColor(mph);

  useEffect(() => {
    let cancelled = false;
    loadPublicConfig().then((config) => {
      if (!cancelled) setToken(config.mapboxAccessToken || "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const url = useMemo(() => {
    if (!token || lat == null || lon == null) return null;
    return buildWindUrl(token, lat, lon, radius, color);
  }, [color, lat, lon, radius, token]);

  if (!url) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-border bg-muted/20 p-8 text-sm text-muted-foreground">
        Wind map cannot render until Mapbox configuration and coordinates are available.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="relative bg-[#0a0e17]">
        <img
          src={url}
          alt="Wind map"
          crossOrigin="anonymous"
          className="block w-full object-cover"
          style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}
        />
        <div className="absolute left-3 top-3 rounded-lg border border-white/25 bg-[#0C1B2E]/90 px-3 py-2 text-white shadow-lg">
          <div className="flex items-center gap-2">
            <Wind className="h-4 w-4" style={{ color }} />
            <span className="font-heading text-xs font-bold uppercase tracking-wider">ASCE Wind</span>
          </div>
          <div className="mt-1 font-mono text-lg font-bold" style={{ color }}>
            {mph ? `${mph} mph` : "No data"}
          </div>
          <div className="text-[11px] text-white/70">
            {(wind?.wind_risk_level || "unknown").toUpperCase()}
            {wind?.in_hurricane_prone_region ? " | Hurricane prone" : ""}
            {wind?.in_special_wind_region ? " | Special wind region" : ""}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        <span>{wind?.wind_mri || "ASCE 7-22 Risk Category II"}</span>
        <span className="font-mono">{lat.toFixed(6)}, {lon.toFixed(6)}</span>
      </div>
    </div>
  );
}
