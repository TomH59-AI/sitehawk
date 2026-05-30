/**
 * HawkWindSpeedIntelligence — One-click Generate button that produces a
 * dedicated, premium dark-mode ASCE 7-22 structural wind-hazard print page:
 * a live Mapbox GL DARK base map with smooth color-coded concentric
 * wind-velocity contour rings (neon electric-blue → glowing amber/orange)
 * around the Target A site, a frosted-glass glassmorphism popup on the
 * waypoint (Basic Wind Speed V, Risk Category, ASCE 7-22 reference), and a
 * detailed readout card from the existing windSpeedLookup function.
 *
 * Engine: Mapbox GL JS v3.6.0 loaded via CDN — matches the other Hawk maps.
 * Data: windSpeedLookup (ASCE 7-22 RC II). Centers on the chosen Target A
 * parcel centroid. Placed right after the floodplain map in the SCIP order.
 */

import { useEffect, useRef, useState } from "react";
import { Wind, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { windSpeedLookup } from "@/functions/windSpeedLookup";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

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

// ────────────── geometry ──────────────
function buildCircle(lat, lon, radiusMiles, steps = 96) {
  const R = 3958.7613;
  const d = radiusMiles / R;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (i * 2 * Math.PI) / steps;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
    );
    const lon2 =
      lonRad +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(lat2)
      );
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}

// Neon gradient based on wind velocity: electric blue (low) → amber/orange (extreme).
function windColor(mph) {
  if (!mph) return "#38bdf8";
  if (mph >= 150) return "#ff5e00";   // glowing neon orange — extreme / hurricane
  if (mph >= 130) return "#ffb020";   // amber — high
  if (mph >= 110) return "#22d3ee";   // bright cyan — moderate
  return "#3b82f6";                   // deep electric blue — standard
}

// ────────────── dark wind map renderer ──────────────
async function renderWindMap(container, tgtLat, tgtLon, mph, popupHtml, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container,
    style: DARK_STYLE,
    center: [tgtLon, tgtLat],
    zoom: 11.5,
    preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  const base = windColor(mph);

  return new Promise((resolve) => {
    map.on("load", () => {
      // Concentric semi-transparent contour rings — glowing velocity zones.
      const rings = [3.0, 2.25, 1.5, 0.75];
      rings.forEach((r, i) => {
        const id = `hw-ring-${i}`;
        map.addSource(id, { type: "geojson", data: buildCircle(tgtLat, tgtLon, r) });
        // soft fill — innermost most intense
        map.addLayer({
          id: `${id}-fill`,
          type: "fill",
          source: id,
          paint: { "fill-color": base, "fill-opacity": 0.06 + i * 0.05 },
        });
        // glowing neon stroke
        map.addLayer({
          id: `${id}-line`,
          type: "line",
          source: id,
          paint: {
            "line-color": base,
            "line-width": 1.5 + i * 0.6,
            "line-opacity": 0.5 + i * 0.12,
            "line-blur": 2,
          },
        });
      });

      // Center site waypoint with glowing halo.
      const el = document.createElement("div");
      el.style.cssText = `
        width: 30px; height: 30px; display:flex; align-items:center; justify-content:center;
        background: rgba(2,6,23,0.9); border: 2px solid ${base}; border-radius: 50%;
        box-shadow: 0 0 0 3px ${base}55, 0 0 22px ${base}; font-size: 15px;
      `;
      el.textContent = "📡";
      const popup = new window.mapboxgl.Popup({ offset: 22, closeButton: false }).setHTML(popupHtml);
      new window.mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([tgtLon, tgtLat])
        .setPopup(popup)
        .addTo(map)
        .togglePopup();

      map.fitBounds(
        (() => {
          const c = buildCircle(tgtLat, tgtLon, 3.0).geometry.coordinates[0];
          const lons = c.map((x) => x[0]); const lats = c.map((x) => x[1]);
          return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
        })(),
        { padding: 50, duration: 0 }
      );

      resolve(map);
    });
  });
}

// Frosted-glass popup HTML (rendered inside the Mapbox popup).
function buildPopupHtml(wind) {
  const v = wind?.wind_speed_mph != null ? `${wind.wind_speed_mph} mph` : "—";
  const risk = wind?.wind_risk_level ? wind.wind_risk_level.toUpperCase() : "—";
  const color = windColor(wind?.wind_speed_mph);
  return `
    <div style="
      font-family: ui-monospace, monospace; min-width: 190px; padding: 10px 12px;
      background: rgba(2,6,23,0.72); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      border: 1px solid ${color}66; border-radius: 12px; color: #e2e8f0;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5), inset 0 0 18px ${color}22;
    ">
      <div style="font-size:9px;letter-spacing:0.25em;color:${color};margin-bottom:4px;">ASCE 7-22 · RC II</div>
      <div style="font-size:22px;font-weight:800;color:#fff;line-height:1;">${v}</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Basic Wind Speed (V)</div>
      <div style="height:1px;background:${color}44;margin:8px 0;"></div>
      <div style="font-size:11px;">Risk Category: <b style="color:${color};">${risk}</b></div>
      <div style="font-size:11px;">Code Ref: <b>ASCE 7-22</b></div>
    </div>`;
}

