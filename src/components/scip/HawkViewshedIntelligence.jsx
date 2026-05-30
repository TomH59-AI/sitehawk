/**
 * HawkViewshedIntelligence — One-click Generate button that produces FOUR
 * dedicated directional tree-line viewshed print pages (N · E · S · W),
 * each a pitched 2D Mapbox GL satellite map with a transparent colored
 * line-of-sight cone fanning out along the bearing from the Target A tower.
 *
 *   N — cyan    (#00A7E1)
 *   E — green   (#22C55E)
 *   S — amber   (#F59E0B)
 *   W — purple  (#A855F7)
 *
 * Data: scipViewshed backend function returns the four directions with
 * USGS elevation profiles + obstruction flags. Maps are rendered LIVE with
 * Mapbox GL JS v3.6.0 (pitched 60°, rotated to the bearing) so they look
 * top-notch and are crisp in print. Mirrors HawkCellAirportIntelligence
 * conventions exactly. Centers on the chosen Target A parcel centroid.
 */

import { useEffect, useRef, useState } from "react";
import { Mountain, Sparkles, Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { scipViewshed } from "@/functions/scipViewshed";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

// ────────────── Mapbox GL JS loader (idempotent) ──────────────
let mapboxLoadingPromise = null;
async function ensureMapboxLoaded() {
  if (window.mapboxgl) return;
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = MAPBOX_CSS;
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = MAPBOX_JS;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  await mapboxLoadingPromise;
}

// Move a point distMiles along a bearing (great-circle).
function destPoint(lat, lon, bearingDeg, distMiles) {
  const R = 3958.8;
  const brg = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const dr = distMiles / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(brg));
  const lon2 = lon1 + Math.atan2(
    Math.sin(brg) * Math.sin(dr) * Math.cos(lat1),
    Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

// Build a transparent triangular cone polygon fanning out along the bearing.
function coneFeature(lat, lon, bearingDeg, lengthMiles = 1.0, spreadDeg = 26) {
  const left = destPoint(lat, lon, bearingDeg - spreadDeg, lengthMiles);
  const right = destPoint(lat, lon, bearingDeg + spreadDeg, lengthMiles);
  const mid = destPoint(lat, lon, bearingDeg, lengthMiles);
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [lon, lat],
        [left.lon, left.lat],
        [mid.lon, mid.lat],
        [right.lon, right.lat],
        [lon, lat],
      ]],
    },
    properties: {},
  };
}

// ────────────── single directional viewshed map renderer ──────────────
async function renderViewshedMap(container, tgtLat, tgtLon, dir, token) {
  window.mapboxgl.accessToken = token;
  // Offset the center forward along the bearing so the horizon sits mid-frame.
  const c = destPoint(tgtLat, tgtLon, dir.bearing, 0.18);
  const map = new window.mapboxgl.Map({
    container,
    style: SAT_STYLE,
    center: [c.lon, c.lat],
    zoom: 13.6,
    pitch: 60,
    bearing: dir.bearing,
    preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      // 3D terrain for a true tree-line / horizon feel.
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.3 });

      // Transparent directional cone in this direction's color.
      const cone = coneFeature(tgtLat, tgtLon, dir.bearing, 1.0);
      map.addSource("vs-cone", { type: "geojson", data: cone });
      map.addLayer({
        id: "vs-cone-fill",
        type: "fill",
        source: "vs-cone",
        paint: { "fill-color": dir.color, "fill-opacity": 0.28 },
      });
      map.addLayer({
        id: "vs-cone-line",
        type: "line",
        source: "vs-cone",
        paint: { "line-color": dir.color, "line-width": 2, "line-opacity": 0.9 },
      });

      // Tower waypoint at Target A.
      const el = document.createElement("div");
      el.style.cssText = `
        width: 30px; height: 30px; display:flex; align-items:center; justify-content:center;
        background: rgba(15,23,42,0.92); border: 2px solid ${dir.color}; border-radius: 50%;
        box-shadow: 0 0 0 2px ${dir.color}88, 0 0 14px ${dir.color}cc;
        font-size: 15px;
      `;
      el.textContent = "📡";
      new window.mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([tgtLon, tgtLat])
        .addTo(map);

      resolve(map);
    });
  });
}

