/**
 * HawkFloodplainIntelligence — One-click Generate button that produces a
 * dedicated FEMA floodplain print page: a live Mapbox GL satellite map with
 * the FEMA NFHL Flood Hazard Zones (layer 28 — the colored SFHA polygons)
 * rendered as a raster export overlay, plus a Target A waypoint and a
 * flood-zone readout card from the existing femaFloodLookup function.
 *
 * Engine: Mapbox GL JS v3.6.0 loaded via CDN — matches the other Hawk maps.
 * FEMA source: https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer
 * No token needed for the NFHL export tiles (public MapServer).
 * Centers on the chosen Target A parcel centroid. Placed right after the
 * viewshed maps in the SCIP order.
 */

import { useEffect, useRef, useState } from "react";
import { Waves, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { femaFloodLookup } from "@/functions/femaFloodLookup";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

const NFHL_EXPORT =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export";

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

// ────────────── flood map renderer ──────────────
async function renderFloodMap(container, tgtLat, tgtLon, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container,
    style: SAT_STYLE,
    center: [tgtLon, tgtLat],
    zoom: 14,
    preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      // FEMA NFHL Flood Hazard Zones (layer 28) as a dynamic raster export overlay.
      // Mapbox supplies {bbox-epsg-3857}; bboxSR/imageSR=3857 keeps it aligned.
      const tileUrl =
        `${NFHL_EXPORT}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
        `&size=512,512&dpi=96&format=png32&transparent=true&layers=show:28&f=image`;
      map.addSource("hf-nfhl", {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 512,
      });
      map.addLayer({
        id: "hf-nfhl-layer",
        type: "raster",
        source: "hf-nfhl",
        paint: { "raster-opacity": 0.55 },
      });

      // Target A waypoint.
      const el = document.createElement("div");
      el.style.cssText = `
        width: 34px; height: 34px; display:flex; align-items:center; justify-content:center;
        background: rgba(15,23,42,0.92); border: 2px solid #0ea5e9; border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(14,165,233,0.5), 0 0 14px rgba(14,165,233,0.8);
        font-size: 16px;
      `;
      el.textContent = "📡";
      new window.mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([tgtLon, tgtLat])
        .setPopup(
          new window.mapboxgl.Popup({ offset: 22 }).setHTML(
            `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A</strong><br/>${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}</div>`
          )
        )
        .addTo(map);

      resolve(map);
    });
  });
}

// ────────────── zone readout card ──────────────
function dash(v) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s === "" ? "—" : s;
}

const RISK_COLORS = {
  high: "text-red-700 dark:text-red-300",
  minimal: "text-green-700 dark:text-green-300",
  undetermined: "text-amber-700 dark:text-amber-300",
  unknown: "text-muted-foreground",
};

function FloodTable({ flood }) {
  return (
    <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
      <div className="bg-slate-100 dark:bg-slate-800/40 px-4 py-2 border-b border-border">
        <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · FLOODPLAIN</div>
        <div className="font-heading font-bold text-sm">FEMA NFHL Flood Hazard Zone — Target A</div>
      </div>
      {flood ? (
        <table className="w-full text-xs">
          <tbody>
            {[
              ["Flood Zone", dash(flood.fema_zone)],
              ["Description", dash(flood.fema_zone_description)],
              ["Risk Level", <span className={RISK_COLORS[flood.fema_risk_level] || ""}>{dash(flood.fema_risk_level).toUpperCase()}</span>],
              ["In SFHA", flood.sfha ? "YES — Special Flood Hazard Area" : "No"],
              ["Static BFE", flood.static_bfe != null ? `${flood.static_bfe} ft` : "—"],
              ["Zone Subtype", dash(flood.zone_subtype)],
              ["Source", dash(flood.source)],
            ].map(([k, v], i) => (
              <tr key={k} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                <td className="px-3 py-1.5 border-t border-border font-medium w-[200px]">{k}</td>
                <td className="px-3 py-1.5 border-t border-border font-mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-3 py-3 text-center text-muted-foreground italic">No FEMA flood data returned</div>
      )}
    </div>
  );
}

// ────────────── main component ──────────────
export default function HawkFloodplainIntelligence({ targetA }) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [flood, setFlood] = useState(null);

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
            Hawk Floodplain Intelligence
          </div>
          <div className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
            Run Hawk Parcel Details first to resolve Target A — the FEMA floodplain map centers on the chosen Target A parcel centroid.
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
      await new Promise((r) => requestAnimationFrame(r));

      const [map, floodRes] = await Promise.all([
        renderFloodMap(mapRef.current, tgtLat, tgtLon, token),
        femaFloodLookup({ lat: tgtLat, lon: tgtLon }).catch(() => null),
      ]);
      mapInstance.current = map;
      setFlood(floodRes?.data || null);

      setGenerated(true);
      toast.success("Hawk Floodplain Intelligence generated.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Hawk Floodplain Intelligence failed.");
    } finally {
      setLoading(false);
    }
  }

  const stat = generated && flood?.fema_zone
    ? `Zone ${flood.fema_zone} · ${(flood.fema_risk_level || "").toUpperCase()} risk`
    : null;

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-sky-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Waves className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · FLOODPLAIN INTELLIGENCE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">Hawk Floodplain Intelligence — FEMA NFHL</h2>
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
              <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Regenerate" : "Generate with Hawk Floodplain Intelligence"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Flood map + zone readout — one print page */}
      <div
        className="rounded-xl border border-border bg-card overflow-hidden"
        style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap rounded-t-xl">
          <div className="flex items-center gap-2">
            <Waves className="w-5 h-5 text-sky-300" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] text-sky-300/80">
                SCIP · HAWK FLOODPLAIN INTELLIGENCE
              </div>
              <h3 className="font-heading font-bold text-lg leading-tight">
                FEMA Flood Hazard Zones (NFHL Layer 28)
              </h3>
            </div>
          </div>
          {stat && <div className="text-xs font-mono text-sky-100">{stat}</div>}
        </div>
        <div className="relative w-full bg-card border-x border-border" style={{ height: 620 }}>
          <div ref={mapRef} className="absolute inset-0" />
        </div>
        <FloodTable flood={flood} />
      </div>
    </div>
  );
}