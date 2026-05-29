/**
 * HawkAmInterferenceMap — Standalone "AM Tower Interference" map for Target A.
 *
 * A "Create AM Interference Map" button queries the FCC AM broadcast database
 * (fccAmTowerQuery) for AM towers near the Target A cell tower, plots each on a
 * Mapbox satellite map (radio-tower icon), draws a line to the nearest, and
 * shows an interference banner + a table of nearby AM stations with call sign,
 * frequency, power, distance, and licensee.
 *
 * Engine + marker conventions mirror HawkAirportDistanceMap.
 */

import { useEffect, useRef, useState } from "react";
import { Radio, Sparkles, Loader2, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { fccAmTowerQuery } from "@/functions/fccAmTowerQuery";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

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

function renderMap(container, tgtLat, tgtLon, towers, nearest, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [tgtLon, tgtLat], zoom: 11, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  const hasNearest = nearest && Number.isFinite(nearest.latitude) && Number.isFinite(nearest.longitude);

  return new Promise((resolve) => {
    map.on("load", () => {
      // Connection line: tower → nearest AM tower
      if (hasNearest) {
        const line = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[tgtLon, tgtLat], [nearest.longitude, nearest.latitude]] },
          properties: {},
        };
        map.addSource("ham-line", { type: "geojson", data: line });
        map.addLayer({
          id: "ham-line-casing",
          type: "line",
          source: "ham-line",
          paint: { "line-color": "#000", "line-width": 5, "line-opacity": 0.5 },
        });
        map.addLayer({
          id: "ham-line",
          type: "line",
          source: "ham-line",
          paint: { "line-color": "#f43f5e", "line-width": 2.5, "line-dasharray": [2, 1.5] },
        });
      }

      // Target A tower marker
      const tgtEl = document.createElement("div");
      tgtEl.style.cssText = `
        width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
        background: rgba(15,23,42,0.92); border: 2px solid #f97316; border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(249,115,22,0.5), 0 0 14px rgba(249,115,22,0.8);
        font-size: 16px;
      `;
      tgtEl.textContent = "📡";
      new window.mapboxgl.Marker({ element: tgtEl, anchor: "center" })
        .setLngLat([tgtLon, tgtLat])
        .setPopup(new window.mapboxgl.Popup({ offset: 22 }).setHTML(
          `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A — TOWER</strong><br/>${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}</div>`
        ))
        .addTo(map);

      // AM tower markers
      const bounds = new window.mapboxgl.LngLatBounds();
      bounds.extend([tgtLon, tgtLat]);
      for (const t of towers) {
        if (!Number.isFinite(t.latitude) || !Number.isFinite(t.longitude)) continue;
        const isNearest = nearest && t.call === nearest.call;
        const el = document.createElement("div");
        el.style.cssText = `
          width: ${isNearest ? 30 : 26}px; height: ${isNearest ? 30 : 26}px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(15,23,42,0.92); border: 2px solid ${isNearest ? "#f43f5e" : "#fbbf24"};
          border-radius: 50%;
          box-shadow: 0 0 0 2px ${isNearest ? "rgba(244,63,94,0.4)" : "rgba(251,191,36,0.35)"}, 0 0 10px ${isNearest ? "rgba(244,63,94,0.7)" : "rgba(251,191,36,0.6)"};
          font-size: 14px;
        `;
        el.textContent = "📻";
        new window.mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([t.longitude, t.latitude])
          .setPopup(new window.mapboxgl.Popup({ offset: 16 }).setHTML(
            `<div style="font-family:monospace;font-size:11px;max-width:230px;">
              <strong>${t.call} · ${t.frequency}</strong><br/>
              ${t.power} · ${t.directional}<br/>
              ${t.city}, ${t.state}<br/>
              ${t.distance_miles} mi from tower<br/>
              ${t.licensee || ""}
            </div>`
          ))
          .addTo(map);
        bounds.extend([t.longitude, t.latitude]);
      }

      if (towers.some((t) => Number.isFinite(t.latitude))) {
        map.fitBounds(bounds, { padding: 80, duration: 0, maxZoom: 13 });
      }
      resolve(map);
    });
  });
}

