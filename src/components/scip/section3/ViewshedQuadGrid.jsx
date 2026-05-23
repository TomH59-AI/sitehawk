/**
 * ViewshedQuadGrid — Section 3.2 conical viewsheds (N / E / S / W).
 *
 * Four high-resolution Mapbox satellite static images, each cropped tight on
 * Target A with a transparent conical "view cone" GeoJSON overlay pointing in
 * its compass direction. Each direction uses its own transparent color so the
 * RF engineer can scan tree-line obstructions:
 *   N → cyan        E → magenta
 *   S → amber       W → emerald
 *
 * One GENERATE button renders all four PNGs at once. Images are downloadable.
 */

import { useEffect, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { Loader2, Download } from "lucide-react";

const IMG_W = 1280;
const IMG_H = 1280;
const CONE_RADIUS_MILES = 0.6;
const CONE_HALF_ANGLE_DEG = 22; // 44° total — classic RF sector beamwidth

const DIRECTIONS = [
  { key: "N", label: "North from Site", bearing: 0,   color: "#22d3ee" }, // cyan
  { key: "E", label: "East from Site",  bearing: 90,  color: "#ec4899" }, // magenta
  { key: "S", label: "South From Site", bearing: 180, color: "#f59e0b" }, // amber
  { key: "W", label: "West from Site",  bearing: 270, color: "#10b981" }, // emerald
];

// Build a GeoJSON triangle (cone) from Target A in a compass direction.
function buildCone(lat, lon, bearingDeg, radiusMiles, halfAngleDeg) {
  const radiusM = radiusMiles * 1609.344;
  const toRad = (d) => (d * Math.PI) / 180;
  const earthR = 6371000;

  function offset(brgDeg) {
    const brg = toRad(brgDeg);
    const lat1 = toRad(lat);
    const lon1 = toRad(lon);
    const dByR = radiusM / earthR;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dByR) + Math.cos(lat1) * Math.sin(dByR) * Math.cos(brg));
    const lon2 = lon1 + Math.atan2(
      Math.sin(brg) * Math.sin(dByR) * Math.cos(lat1),
      Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2),
    );
    return [+((lon2 * 180) / Math.PI).toFixed(5), +((lat2 * 180) / Math.PI).toFixed(5)];
  }

  // Build an arc with several segments so the cone has a curved tip
  const arc = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const b = bearingDeg - halfAngleDeg + (i * (2 * halfAngleDeg)) / steps;
    arc.push(offset(b));
  }
  const apex = [+lon.toFixed(5), +lat.toFixed(5)];
  const ring = [apex, ...arc, apex];
  return { type: "Polygon", coordinates: [ring] };
}

function buildViewshedUrl(token, lat, lon, dir) {
  const cone = buildCone(lat, lon, dir.bearing, CONE_RADIUS_MILES, CONE_HALF_ANGLE_DEG);
  const geojson = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        stroke: dir.color,
        "stroke-width": 3,
        "stroke-opacity": 0.95,
        fill: dir.color,
        "fill-opacity": 0.22,
      },
      geometry: cone,
    }],
  };
  const geo = encodeURIComponent(JSON.stringify(geojson));
  const pin = `pin-l-circle+ffffff(${lon},${lat})`;
  const zoom = 15.2; // tight crop on Target A so tree lines are visible
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/` +
    `geojson(${geo}),${pin}/` +
    `${lon},${lat},${zoom},0,0/` +
    `${IMG_W}x${IMG_H}@2x?access_token=${token}`
  );
}

function ViewshedTile({ dir, url, ready }) {
  function downloadPng() {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `viewshed-${dir.key}.png`;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return (
    <div className="rounded-lg overflow-hidden border border-border bg-[#0a0e17] flex flex-col">
      <div
        className="px-3 py-1.5 flex items-center justify-between font-mono text-[10px] font-bold tracking-[0.2em]"
        style={{ background: dir.color, color: "#0a0e17" }}
      >
        <span>{dir.label.toUpperCase()}</span>
        <span className="opacity-70">{dir.bearing}°</span>
      </div>
      <div className="relative aspect-square w-full overflow-hidden">
        {ready && url ? (
          <img src={url} alt={dir.label} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-500">
            Awaiting GENERATE
          </div>
        )}
      </div>
      <button
        onClick={downloadPng}
        disabled={!ready || !url}
        className="px-3 py-1.5 text-[10px] font-mono font-bold tracking-wider bg-card hover:bg-muted text-foreground border-t border-border inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
      >
        <Download className="w-3 h-3" /> DOWNLOAD PNG
      </button>
    </div>
  );
}

export default function ViewshedQuadGrid({ targetLat, targetLon }) {
  const [token, setToken] = useState("");
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  async function handleGenerate() {
    const lat = parseFloat(targetLat);
    const lon = parseFloat(targetLon);
    if (!isFinite(lat) || !isFinite(lon)) {
      setError("Run Hawk Vision first — viewsheds use Target A's coordinates.");
      return;
    }
    if (!token) {
      setError("Mapbox token not loaded — try again in a moment.");
      return;
    }
    setLoading(true);
    setError(null);
    // Brief delay so the loader paints; images themselves load via <img>.
    await new Promise((r) => setTimeout(r, 200));
    setGenerated(true);
    setLoading(false);
  }

  const lat = parseFloat(targetLat);
  const lon = parseFloat(targetLon);
  const tiles = DIRECTIONS.map((d) => ({
    dir: d,
    url: token && isFinite(lat) && isFinite(lon) ? buildViewshedUrl(token, lat, lon, d) : null,
  }));

  return (
    <div className="bg-card">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-muted/30">
        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
          Conical viewsheds · {CONE_RADIUS_MILES} mi reach · ±{CONE_HALF_ANGLE_DEG}° beam · tree-line crop
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold tracking-wider bg-cyan-500 text-[#0C1B2E] hover:bg-cyan-400 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "🔭"}
          {loading ? "RENDERING…" : generated ? "RE-RENDER VIEWSHEDS" : "GENERATE N / E / S / W VIEWSHEDS"}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}

      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {tiles.map(({ dir, url }) => (
          <ViewshedTile key={dir.key} dir={dir} url={url} ready={generated} />
        ))}
      </div>
    </div>
  );
}