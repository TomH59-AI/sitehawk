/**
 * HawkSectorCoverage — CloudRF RF coverage exhibit for the SCIP Target A site.
 *
 * Produces a flat, print-ready coverage page: a Mapbox satellite aerial of
 * Target A with the CloudRF /area omni coverage PNG draped on top (georeferenced
 * by the bounds CloudRF returns), plus a key-data table of the RF model inputs.
 *
 * This is the printed-deliverable path — it reuses the static-map SCIP muscle
 * (Mapbox GL + a raster overlay) rather than the heavy 3D engine. Centers on the
 * resolved Target A parcel centroid, which is the site the SCIP is built around.
 */

import { useEffect, useRef, useState } from "react";
import { Radio, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { CARRIER_PRESETS, DEFAULT_CARRIER } from "@/lib/carrierPresets";
import { cloudRFCoverage } from "@/functions/cloudRFCoverage";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
const TOWER_HEIGHT_FT = 199;

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

// CloudRF returns bounds as [north, east, south, west] (lat/lon degrees).
// Mapbox image source coordinates want [TL, TR, BR, BL] as [lon, lat].
function boundsToImageCoords(bounds) {
  if (!Array.isArray(bounds) || bounds.length < 4) return null;
  const [north, east, south, west] = bounds;
  return [
    [west, north],  // top-left
    [east, north],  // top-right
    [east, south],  // bottom-right
    [west, south],  // bottom-left
  ];
}

function dash(v) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s === "" ? "—" : s;
}

