/**
 * HawkUtilitiesIntelligence — One-click Generate button that produces two
 * dedicated print pages in parallel via Promise.all, mirroring the exact
 * structure and conventions of HawkAerialIntelligence:
 *
 *   MAP 1 — Hawk Power Map   (satellite + SARF rings centered on Target A
 *                            + HIFLD transmission lines via
 *                            hifldTransmissionLines + a printable
 *                            "Nearby Transmission Connections" table
 *                            below the map on the SAME print page)
 *   MAP 2 — Hawk Fiber Map   (satellite + SARF rings centered on Target A
 *                            + FCC fiber rollup via fccPolygonFiberRollup
 *                            rendered as a fill layer + a printable
 *                            "Fiber & Broadband Providers in Radius" table
 *                            below the map on the SAME print page)
 *
 * Engine: Mapbox GL JS v3.6.0 loaded via CDN — matches HawkAerialIntelligence
 * and SARFMap exactly. Coordinates come from the resolved Target A passed
 * down from SCIPPreview (sourced from HawkParcelDetails onTargetsResolved).
 *
 * Radius is selectable via two pill toggles (0.50 mi / 1.00 mi). Both rings
 * are always drawn; the active radius is visually emphasized and used for
 * the map fit + downstream lookups.
 */

import { useEffect, useRef, useState } from "react";
import { Zap, Sparkles, Loader2, Cable, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { loadPublicConfig } from "@/lib/publicConfig";
import { hifldTransmissionLines } from "@/functions/hifldTransmissionLines";
import { fccPolygonFiberRollup } from "@/functions/fccPolygonFiberRollup";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

// ────────────── geometry helpers (match Aerial / SARFMap math) ──────────────
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

function distFt(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 5280;
}

function ringBbox(lat, lon, radiusMiles = 1.0) {
  const ring = buildCircle(lat, lon, radiusMiles);
  const lons = ring.geometry.coordinates[0].map((c) => c[0]);
  const lats = ring.geometry.coordinates[0].map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

// ────────────── Mapbox GL JS loader (idempotent, matches Aerial) ──────────────
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

// ────────────── decorate the SARF base for a Target-A-centered map ──────────────
// activeRadius = 0.5 or 1.0 (emphasized). Both rings drawn for visual reference.
function decorateSarfBase(map, tgtLat, tgtLon, srcLat, srcLon, activeRadius) {
  const halfMile = buildCircle(tgtLat, tgtLon, 0.5);
  const oneMile = buildCircle(tgtLat, tgtLon, 1.0);

  const halfActive = activeRadius === 0.5;
  const oneActive = activeRadius === 1.0;

  map.addSource("hui-ring-1mi", { type: "geojson", data: oneMile });
  map.addLayer({
    id: "hui-ring-1mi-fill",
    type: "fill",
    source: "hui-ring-1mi",
    paint: { "fill-color": "#ef4444", "fill-opacity": oneActive ? 0.08 : 0.02 },
  });
  map.addLayer({
    id: "hui-ring-1mi-line",
    type: "line",
    source: "hui-ring-1mi",
    paint: {
      "line-color": "#ef4444",
      "line-width": oneActive ? 3 : 1.5,
      "line-opacity": oneActive ? 1 : 0.5,
    },
  });

  map.addSource("hui-ring-half", { type: "geojson", data: halfMile });
  map.addLayer({
    id: "hui-ring-half-fill",
    type: "fill",
    source: "hui-ring-half",
    paint: { "fill-color": "#facc15", "fill-opacity": halfActive ? 0.1 : 0.025 },
  });
  map.addLayer({
    id: "hui-ring-half-line",
    type: "line",
    source: "hui-ring-half",
    paint: {
      "line-color": "#facc15",
      "line-width": halfActive ? 3 : 1.5,
      "line-opacity": halfActive ? 1 : 0.5,
    },
  });

  // Target A tower marker (center)
  const tgtEl = document.createElement("div");
  tgtEl.style.cssText = `
    width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
    background: rgba(15,23,42,0.92); border: 2px solid #f97316; border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(249,115,22,0.5), 0 0 14px rgba(249,115,22,0.8);
    font-family: ui-monospace, monospace; font-weight: 700; color: #f97316; font-size: 16px;
  `;
  tgtEl.textContent = "📡";
  new window.mapboxgl.Marker({ element: tgtEl, anchor: "center" })
    .setLngLat([tgtLon, tgtLat])
    .setPopup(
      new window.mapboxgl.Popup({ offset: 22 }).setHTML(
        `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A — TOWER</strong><br/>${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}</div>`
      )
    )
    .addTo(map);

  // Optional small SARF-style waypoint for the original search center, for context.
  if (Number.isFinite(srcLat) && Number.isFinite(srcLon)) {
    const srcEl = document.createElement("div");
    srcEl.style.cssText = `
      width: 14px; height: 14px; border-radius: 50%;
      background: #06b6d4; border: 2px solid #fff;
      box-shadow: 0 0 0 1px #06b6d4, 0 0 8px rgba(6,182,212,0.7);
      opacity: 0.85;
    `;
    new window.mapboxgl.Marker({ element: srcEl, anchor: "center" })
      .setLngLat([srcLon, srcLat])
      .setPopup(
        new window.mapboxgl.Popup({ offset: 12 }).setHTML(
          `<div style="font-family:monospace;font-size:11px;"><strong>SEARCH CENTER</strong><br/>${srcLat.toFixed(6)}, ${srcLon.toFixed(6)}</div>`
        )
      )
      .addTo(map);
  }

  // Fit to the active ring's bbox with padding.
  const fitRing = activeRadius === 1.0 ? oneMile : halfMile;
  const coords = fitRing.geometry.coordinates[0];
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  map.fitBounds(
    [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: 60, duration: 0 }
  );
}

// ────────────── individual map renderers ──────────────
async function renderPowerMap(container, tgtLat, tgtLon, srcLat, srcLon, radiusMiles, token, hifldFC) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [tgtLon, tgtLat], zoom: 13.2, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      // HIFLD GeoJSON line layer (best-effort — skipped if fetch failed).
      if (hifldFC && Array.isArray(hifldFC.features) && hifldFC.features.length > 0) {
        map.addSource("hui-hifld", { type: "geojson", data: hifldFC });
        // Casing (dark outline) for legibility on satellite.
        map.addLayer({
          id: "hui-hifld-casing",
          type: "line",
          source: "hui-hifld",
          paint: { "line-color": "#000", "line-width": 5, "line-opacity": 0.55 },
        });
        map.addLayer({
          id: "hui-hifld-line",
          type: "line",
          source: "hui-hifld",
          paint: { "line-color": "#fde047", "line-width": 2.5, "line-opacity": 0.95 },
        });
      }
      decorateSarfBase(map, tgtLat, tgtLon, srcLat, srcLon, radiusMiles);
      resolve(map);
    });
  });
}

