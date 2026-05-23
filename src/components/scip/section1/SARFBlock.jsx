/**
 * SARFBlock — Section 1.2 (Search Area Ring Form map).
 *
 * One Mapbox satellite static image, centered on the Agent's lat/lon waypoint,
 * with a red-highlighted circle drawn at the selected Search Radius.
 *
 * Generate button on the top-right re-runs the URL build from the latest
 * Site Acquisition inputs.
 */

import { useEffect, useMemo, useState } from "react";
import Section1Shell from "./Section1Shell";
import { loadPublicConfig } from "@/lib/publicConfig";
import { MapPinned } from "lucide-react";

const IMG_W = 1280;
const IMG_H = 960;

function parseRadius(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}
function parseCoord(s) {
  const n = parseFloat(String(s ?? "").trim());
  return isFinite(n) ? n : null;
}
function zoomForRadius(r) {
  if (r >= 2) return 12.2;
  if (r >= 1.5) return 12.6;
  if (r >= 1) return 13.2;
  if (r >= 0.75) return 13.6;
  if (r >= 0.5) return 14.0;
  if (r >= 0.25) return 14.8;
  return 15.4;
}
function buildCircle(lat, lon, r, points = 36) {
  const coords = [];
  const radiusM = r * 1609.344;
  const dx = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = radiusM / 110540;
  for (let i = 0; i < points; i++) {
    const t = (i / points) * (2 * Math.PI);
    coords.push([+(lon + dx * Math.cos(t)).toFixed(5), +(lat + dy * Math.sin(t)).toFixed(5)]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}
function buildSARFUrl(token, lat, lon, r) {
  const geojson = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { stroke: "#DC2626", "stroke-width": 4, "stroke-opacity": 1, fill: "#DC2626", "fill-opacity": 0.14 },
      geometry: buildCircle(lat, lon, r),
    }],
  };
  const geo = encodeURIComponent(JSON.stringify(geojson));
  const pin = `pin-l-circle+DC2626(${lon},${lat})`;
  const zoom = zoomForRadius(r);
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/geojson(${geo}),${pin}/${lon},${lat},${zoom},0,0/${IMG_W}x${IMG_H}@2x?access_token=${token}`;
}

export default function SARFBlock({ acquisition, onMapReady }) {
  const [token, setToken] = useState("");
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  const lat = parseCoord(acquisition.latitude);
  const lon = parseCoord(acquisition.longitude);
  const r = parseRadius(acquisition.search_radius);

  const url = useMemo(() => {
    if (!token || lat == null || lon == null || !r) return null;
    return buildSARFUrl(token, lat, lon, r);
  }, [token, lat, lon, r]);

  function handleGenerate() {
    if (lat == null || lon == null) {
      setError("Enter Latitude and Longitude in Section 1 first.");
      return;
    }
    if (!r) {
      setError("Enter a Search Radius (e.g. 1.0) in Section 1 first.");
      return;
    }
    if (!token) {
      setError("Mapbox token not loaded — try again in a moment.");
      return;
    }
    setError(null);
    setGenerated(true);
    onMapReady?.({ url, lat, lon, radius_miles: r });
  }

  return (
    <Section1Shell
      step={2}
      title="SARF · Search Area Ring Form"
      subtitle="Mapbox satellite · radius highlighted in red"
      icon={MapPinned}
      generateLabel="GENERATE SARF MAP"
      onGenerate={handleGenerate}
    >
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}

      {!generated || !url ? (
        <div className="px-4 py-10 text-sm text-muted-foreground bg-muted/20 text-center">
          Click <span className="font-mono font-bold text-cyan-700">GENERATE SARF MAP</span> after filling in
          latitude, longitude, and search radius above.
        </div>
      ) : (
        <div className="bg-[#0a0e17]">
          <div className="relative" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
            <img src={url} alt="SARF Map" crossOrigin="anonymous" className="absolute inset-0 w-full h-full block" style={{ objectFit: "cover" }} />
          </div>
          <div className="px-3 py-2 flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800">
            <span>
              Center: <span className="text-cyan-400">{lat.toFixed(6)}, {lon.toFixed(6)}</span> · Radius:{" "}
              <span className="text-red-400">{r.toFixed(2)} mi</span>
            </span>
            <span>Mapbox Satellite-Streets</span>
          </div>
        </div>
      )}
    </Section1Shell>
  );
}