// ────────────── compact elevation-profile table ──────────────
function ProfileTable({ dir }) {
  const profile = dir?.profile || [];
  return (
    <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
      <div
        className="px-4 py-2 border-b border-border flex items-center justify-between"
        style={{ background: `${dir.color}1a` }}
      >
        <div>
          <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · VIEWSHED</div>
          <div className="font-heading font-bold text-sm">{dir.label}</div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold">
          {dir.clear ? (
            <><CheckCircle2 className="w-4 h-4 text-green-600" /> <span className="text-green-700">CLEAR LOS</span></>
          ) : (
            <><XCircle className="w-4 h-4 text-red-600" /> <span className="text-red-700">OBSTRUCTED @ {dir.first_obstruction_mi} mi</span></>
          )}
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/40">
            <th className="px-3 py-1.5 text-left font-medium">Dist (mi)</th>
            <th className="px-3 py-1.5 text-left font-medium">Ground (ft)</th>
            <th className="px-3 py-1.5 text-left font-medium">RF Line-of-Sight (ft)</th>
            <th className="px-3 py-1.5 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {profile.map((p, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
              <td className="px-3 py-1 border-t border-border font-mono">{p.dist_mi}</td>
              <td className="px-3 py-1 border-t border-border font-mono">{p.ground_ft ?? "—"}</td>
              <td className="px-3 py-1 border-t border-border font-mono">{p.los_ft ?? "—"}</td>
              <td className="px-3 py-1 border-t border-border font-mono">
                {p.obstructed
                  ? <span className="text-red-600 font-bold">BLOCKED</span>
                  : <span className="text-green-600">clear</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────── per-direction map page (map + profile, one print page) ──────────────
function ViewshedPage({ dir, mapRef }) {
  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden"
      style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
    >
      <div
        className="text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: `linear-gradient(90deg, ${dir.color}, ${dir.color}cc)` }}
      >
        <div className="flex items-center gap-2">
          <Mountain className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">
              SCIP · HAWK VIEWSHED · {dir.short}
            </div>
            <h3 className="font-heading font-bold text-lg leading-tight">
              {dir.label} — Tree-Line Viewshed
            </h3>
          </div>
        </div>
        <div className="text-xs font-mono opacity-90">Bearing {dir.bearing}° · Pitched 2D</div>
      </div>
      <div className="relative w-full bg-card border-x border-border" style={{ height: 560 }}>
        <div ref={mapRef} className="absolute inset-0" />
      </div>
      <ProfileTable dir={dir} />
    </div>
  );
}

// ────────────── main component ──────────────
export default function HawkViewshedIntelligence({ targetA, towerHeightFt = 199, ringMiles = 0.25 }) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [directions, setDirections] = useState([]);

  const refs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const mapsRef = useRef([]);

  useEffect(() => {
    return () => {
      mapsRef.current.forEach((m) => m?.remove?.());
      mapsRef.current = [];
    };
  }, []);

  if (!targetA || !Number.isFinite(Number(targetA.latitude)) || !Number.isFinite(Number(targetA.longitude))) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-heading font-bold text-amber-900 dark:text-amber-200 text-sm">
            Hawk Viewshed Intelligence
          </div>
          <div className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
            Run Hawk Parcel Details first to resolve Target A — the N/S/E/W viewshed maps center on the chosen Target A parcel centroid.
          </div>
        </div>
      </div>
    );
  }

  const tgtLat = Number(targetA.latitude);
  const tgtLon = Number(targetA.longitude);
  const ownerLabel = targetA.owner || targetA.parcel_address || `${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}`;

  async function handleGenerate() {
    setLoading(true);
    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (!token) {
        toast.error("Mapbox token unavailable.");
        setLoading(false);
        return;
      }
      await ensureMapboxLoaded();

      // Fetch profiles + direction metadata (colors, bearings, obstruction flags).
      const res = await scipViewshed({
        lat: tgtLat,
        lon: tgtLon,
        ring_miles: ringMiles,
        tower_height_ft: towerHeightFt,
      });
      const dirs = res.data?.viewshed?.directions || [];
      if (!dirs.length) throw new Error("No viewshed directions returned");
      setDirections(dirs);

      // Dispose any prior maps, wait a frame so refs size correctly.
      mapsRef.current.forEach((m) => m?.remove?.());
      mapsRef.current = [];
      await new Promise((r) => requestAnimationFrame(r));

      const maps = await Promise.all(
        dirs.map((d, i) => renderViewshedMap(refs[i].current, tgtLat, tgtLon, d, token))
      );
      mapsRef.current = maps;

      setGenerated(true);
      toast.success("Hawk Viewshed Intelligence generated 4 directional map pages.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Hawk Viewshed Intelligence failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-600 via-green-600 to-purple-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Mountain className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · VIEWSHED INTELLIGENCE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">
                Hawk Viewshed Intelligence — N · E · S · W Tree-Line
              </h2>
              <div className="text-[11px] font-mono opacity-90 mt-0.5">
                Target A · {ownerLabel} · Tower {towerHeightFt} ft AGL
              </div>
            </div>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-white text-purple-700 hover:bg-purple-50 font-semibold shadow"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Regenerate" : "Generate with Hawk Viewshed Intelligence"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Four directional viewshed pages */}
      {directions.length > 0 ? (
        directions.map((d, i) => <ViewshedPage key={d.short} dir={d} mapRef={refs[i]} />)
      ) : (
        // Pre-render empty containers so refs exist before generation.
        [
          { short: "N", label: "North from Site", bearing: 0,   color: "#00A7E1", profile: [], clear: true },
          { short: "E", label: "East from Site",  bearing: 90,  color: "#22C55E", profile: [], clear: true },
          { short: "S", label: "South from Site", bearing: 180, color: "#F59E0B", profile: [], clear: true },
          { short: "W", label: "West from Site",  bearing: 270, color: "#A855F7", profile: [], clear: true },
        ].map((d, i) => <ViewshedPage key={d.short} dir={d} mapRef={refs[i]} />)
      )}
    </div>
  );
}