async function renderFiberMap(container, tgtLat, tgtLon, srcLat, srcLon, radiusMiles, token, radiusPolygon) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [tgtLon, tgtLat], zoom: 13.2, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      // FCC polygon rollup returns aggregate stats, not provider polygons. We
      // visualize the analyzed coverage radius as a fill layer for context.
      if (radiusPolygon) {
        map.addSource("hui-fcc-area", { type: "geojson", data: radiusPolygon });
        map.addLayer({
          id: "hui-fcc-area-fill",
          type: "fill",
          source: "hui-fcc-area",
          paint: { "fill-color": "#06b6d4", "fill-opacity": 0.15 },
        });
        map.addLayer({
          id: "hui-fcc-area-line",
          type: "line",
          source: "hui-fcc-area",
          paint: { "line-color": "#06b6d4", "line-width": 1.5, "line-dasharray": [2, 2] },
        });
      }
      decorateSarfBase(map, tgtLat, tgtLon, srcLat, srcLon, radiusMiles);
      resolve(map);
    });
  });
}

// ────────────── Map page wrapper (matches Aerial) ──────────────
function MapPage({ title, icon: Icon, statBlock, mapRef, height = 620 }) {
  return (
    <>
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap rounded-t-xl">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-amber-300" />}
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-amber-300/80">
              SCIP · HAWK UTILITIES INTELLIGENCE
            </div>
            <h3 className="font-heading font-bold text-lg leading-tight">{title}</h3>
          </div>
        </div>
        {statBlock && <div className="text-xs font-mono text-amber-100">{statBlock}</div>}
      </div>
      <div className="relative w-full bg-card border-x border-border" style={{ height }}>
        <div ref={mapRef} className="absolute inset-0" />
      </div>
    </>
  );
}