function CoverageTable({ result }) {
  const k = result?.key_data || {};
  const rows = [
    ["Carrier / Band", CARRIER_PRESETS[k.carrier]?.label || dash(k.carrier)],
    ["Frequency (MHz)", dash(k.frequency_mhz)],
    ["Tower Height (ft AGL)", dash(result?.height_ft)],
    ["Tx Power (W)", dash(k.power_w)],
    ["Antenna Gain (dBi)", dash(k.antenna_gain_dbi)],
    ["Rx Sensitivity (dBm)", dash(k.receiver_sensitivity_dbm)],
    ["Coverage Radius (mi)", dash(result?.radius_mi)],
    ["Max Range (km)", result?.max_range_km != null ? Number(result.max_range_km).toFixed(1) : "—"],
    ["Area Covered (km²)", result?.area_covered_sq_km != null ? Number(result.area_covered_sq_km).toFixed(1) : "—"],
  ];
  return (
    <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
      <div className="bg-slate-100 dark:bg-slate-800/40 px-4 py-2 border-b border-border">
        <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · RF COVERAGE</div>
        <div className="font-heading font-bold text-sm">CloudRF Model Inputs &amp; Results</div>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([label, val], i) => (
            <tr key={label} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
              <td className="px-3 py-1.5 border-t border-border font-medium w-[220px]">{label}</td>
              <td className="px-3 py-1.5 border-t border-border font-mono">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HawkSectorCoverage({ targetA, siteName }) {
  const [carrier, setCarrier] = useState(DEFAULT_CARRIER);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [result, setResult] = useState(null);

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    return () => {
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, []);

  const hasTarget =
    targetA &&
    Number.isFinite(Number(targetA.latitude)) &&
    Number.isFinite(Number(targetA.longitude));

  if (!hasTarget) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-heading font-bold text-amber-900 dark:text-amber-200 text-sm">
            Hawk RF Coverage
          </div>
          <div className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
            Run Hawk Parcel Details first to resolve Target A — RF coverage is modeled from the chosen Target A parcel centroid.
          </div>
        </div>
      </div>
    );
  }

  const lat = Number(targetA.latitude);
  const lon = Number(targetA.longitude);
  const label = siteName || targetA?.owner || targetA?.parcel_address || "Target A";

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

      // Fire CloudRF + ensure Mapbox in parallel.
      const [covRes] = await Promise.all([
        cloudRFCoverage({ lat, lon, height_ft: TOWER_HEIGHT_FT, site_name: label, carrier }),
        ensureMapboxLoaded(),
      ]);

      const data = covRes?.data;
      if (!data?.success || !data?.png_url) {
        throw new Error(data?.error || "CloudRF returned no coverage image.");
      }
      setResult(data);

      // Dispose any prior map.
      mapRef.current?.remove?.();
      mapRef.current = null;
      await new Promise((r) => requestAnimationFrame(r));

      window.mapboxgl.accessToken = token;
      const map = new window.mapboxgl.Map({
        container: mapDivRef.current,
        style: SAT_STYLE,
        center: [lon, lat],
        zoom: 11.5,
        preserveDrawingBuffer: true,
      });
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

      await new Promise((resolve) => map.on("load", resolve));

      // Drape the CloudRF coverage PNG over the aerial using the returned bounds.
      const coords = boundsToImageCoords(data.bounds);
      if (coords) {
        map.addSource("hsc-coverage", {
          type: "image",
          url: data.png_url,
          coordinates: coords,
        });
        map.addLayer({
          id: "hsc-coverage-layer",
          type: "raster",
          source: "hsc-coverage",
          paint: { "raster-opacity": 0.6 },
        });
        const lons = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          { padding: 50, duration: 0 }
        );
      }

      // Tower waypoint at Target A.
      const el = document.createElement("div");
      el.style.cssText = `
        width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
        background: rgba(15,23,42,0.92); border: 2px solid #f97316; border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(249,115,22,0.5), 0 0 14px rgba(249,115,22,0.8);
        font-size: 16px;
      `;
      el.textContent = "📡";
      new window.mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([lon, lat])
        .setPopup(
          new window.mapboxgl.Popup({ offset: 22 }).setHTML(
            `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A — TOWER</strong><br/>${lat.toFixed(6)}, ${lon.toFixed(6)}</div>`
          )
        )
        .addTo(map);

      mapRef.current = map;
      setGenerated(true);
      toast.success("Hawk RF Coverage generated.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Hawk RF Coverage failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · RF COVERAGE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">Hawk RF Coverage — CloudRF (Target A)</h2>
              <div className="text-[11px] font-mono opacity-90 mt-0.5">
                {label} · {lat.toFixed(6)}, {lon.toFixed(6)} · {TOWER_HEIGHT_FT} ft AGL
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={carrier} onValueChange={setCarrier}>
              <SelectTrigger className="w-[230px] bg-white/10 border-white/20 text-white h-9">
                <SelectValue placeholder="Carrier band" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CARRIER_PRESETS).map(([key, p]) => (
                  <SelectItem key={key} value={key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="bg-white text-teal-700 hover:bg-teal-50 font-semibold shadow"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Modeling…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Regenerate" : "Generate RF Coverage"}</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Coverage exhibit — map + table on the same print page */}
      <div
        className="rounded-xl border border-border bg-card overflow-hidden"
        style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap rounded-t-xl">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-300" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] text-emerald-300/80">SCIP · HAWK RF COVERAGE</div>
              <h3 className="font-heading font-bold text-lg leading-tight">Predicted Coverage — Target A</h3>
            </div>
          </div>
          {generated && result?.max_range_km != null && (
            <div className="text-xs font-mono text-emerald-100">
              {Number(result.max_range_km).toFixed(1)} km max range
            </div>
          )}
        </div>
        <div className="relative w-full bg-card border-x border-border" style={{ height: 560 }}>
          <div ref={mapDivRef} className="absolute inset-0" />
          {!generated && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <Radio className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Pick a carrier band and generate the RF coverage exhibit.</p>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-card">
              <div className="w-10 h-10 border-4 border-emerald-400/20 border-t-emerald-500 rounded-full animate-spin" />
              <p className="font-heading font-semibold mt-3 text-sm">Running CloudRF coverage model…</p>
            </div>
          )}
        </div>
        {generated && <CoverageTable result={result} />}
      </div>
    </div>
  );
}