// ────────────── readout card ──────────────
function dash(v) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s === "" ? "—" : s;
}

function WindTable({ wind }) {
  return (
    <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
      <div className="bg-slate-100 dark:bg-slate-800/40 px-4 py-2 border-b border-border">
        <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · WIND HAZARD</div>
        <div className="font-heading font-bold text-sm">ASCE 7-22 Structural Design Wind — Target A</div>
      </div>
      {wind ? (
        <table className="w-full text-xs">
          <tbody>
            {[
              ["Basic Wind Speed (V)", wind.wind_speed_mph != null ? `${wind.wind_speed_mph} mph` : "—"],
              ["Risk Category", "II (Standard Occupancy)"],
              ["MRI", dash(wind.wind_mri)],
              ["Wind Risk Level", dash(wind.wind_risk_level).toUpperCase()],
              ["Hurricane-Prone Region", wind.in_hurricane_prone_region ? "YES" : "No"],
              ["Special Wind Region", wind.in_special_wind_region ? "YES — local study required" : "No"],
              ["Code Reference", "ASCE 7-22"],
            ].map(([k, v], i) => (
              <tr key={k} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                <td className="px-3 py-1.5 border-t border-border font-medium w-[220px]">{k}</td>
                <td className="px-3 py-1.5 border-t border-border font-mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-3 py-3 text-center text-muted-foreground italic">No ASCE wind data returned</div>
      )}
    </div>
  );
}

// ────────────── main component ──────────────
export default function HawkWindSpeedIntelligence({ targetA }) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [wind, setWind] = useState(null);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    return () => {
      mapInstance.current?.remove?.();
      mapInstance.current = null;
    };
  }, []);

  if (!targetA || !Number.isFinite(Number(targetA.latitude)) || !Number.isFinite(Number(targetA.longitude))) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-heading font-bold text-amber-900 dark:text-amber-200 text-sm">
            Hawk Wind Speed Intelligence
          </div>
          <div className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
            Run Hawk Parcel Details first to resolve Target A — the ASCE 7-22 wind hazard map centers on the chosen Target A parcel centroid.
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

      mapInstance.current?.remove?.();
      mapInstance.current = null;

      const windRes = await windSpeedLookup({ lat: tgtLat, lon: tgtLon }).catch(() => null);
      const windData = windRes?.data || null;
      setWind(windData);

      await new Promise((r) => requestAnimationFrame(r));

      const map = await renderWindMap(
        mapRef.current, tgtLat, tgtLon, windData?.wind_speed_mph, buildPopupHtml(windData), token
      );
      mapInstance.current = map;

      setGenerated(true);
      toast.success("Hawk Wind Speed Intelligence generated.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Hawk Wind Speed Intelligence failed.");
    } finally {
      setLoading(false);
    }
  }

  const stat = generated && wind?.wind_speed_mph != null
    ? `${wind.wind_speed_mph} mph · ${(wind.wind_risk_level || "").toUpperCase()}`
    : null;

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 via-cyan-600 to-orange-500 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Wind className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · WIND HAZARD INTELLIGENCE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">Hawk Wind Speed Intelligence — ASCE 7-22</h2>
              <div className="text-[11px] font-mono opacity-90 mt-0.5">
                Target A · {ownerLabel}
              </div>
            </div>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Regenerate" : "Generate with Hawk Wind Speed Intelligence"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Dark wind map + readout — one print page */}
      <div
        className="rounded-xl border border-border bg-card overflow-hidden"
        style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <div className="bg-gradient-to-r from-slate-950 to-slate-900 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap rounded-t-xl">
          <div className="flex items-center gap-2">
            <Wind className="w-5 h-5 text-cyan-300" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] text-cyan-300/80">
                SCIP · HAWK WIND SPEED INTELLIGENCE
              </div>
              <h3 className="font-heading font-bold text-lg leading-tight">
                ASCE 7-22 Design Wind Velocity Zones
              </h3>
            </div>
          </div>
          {stat && <div className="text-xs font-mono text-cyan-100">{stat}</div>}
        </div>
        <div className="relative w-full bg-slate-950 border-x border-border" style={{ height: 620 }}>
          <div ref={mapRef} className="absolute inset-0" />
        </div>
        <WindTable wind={wind} />
      </div>
    </div>
  );
}