// ────────────── compact print-friendly tables ──────────────
function PowerTable({ rows }) {
  return (
    <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
      <div className="bg-slate-100 dark:bg-slate-800/40 px-4 py-2 border-b border-border">
        <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · POWER</div>
        <div className="font-heading font-bold text-sm">Nearby Transmission Connections</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 text-foreground">
              <th className="text-left px-3 py-2 font-semibold">From</th>
              <th className="text-left px-3 py-2 font-semibold">To</th>
              <th className="text-left px-3 py-2 font-semibold">Owner (Company)</th>
              <th className="text-left px-3 py-2 font-semibold">kV</th>
              <th className="text-left px-3 py-2 font-semibold">Class</th>
            </tr>
          </thead>
          <tbody>
            {rows && rows.length > 0 ? rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                <td className="px-3 py-1.5 border-t border-border">{r.from || "—"}</td>
                <td className="px-3 py-1.5 border-t border-border">{r.to || "—"}</td>
                <td className="px-3 py-1.5 border-t border-border">{r.owner || "—"}</td>
                <td className="px-3 py-1.5 border-t border-border font-mono">{r.kv || "—"}</td>
                <td className="px-3 py-1.5 border-t border-border font-mono">{r.vclass || "—"}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-muted-foreground italic border-t border-border">
                  No transmission connections available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FiberTable({ rows, note }) {
  return (
    <div className="border border-border border-t-0 rounded-b-xl overflow-hidden">
      <div className="bg-slate-100 dark:bg-slate-800/40 px-4 py-2 border-b border-border">
        <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">SCIP · FIBER</div>
        <div className="font-heading font-bold text-sm">Fiber &amp; Broadband Providers in Radius</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 text-foreground">
              <th className="text-left px-3 py-2 font-semibold">Provider (Company)</th>
              <th className="text-left px-3 py-2 font-semibold">Technology</th>
              <th className="text-left px-3 py-2 font-semibold">Max Down (Mbps)</th>
              <th className="text-left px-3 py-2 font-semibold">Max Up (Mbps)</th>
            </tr>
          </thead>
          <tbody>
            {rows && rows.length > 0 ? rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                <td className="px-3 py-1.5 border-t border-border">{r.provider || "—"}</td>
                <td className="px-3 py-1.5 border-t border-border">{r.technology || "—"}</td>
                <td className="px-3 py-1.5 border-t border-border font-mono">{r.max_down ?? "—"}</td>
                <td className="px-3 py-1.5 border-t border-border font-mono">{r.max_up ?? "—"}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-center text-muted-foreground italic border-t border-border">
                  {note || "No fiber data returned for this radius"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────── main component ──────────────
export default function HawkUtilitiesIntelligence({ srcLat, srcLon, targetA }) {
  const [radiusMiles, setRadiusMiles] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const [powerRows, setPowerRows] = useState([]);
  const [fiberRows, setFiberRows] = useState([]);
  const [fiberNote, setFiberNote] = useState(null);
  const [hifldCount, setHifldCount] = useState(null);
  const [fiberSummary, setFiberSummary] = useState(null);

  const powerRef = useRef(null);
  const fiberRef = useRef(null);
  const mapsRef = useRef({ power: null, fiber: null });

  // Cleanup mapbox instances on unmount.
  useEffect(() => {
    return () => {
      Object.values(mapsRef.current).forEach((m) => m?.remove?.());
      mapsRef.current = { power: null, fiber: null };
    };
  }, []);

  // If Target A is null, render placeholder card and skip everything else.
  if (!targetA || !Number.isFinite(Number(targetA.latitude)) || !Number.isFinite(Number(targetA.longitude))) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-heading font-bold text-amber-900 dark:text-amber-200 text-sm">
            Hawk Utilities Intelligence
          </div>
          <div className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
            Run Hawk Parcel Details first to resolve Target A — Utilities Intelligence centers on the chosen Target A parcel centroid.
          </div>
        </div>
      </div>
    );
  }

  const tgtLat = Number(targetA.latitude);
  const tgtLon = Number(targetA.longitude);

  async function handleGenerate() {
    setLoading(true);

    // Non-blocking optional log
    try {
      await base44.entities.SearchLog?.create?.({
        radius_miles: radiusMiles,
        lat: tgtLat,
        lon: tgtLon,
        kind: "utilities",
      });
    } catch {
      /* TODO: wire to Supabase search_logs once entity/function exists */
    }

    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (!token) {
        toast.error("Mapbox token unavailable.");
        setLoading(false);
        return;
      }
      await ensureMapboxLoaded();

      // Build the radius circle once — used for fit + FCC polygon + bbox.
      const radiusCircle = buildCircle(tgtLat, tgtLon, radiusMiles);
      const bbox = ringBbox(tgtLat, tgtLon, radiusMiles);

      // Dispose any prior maps.
      Object.values(mapsRef.current).forEach((m) => m?.remove?.());
      mapsRef.current = { power: null, fiber: null };

      await new Promise((r) => requestAnimationFrame(r));

      // Parallel lookups (allSettled so partial failures don't abort).
      const [hifldRes, fccRes, ptlRes] = await Promise.allSettled([
        hifldTransmissionLines({ bbox }),
        fccPolygonFiberRollup({ polygon: radiusCircle.geometry }),
        base44.entities.PowerTransmissionLine.list("-kv", 25).catch(() => []),
      ]);

      // ── HIFLD geometry + table rows ──
      let hifldFC = null;
      let hifldTableRows = [];
      if (hifldRes.status === "fulfilled" && hifldRes.value?.data) {
        const fc = hifldRes.value.data;
        if (fc.type === "FeatureCollection" && Array.isArray(fc.features)) {
          hifldFC = fc;
          setHifldCount(fc.count ?? fc.features.length);
          hifldTableRows = fc.features.slice(0, 25).map((f) => {
            const p = f.properties || {};
            return {
              from: p.SUB_1 || null,
              to: p.SUB_2 || null,
              owner: p.OWNER || null,
              kv: p.VOLTAGE != null ? String(p.VOLTAGE) : null,
              vclass: p.VOLT_CLASS || null,
            };
          });
        }
      } else if (hifldRes.status === "rejected") {
        toast.error("HIFLD transmission lookup failed — rendering best-effort.");
      }

      // Fall back to PowerTransmissionLine entity rows if HIFLD returned nothing.
      if (hifldTableRows.length === 0 && ptlRes.status === "fulfilled" && Array.isArray(ptlRes.value)) {
        hifldTableRows = ptlRes.value.slice(0, 25).map((r) => ({
          from: r.from || null,
          to: r.to || null,
          owner: r.owner || null,
          kv: r.kv || null,
          vclass: r.vclass || null,
        }));
      }
      setPowerRows(hifldTableRows);

      // ── FCC rollup (aggregate stats — not per-provider rows) ──
      if (fccRes.status === "fulfilled" && fccRes.value?.data) {
        const d = fccRes.value.data;
        if (d.found && d.summary) {
          setFiberSummary(d.summary);
          // The rollup is aggregate; synthesize a single summary "providers" row
          // so the print table still conveys the FCC signal. Real per-provider
          // expansion lands once a richer endpoint is wired.
          const s = d.summary;
          setFiberRows([
            {
              provider: `FCC rollup · ${s.bgCount} block group${s.bgCount === 1 ? "" : "s"}`,
              technology: "Fiber (FCC BDC)",
              max_down: s.fiberServedPct != null ? `${s.fiberServedPct}% served` : null,
              max_up: s.maxFiberProvidersInAnyBG != null ? `${s.maxFiberProvidersInAnyBG} max providers` : null,
            },
          ]);
          setFiberNote(null);
        } else {
          setFiberRows([]);
          setFiberNote("No fiber data returned for this radius");
        }
      } else {
        setFiberRows([]);
        setFiberNote("No fiber data returned for this radius");
        if (fccRes.status === "rejected") {
          toast.error("FCC fiber rollup failed — rendering best-effort.");
        }
      }

      // ── Render both maps in parallel ──
      const [powerMap, fiberMap] = await Promise.all([
        renderPowerMap(powerRef.current, tgtLat, tgtLon, srcLat, srcLon, radiusMiles, token, hifldFC),
        renderFiberMap(fiberRef.current, tgtLat, tgtLon, srcLat, srcLon, radiusMiles, token, radiusCircle),
      ]);
      mapsRef.current = { power: powerMap, fiber: fiberMap };

      setGenerated(true);
      toast.success("Hawk Utilities Intelligence generated 2 map pages.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Hawk Utilities Intelligence failed.");
    } finally {
      setLoading(false);
    }
  }

  const powerStat = generated && hifldCount != null
    ? `${hifldCount.toLocaleString()} transmission features in ${radiusMiles.toFixed(2)} mi`
    : null;

  const fiberStat = generated && fiberSummary
    ? `${fiberSummary.bgCount} BGs · ${fiberSummary.fiberServedPct ?? "—"}% fiber-served`
    : null;

  const ownerLabel = targetA.owner || targetA.parcel_address || `${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}`;

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-orange-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · UTILITIES INTELLIGENCE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">Hawk Utilities Intelligence — Power · Fiber</h2>
              <div className="text-[11px] font-mono opacity-90 mt-0.5">
                Target A · {ownerLabel}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Radius pill toggles */}
            <div className="inline-flex rounded-md overflow-hidden border border-white/30">
              <Button
                onClick={() => setRadiusMiles(0.5)}
                size="sm"
                className={
                  radiusMiles === 0.5
                    ? "bg-white text-orange-700 hover:bg-orange-50 font-semibold rounded-none border-0"
                    : "bg-transparent text-white hover:bg-white/10 font-semibold rounded-none border-0"
                }
              >
                0.50 mi
              </Button>
              <Button
                onClick={() => setRadiusMiles(1.0)}
                size="sm"
                className={
                  radiusMiles === 1.0
                    ? "bg-white text-orange-700 hover:bg-orange-50 font-semibold rounded-none border-0"
                    : "bg-transparent text-white hover:bg-white/10 font-semibold rounded-none border-0"
                }
              >
                1.00 mi
              </Button>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="bg-white text-orange-700 hover:bg-orange-50 font-semibold shadow"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Regenerate" : "Generate with Hawk Utilities Intelligence"}</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Power section — map + table on the SAME print page */}
      <div
        className="rounded-xl border border-border bg-card overflow-hidden"
        style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <MapPage title="Hawk Power Map" icon={Zap} statBlock={powerStat} mapRef={powerRef} />
        <PowerTable rows={powerRows} />
      </div>

      {/* Fiber section — map + table on the SAME print page */}
      <div
        className="rounded-xl border border-border bg-card overflow-hidden"
        style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <MapPage title="Hawk Fiber Map" icon={Cable} statBlock={fiberStat} mapRef={fiberRef} />
        <FiberTable rows={fiberRows} note={fiberNote} />
      </div>
    </div>
  );
}