const LEVEL_CONFIG = {
  high: { icon: ShieldAlert, color: "text-red-700", bg: "bg-red-50 dark:bg-red-950/20 border-red-500/40", label: "HIGH — Study Likely Required" },
  moderate: { icon: ShieldAlert, color: "text-amber-700", bg: "bg-amber-50 dark:bg-amber-950/20 border-amber-500/40", label: "MODERATE — Review Recommended" },
  low: { icon: ShieldCheck, color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/40", label: "LOW — Informational" },
  none: { icon: ShieldCheck, color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/40", label: "NONE — No AM Towers Found" },
};

export default function HawkAmInterferenceMap({ targetA }) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [result, setResult] = useState(null);
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
      <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/20 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-heading font-bold text-rose-900 dark:text-rose-200 text-sm">AM Tower Interference Map</div>
          <div className="text-sm text-rose-800 dark:text-rose-300 mt-0.5">
            Run Hawk Parcel Details first to resolve Target A — the AM Interference query centers on the Target A tower location.
          </div>
        </div>
      </div>
    );
  }

  const tgtLat = Number(targetA.latitude);
  const tgtLon = Number(targetA.longitude);

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

      const res = await fccAmTowerQuery({ lat: tgtLat, lon: tgtLon, dist_km: 50 });
      const data = res.data || {};
      setResult(data);

      await ensureMapboxLoaded();
      mapInstance.current?.remove?.();
      mapInstance.current = null;
      await new Promise((r) => requestAnimationFrame(r));

      mapInstance.current = await renderMap(mapRef.current, tgtLat, tgtLon, data.towers || [], data.nearest || null, token);
      setGenerated(true);

      if (data.interference_level === "high") toast.warning("AM interference risk: HIGH — study likely required.");
      else toast.success(`FCC AM query complete — ${data.count || 0} AM tower(s) found.`);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to run FCC AM query.");
    } finally {
      setLoading(false);
    }
  }

  const ownerLabel = targetA.owner || targetA.parcel_address || `${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}`;
  const level = result ? (LEVEL_CONFIG[result.interference_level] || LEVEL_CONFIG.none) : null;
  const LevelIcon = level?.icon;

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-rose-600 to-red-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · AM INTERFERENCE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">AM Tower Interference — FCC Query for Target A</h2>
              <div className="text-[11px] font-mono opacity-90 mt-0.5">Target A · {ownerLabel}</div>
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={loading} className="bg-white text-rose-700 hover:bg-rose-50 font-semibold shadow">
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Querying FCC…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Re-run AM Query" : "Create AM Interference Map"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Interference banner */}
      {generated && level && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${level.bg}`}>
          {LevelIcon && <LevelIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${level.color}`} />}
          <div>
            <div className={`font-heading font-bold text-sm ${level.color}`}>Interference Risk: {level.label}</div>
            <div className="text-sm text-foreground/80 mt-0.5">{result.interference_note}</div>
          </div>
        </div>
      )}

      {/* Map + table on the SAME print page */}
      <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap rounded-t-xl">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-rose-300" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] text-rose-300/80">SCIP · FCC AM BROADCAST TOWERS</div>
              <h3 className="font-heading font-bold text-lg leading-tight">Hawk AM Interference Map</h3>
            </div>
          </div>
          {generated && result && (
            <div className="text-xs font-mono text-rose-100">{result.count || 0} AM towers within 50 km</div>
          )}
        </div>

        <div className="relative w-full bg-card border-x border-border" style={{ height: 560 }}>
          <div ref={mapRef} className="absolute inset-0" />
          {!generated && (
            <div className="absolute inset-0 flex items-center justify-center text-center px-6">
              <div className="text-sm text-muted-foreground">
                Click <span className="font-semibold text-foreground">Create AM Interference Map</span> to query the FCC
                AM broadcast database for nearby AM towers that could interfere with the cell tower signal.
              </div>
            </div>
          )}
        </div>

        {/* AM tower table */}
        <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
          <div className="bg-slate-100 dark:bg-slate-800/40 px-4 py-2 border-b border-border">
            <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · NEARBY AM BROADCAST STATIONS</div>
            <div className="font-heading font-bold text-sm">FCC AM Query Results</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 text-foreground">
                  <th className="text-left px-3 py-2 font-semibold">Call</th>
                  <th className="text-left px-3 py-2 font-semibold">Freq</th>
                  <th className="text-left px-3 py-2 font-semibold">Power</th>
                  <th className="text-left px-3 py-2 font-semibold">Pattern</th>
                  <th className="text-left px-3 py-2 font-semibold">Distance</th>
                  <th className="text-left px-3 py-2 font-semibold">City</th>
                  <th className="text-left px-3 py-2 font-semibold">Licensee</th>
                </tr>
              </thead>
              <tbody>
                {generated && result?.towers?.length > 0 ? result.towers.map((t, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="px-3 py-1.5 border-t border-border font-mono font-semibold">{t.call}</td>
                    <td className="px-3 py-1.5 border-t border-border font-mono">{t.frequency}</td>
                    <td className="px-3 py-1.5 border-t border-border font-mono">{t.power}</td>
                    <td className="px-3 py-1.5 border-t border-border">{t.directional}</td>
                    <td className="px-3 py-1.5 border-t border-border font-mono">{t.distance_miles} mi</td>
                    <td className="px-3 py-1.5 border-t border-border">{t.city}, {t.state}</td>
                    <td className="px-3 py-1.5 border-t border-border">{t.licensee || "—"}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-3 text-center text-muted-foreground italic border-t border-border">
                      {generated ? "No AM broadcast towers found within 50 km." : "Run the FCC AM query to list nearby AM stations."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}