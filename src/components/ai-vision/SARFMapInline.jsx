import { useEffect, useMemo, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const IMG_W = 1280;
const IMG_H = 960;

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function zoomForRadius(radiusMiles) {
  if (radiusMiles >= 2) return 12.2;
  if (radiusMiles >= 1.5) return 12.6;
  if (radiusMiles >= 1) return 13.2;
  if (radiusMiles >= 0.75) return 13.6;
  if (radiusMiles >= 0.5) return 14.0;
  if (radiusMiles >= 0.25) return 14.8;
  return 15.4;
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
  const overlays = `geojson(${geo}),pin-l-circle+DC2626(${lon},${lat})`;
  const zoom = zoomForRadius(radiusMiles);

  return (
    "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/" +
    `${overlays}/${lon},${lat},${zoom},0,0/${IMG_W}x${IMG_H}@2x` +
    `?access_token=${token}`
  );
}

export default function SARFMapInline({ lat, lon, radius }) {
  const [token, setToken] = useState("");
  const latitude = asNumber(lat);
  const longitude = asNumber(lon);
  const radiusMiles = asNumber(radius);

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
    if (!token || latitude == null || longitude == null || !radiusMiles) return null;
    return buildSARFUrl(token, latitude, longitude, radiusMiles);
  }, [token, latitude, longitude, radiusMiles]);

  if (!url) {
    return (
      <div className="flex min-h-72 items-center justify-center bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        Mapbox configuration or site coordinates are missing.
      </div>
    );
  }

  return (
    <div className="bg-[#0a0e17]">
      <div className="relative" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
        <img
          src={url}
          alt="SARF map"
          crossOrigin="anonymous"
          className="absolute inset-0 block h-full w-full object-cover"
        />
      </div>
      <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2 font-mono text-[11px] text-slate-400">
        <span>
          Center: <span className="text-cyan-400">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
        </span>
        <span>Radius: <span className="text-red-400">{radiusMiles.toFixed(2)} mi</span></span>
      </div>
    </div>
  );
}
