/**
 * SitePowerMap — Target-A-driven "Surrounding Power Structure" map.
 *
 * Drives everything off the SCIP active target (Target A) until the user
 * switches to B or C. Identifies EVERY nearby power asset:
 *   • HIFLD transmission lines within ~2 mi  (hifldTransmissionLines fn)
 *   • HIFLD substations within ~10 mi        (Substations FeatureServer)
 * Computes nearest line, nearest substation (tie-in), ring counts (0.25/0.5/1 mi),
 * labels every substation on the map, and enumerates all nearby lines &
 * substations in the side panel so nothing is left unidentified.
 *
 * Coordinate sources (priority order):
 *   1. ?scip=<recordId>  → loads ScipRecord, resolves Target A/B/C from
 *                          parcel_targets via resolveScipActiveTarget().
 *   2. ?lat=&lon=&label=&address=  (+ optional &blat/&blon, &clat/&clon, &ti)
 *   3. Brevard County, FL demo (no params).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Zap, Gauge, Building2, Radio, TowerControl, Loader2, AlertTriangle, List } from "lucide-react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { hifldTransmissionLines } from "@/functions/hifldTransmissionLines";
import { base44 } from "@/api/base44Client";
import { resolveScipActiveTarget } from "@/lib/scipTarget";
import PowerLineDetailsPanel from "../components/powerlines/PowerLineDetailsPanel";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
const SUBSTATIONS_URL =
  "https://services6.arcgis.com/OO2s4OoyCZkYJ6oE/arcgis/rest/services/Substations/FeatureServer/0/query";

const LINE_COLOR_EXPR = [
  "step",
  ["coalesce", ["to-number", ["get", "VOLTAGE"]], -1],
  "#9ca3af",
  0, "#22d3ee", 100, "#4ade80", 300, "#fb923c", 500, "#f43f5e",
];

const DEMO_TARGETS = [
  { label: "Target A", lat: 28.3489, lon: -80.7419, address: "Rockledge · Brevard County, FL" },
  { label: "Target B", lat: 28.3600, lon: -80.7300, address: "Viera · Brevard County, FL" },
  { label: "Target C", lat: 28.0836, lon: -80.6081, address: "Palm Bay · Brevard County, FL" },
];
const TARGET_LABELS = ["Target A", "Target B", "Target C"];

// ---- geo helpers ----
const R_MI = 3958.7613;
const toRad = (d) => (d * Math.PI) / 180;
function milesBetween(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function pointToSegMiles(lat, lon, aLat, aLon, bLat, bLon) {
  const kx = Math.cos(toRad(lat)) * 69.172, ky = 69.172;
  const px = lon * kx, py = lat * ky, ax = aLon * kx, ay = aLat * ky, bx = bLon * kx, by = bLat * ky;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function lineMinMiles(lat, lon, geom) {
  const rings = geom.type === "LineString" ? [geom.coordinates] : geom.coordinates;
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [aLon, aLat] = ring[i], [bLon, bLat] = ring[i + 1];
      const d = pointToSegMiles(lat, lon, aLat, aLon, bLat, bLon);
      if (d < min) min = d;
    }
    if (ring.length === 1) { const [x, y] = ring[0]; const d = milesBetween(lat, lon, y, x); if (d < min) min = d; }
  }
  return min;
}
function circlePolygon(lat, lon, miles, steps = 72) {
  const coords = [];
  const dLat = miles / 69.172, dLon = miles / (Math.cos(toRad(lat)) * 69.172);
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * 2 * Math.PI; coords.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: { miles } };
}
function voltLabel(v, cls) { const n = Number(v); if (Number.isFinite(n) && n > 0) return `${n} kV`; return cls || "Unknown"; }
// Real name, or fall back to city/county so no substation is left unidentified.
function cleanSubName(p) {
  const n = (p?.NAME || "").trim();
  const junk = !n || /^UNKNOWN/i.test(n) || /^\d+$/.test(n);
  if (!junk) return n;
  const loc = [p?.CITY, p?.COUNTY].filter(Boolean).join(" / ");
  return loc ? `Substation · ${loc}` : "Substation (unnamed)";
}

let mapboxLoadingPromise = null;
async function ensureMapbox() {
  if (window.mapboxgl) return;
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = MAPBOX_CSS; document.head.appendChild(css);
      const s = document.createElement("script"); s.src = MAPBOX_JS; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
  await mapboxLoadingPromise;
}
async function fetchSubstations(lat, lon, miles) {
  const dLat = miles / 69.172, dLon = miles / (Math.cos(toRad(lat)) * 69.172);
  const geom = { xmin: lon - dLon, ymin: lat - dLat, xmax: lon + dLon, ymax: lat + dLat, spatialReference: { wkid: 4326 } };
  const params = new URLSearchParams({
    where: "1=1", geometry: JSON.stringify(geom), geometryType: "esriGeometryEnvelope",
    inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: "NAME,STATUS,TYPE,LINES,MAX_VOLT,MIN_VOLT,CITY,COUNTY", returnGeometry: "true", f: "geojson", resultRecordCount: "300",
  });
  const resp = await fetch(`${SUBSTATIONS_URL}?${params.toString()}`);
  if (!resp.ok) throw new Error(`Substations ${resp.status}`);
  return (await resp.json()).features || [];
}

function targetsFromRecord(record) {
  const arr = Array.isArray(record?.parcel_targets) ? record.parcel_targets : [];
  const out = [];
  arr.slice(0, 3).forEach((t, i) => {
    const lat = Number(t.latitude ?? record.latitude), lon = Number(t.longitude ?? record.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      out.push({ label: TARGET_LABELS[i] || `Target ${i + 1}`, lat, lon, address: t.parcel_address || t.owner_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}` });
    }
  });
  if (out.length === 0) {
    const ctx = resolveScipActiveTarget(record);
    if (ctx.lat != null && ctx.lon != null) out.push({ label: ctx.target_label, lat: ctx.lat, lon: ctx.lon, address: record?.site_name || `${ctx.lat.toFixed(4)}, ${ctx.lon.toFixed(4)}` });
  }
  return out;
}
function targetsFromParams(params) {
  const lat = parseFloat(params.get("lat")), lon = parseFloat(params.get("lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const out = [{ label: params.get("label") || "Target A", lat, lon, address: params.get("address") || `${lat.toFixed(4)}, ${lon.toFixed(4)}` }];
    const bl = parseFloat(params.get("blat")), bo = parseFloat(params.get("blon"));
    if (Number.isFinite(bl) && Number.isFinite(bo)) out.push({ label: "Target B", lat: bl, lon: bo, address: `${bl.toFixed(4)}, ${bo.toFixed(4)}` });
    const cl = parseFloat(params.get("clat")), co = parseFloat(params.get("clon"));
    if (Number.isFinite(cl) && Number.isFinite(co)) out.push({ label: "Target C", lat: cl, lon: co, address: `${cl.toFixed(4)}, ${co.toFixed(4)}` });
    return out;
  }
  return null;
}

function StatRow({ label, value, sub }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground pt-0.5">{label}</div>
      <div className="text-right"><div className="text-sm font-semibold text-foreground">{value ?? "—"}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>
    </div>
  );
}

export default function SitePowerMap() {
  const [params] = useSearchParams();
  const scipId = params.get("scip");

  const [targets, setTargets] = useState(() => targetsFromParams(params) || DEMO_TARGETS);
  const [isDemo, setIsDemo] = useState(() => !scipId && !targetsFromParams(params));
  const [scipMeta, setScipMeta] = useState(null); // { site_name }
  const [scipLoading, setScipLoading] = useState(!!scipId);
  const [scipError, setScipError] = useState(null);
  const [activeIdx, setActiveIdx] = useState(() => {
    const ti = parseInt(params.get("ti"), 10);
    return Number.isFinite(ti) && ti >= 0 ? ti : 0;
  });
  const target = targets[activeIdx] || targets[0] || null;

  // Load SCIP record when ?scip= present
  useEffect(() => {
    if (!scipId) return;
    let cancelled = false;
    (async () => {
      setScipLoading(true); setScipError(null);
      try {
        const record = await base44.entities.ScipRecord.get(scipId);
        if (cancelled) return;
        const t = targetsFromRecord(record);
        if (t.length === 0) { setScipError("This SCIP has no target coordinates yet. Run 'Find 3 Best Parcels' to set Target A."); setScipLoading(false); return; }
        setTargets(t);
        setIsDemo(false);
        setScipMeta({ site_name: record?.site_name || "" });
        const ctx = resolveScipActiveTarget(record);
        setActiveIdx(Math.min(Math.max(0, ctx.target_index || 0), t.length - 1));
      } catch (e) {
        if (!cancelled) setScipError(e?.message || "Could not load SCIP record.");
      } finally {
        if (!cancelled) setScipLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scipId]);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const siteMarkerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(null);
  const reqRef = useRef(0);

  // init map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (!token) { setTokenMissing(true); return; }
      await ensureMapbox();
      if (cancelled) return;
      window.mapboxgl.accessToken = token;
      const center = target ? [target.lon, target.lat] : [-98.5, 39.5];
      const map = new window.mapboxgl.Map({ container: containerRef.current, style: SAT_STYLE, center, zoom: target ? 13.2 : 4 });
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

      map.on("load", () => {
        map.addSource("rings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "rings-line", type: "line", source: "rings", paint: { "line-color": "#38bdf8", "line-width": 1.4, "line-opacity": 0.7, "line-dasharray": [2, 2] } });

        map.addSource("subconn", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "subconn-line", type: "line", source: "subconn", paint: { "line-color": "#facc15", "line-width": 2, "line-dasharray": [1.5, 1.2], "line-opacity": 0.9 } });

        map.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "lines-halo", type: "line", source: "lines", paint: { "line-color": "#000", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 7], "line-opacity": 0.35 } });
        map.addLayer({ id: "lines-color", type: "line", source: "lines", paint: { "line-color": LINE_COLOR_EXPR, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 15, 4], "line-opacity": 0.95 } });
        map.addLayer({ id: "lines-hit", type: "line", source: "lines", paint: { "line-color": "#000", "line-opacity": 0, "line-width": 16 } });

        map.addSource("subs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "subs-pt", type: "circle", source: "subs", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 8], "circle-color": "#fde047", "circle-stroke-color": "#000", "circle-stroke-width": 1.2, "circle-opacity": 0.95 } });
        map.addLayer({ id: "subs-label", type: "symbol", source: "subs", minzoom: 11,
          layout: { "text-field": ["get", "disp"], "text-size": 10, "text-offset": [0, 1.1], "text-anchor": "top", "text-allow-overlap": false, "text-optional": true },
          paint: { "text-color": "#fde047", "text-halo-color": "#000", "text-halo-width": 1.4 } });

        const hover = new window.mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        map.on("mousemove", "lines-hit", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties || {};
          hover.setLngLat(e.lngLat).setHTML(`<div style="font-family:monospace;font-size:11px"><strong>${voltLabel(p.VOLTAGE, p.VOLT_CLASS)}</strong> · ${p.OWNER ?? "N/A"}<br/>${p.SUB_1 ?? "—"} → ${p.SUB_2 ?? "—"}</div>`).addTo(map);
        });
        map.on("mouseleave", "lines-hit", () => { map.getCanvas().style.cursor = ""; hover.remove(); });
        map.on("click", "lines-hit", (e) => { const f = e.features?.[0]; if (!f) return; setSelected({ properties: f.properties, lngLat: [e.lngLat.lng, e.lngLat.lat] }); });

        const subHover = new window.mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        map.on("mousemove", "subs-pt", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties || {};
          const mv = Number(p.MAX_VOLT) > 0 ? `${p.MAX_VOLT} kV` : "";
          subHover.setLngLat(e.lngLat).setHTML(`<div style="font-family:monospace;font-size:11px"><strong>⚡ ${p.disp || p.NAME || "Substation"}</strong><br/>${mv}${p.STATUS ? " · " + p.STATUS : ""}${p.LINES ? " · " + p.LINES + " lines" : ""}</div>`).addTo(map);
        });
        map.on("mouseleave", "subs-pt", () => { map.getCanvas().style.cursor = ""; subHover.remove(); });

        setReady(true);
      });
      mapRef.current = map;
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // on target change: recenter, rings, marker, fetch, compute + identify assets
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !target) return;
    const { lat, lon } = target;
    const reqId = ++reqRef.current;
    setLoading(true); setSelected(null);
    map.flyTo({ center: [lon, lat], zoom: 13.2, duration: 600 });
    map.getSource("rings")?.setData({ type: "FeatureCollection", features: [0.25, 0.5, 1].map((mi) => circlePolygon(lat, lon, mi)) });

    if (!siteMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = "width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.92);border:2px solid #f97316;border-radius:50%;box-shadow:0 0 0 2px rgba(249,115,22,.5),0 0 14px rgba(249,115,22,.8);font-size:15px";
      el.textContent = "📡";
      siteMarkerRef.current = new window.mapboxgl.Marker({ element: el, anchor: "center" });
    }
    siteMarkerRef.current.setLngLat([lon, lat]).addTo(map);

    (async () => {
      const dLatMi = 2.0;
      const dLat = dLatMi / 69.172, dLon = dLatMi / (Math.cos(toRad(lat)) * 69.172);
      const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
      let lineFeats = [], subFeats = [];
      try {
        const [lineResp, subs] = await Promise.all([hifldTransmissionLines({ bbox, limit: 1000 }), fetchSubstations(lat, lon, 10).catch(() => [])]);
        lineFeats = lineResp?.data?.features || [];
        subFeats = subs || [];
      } catch (err) { console.warn("SitePowerMap fetch failed:", err?.message); }
      if (reqId !== reqRef.current) return;

      // annotate substations with display name + distance for map labels & lists
      subFeats = subFeats.map((s) => {
        const c = s.geometry?.coordinates;
        const d = c ? milesBetween(lat, lon, c[1], c[0]) : Infinity;
        return { ...s, properties: { ...s.properties, disp: cleanSubName(s.properties), _mi: d } };
      });
      map.getSource("lines")?.setData({ type: "FeatureCollection", features: lineFeats });
      map.getSource("subs")?.setData({ type: "FeatureCollection", features: subFeats });

      const rings = { r025: 0, r05: 0, r1: 0 };
      let nearestLine = null, nearestLineDist = Infinity;
      const owners = new Set(), vclasses = new Set();
      const lineList = [];
      for (const f of lineFeats) {
        if (!f.geometry) continue;
        const d = lineMinMiles(lat, lon, f.geometry);
        if (d <= 0.25) rings.r025++;
        if (d <= 0.5) rings.r05++;
        if (d <= 1) { rings.r1++; if (f.properties?.OWNER) owners.add(f.properties.OWNER); vclasses.add(voltLabel(f.properties?.VOLTAGE, f.properties?.VOLT_CLASS)); }
        if (d < nearestLineDist) { nearestLineDist = d; nearestLine = f; }
        lineList.push({ d, p: f.properties || {} });
      }
      lineList.sort((a, b) => a.d - b.d);

      const subList = subFeats
        .filter((s) => Number.isFinite(s.properties._mi))
        .map((s) => ({ d: s.properties._mi, name: s.properties.disp, p: s.properties }))
        .sort((a, b) => a.d - b.d);
      let subsWithin1 = 0, subsWithin5 = 0;
      for (const s of subList) { if (s.d <= 1) subsWithin1++; if (s.d <= 5) subsWithin5++; }
      const nearestSub = subList[0] || null;

      if (nearestSub) {
        const s = subFeats.find((x) => x.properties.disp === nearestSub.name && x.properties._mi === nearestSub.d);
        const c = s?.geometry?.coordinates;
        map.getSource("subconn")?.setData(c ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[lon, lat], c] }, properties: {} }] } : { type: "FeatureCollection", features: [] });
      }

      setStats({
        lineCount: lineFeats.length, rings,
        nearestLine: nearestLine ? { d: nearestLineDist, p: nearestLine.properties } : null,
        owners: [...owners], vclasses: [...vclasses],
        subCount: subFeats.length, subsWithin1, subsWithin5,
        nearestSub: nearestSub ? { d: nearestSub.d, p: nearestSub.p } : null,
        lineList: lineList.slice(0, 10), subList: subList.slice(0, 12),
      });
      setLoading(false);
    })();
  }, [ready, target]);

  if (tokenMissing) {
    return <div className="max-w-3xl mx-auto p-8"><div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" /><div className="text-sm text-amber-800 dark:text-amber-200">Mapbox token unavailable — the Site Power Map can't render.</div></div></div>;
  }

  const nl = stats?.nearestLine, ns = stats?.nearestSub;
  const identified = stats ? (stats.lineCount + stats.subCount) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-amber-500/15 via-transparent to-transparent border border-amber-500/30 px-5 py-4 flex items-center gap-4">
        <Zap className="w-9 h-9 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono text-amber-700 tracking-[0.3em]">SCIP · SURROUNDING POWER STRUCTURE · HIFLD LIVE</div>
          <h1 className="font-heading font-bold text-2xl text-foreground leading-tight">Site Power Map</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {scipLoading ? "Loading SCIP target…" : (
              <>
                {target ? `${target.label} · ${target.address}` : "No target"}
                {scipMeta?.site_name ? ` · ${scipMeta.site_name}` : ""}
                {isDemo && <span className="ml-2 text-amber-600 font-mono text-xs">DEMO SITE</span>}
                {stats && <span className="ml-2 text-emerald-600 font-mono text-xs">{identified} ASSETS IDENTIFIED</span>}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {targets.map((t, i) => (
            <button key={i} onClick={() => setActiveIdx(i)} className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition ${i === activeIdx ? "bg-amber-500/20 border-amber-500/60 text-amber-700" : "bg-transparent border-border text-muted-foreground hover:text-foreground"}`}>
              {t.label.replace("Target ", "")}
            </button>
          ))}
        </div>
      </div>

      {scipError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {scipError} — showing demo data.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="relative w-full h-[660px] rounded-lg overflow-hidden border border-border">
          <div ref={containerRef} className="absolute inset-0" />
          {loading && <div className="absolute top-3 left-3 bg-black/70 text-amber-300 text-[11px] font-mono px-2 py-1 rounded flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> LOADING GRID…</div>}
          <div className="absolute bottom-5 left-5 bg-white/95 text-slate-800 text-[12px] px-3 py-2 rounded-lg shadow-md leading-relaxed">
            <strong>Transmission (kV)</strong><br />
            <span style={{ color: "#22d3ee" }}>▬</span> &lt;100&nbsp;
            <span style={{ color: "#4ade80" }}>▬</span> 100–299&nbsp;
            <span style={{ color: "#fb923c" }}>▬</span> 300–499&nbsp;
            <span style={{ color: "#f43f5e" }}>▬</span> 500+<br />
            <span style={{ color: "#eab308" }}>●</span> Substation&nbsp;&nbsp;
            <span style={{ color: "#f97316" }}>📡</span> Site&nbsp;&nbsp;
            <span style={{ color: "#38bdf8" }}>◌</span> 0.25/0.5/1 mi
          </div>
        </div>

        <div className="space-y-4">
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            <div className="bg-gradient-to-r from-amber-600 to-yellow-600 text-white px-3 py-2 flex items-center gap-2"><Gauge className="w-4 h-4" /><span className="font-heading font-semibold text-sm">Surrounding Power Structure</span></div>
            <div className="px-3 py-2">
              <div className="mb-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1"><TowerControl className="w-3 h-3" /> Nearest transmission line</div>
                {nl ? (
                  <div className="bg-muted/50 rounded p-2">
                    <div className="text-sm font-bold">{nl.d < 0.1 ? `${(nl.d * 5280).toFixed(0)} ft` : `${nl.d.toFixed(2)} mi`} away</div>
                    <div className="text-xs text-muted-foreground">{voltLabel(nl.p.VOLTAGE, nl.p.VOLT_CLASS)} · {nl.p.OWNER || "Owner N/A"}</div>
                    <div className="text-xs text-muted-foreground truncate">{nl.p.SUB_1 || "—"} → {nl.p.SUB_2 || "—"}</div>
                  </div>
                ) : <div className="text-xs text-muted-foreground italic py-1">No transmission line within 2 mi.</div>}
              </div>
              <StatRow label="Lines ≤ 0.25 mi" value={stats?.rings.r025 ?? "—"} />
              <StatRow label="Lines ≤ 0.5 mi" value={stats?.rings.r05 ?? "—"} />
              <StatRow label="Lines ≤ 1 mi" value={stats?.rings.r1 ?? "—"} sub={stats?.owners?.length ? `${stats.owners.length} operator${stats.owners.length > 1 ? "s" : ""}` : null} />
              <StatRow label="Voltage classes ≤1mi" value={stats?.vclasses?.length ? stats.vclasses.join(", ") : "—"} />

              <div className="mt-3 mb-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1"><Building2 className="w-3 h-3" /> Nearest substation (tie-in)</div>
                {ns ? (
                  <div className="bg-muted/50 rounded p-2">
                    <div className="text-sm font-bold">{ns.p.disp || ns.p.NAME || "Substation"}</div>
                    <div className="text-xs text-muted-foreground">{ns.d.toFixed(2)} mi away{Number(ns.p.MAX_VOLT) > 0 ? ` · ${ns.p.MAX_VOLT} kV` : ""}{ns.p.LINES ? ` · ${ns.p.LINES} lines` : ""}</div>
                    <div className="text-xs text-muted-foreground">{ns.p.STATUS || ""}{ns.p.COUNTY ? ` · ${ns.p.COUNTY}` : ""}</div>
                  </div>
                ) : <div className="text-xs text-muted-foreground italic py-1">No substation within 10 mi.</div>}
              </div>
              <StatRow label="Substations ≤ 1 mi" value={stats?.subsWithin1 ?? "—"} />
              <StatRow label="Substations ≤ 5 mi" value={stats?.subsWithin5 ?? "—"} />
            </div>
            <div className="px-3 py-1.5 border-t border-border bg-muted/30 text-[10px] font-mono text-muted-foreground tracking-wider flex items-center gap-1.5"><Radio className="w-3 h-3" /> SOURCE · HIFLD TRANSMISSION LINES + SUBSTATIONS</div>
          </div>

          {/* Full identification — every nearby asset enumerated */}
          {stats?.subList?.length > 0 && (
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="bg-muted/60 px-3 py-2 flex items-center gap-2 border-b border-border"><List className="w-4 h-4 text-amber-600" /><span className="font-heading font-semibold text-sm">Substations nearby ({stats.subCount})</span></div>
              <div className="max-h-52 overflow-y-auto divide-y divide-border/60">
                {stats.subList.map((s, i) => (
                  <div key={i} className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="text-muted-foreground whitespace-nowrap font-mono">{s.d.toFixed(1)} mi{Number(s.p.MAX_VOLT) > 0 ? ` · ${s.p.MAX_VOLT}kV` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats?.lineList?.length > 0 && (
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="bg-muted/60 px-3 py-2 flex items-center gap-2 border-b border-border"><List className="w-4 h-4 text-amber-600" /><span className="font-heading font-semibold text-sm">Transmission lines nearby ({stats.lineCount})</span></div>
              <div className="max-h-52 overflow-y-auto divide-y divide-border/60">
                {stats.lineList.map((l, i) => (
                  <div key={i} className="px-3 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{voltLabel(l.p.VOLTAGE, l.p.VOLT_CLASS)}</span>
                      <span className="text-muted-foreground font-mono whitespace-nowrap">{l.d < 0.1 ? `${(l.d * 5280).toFixed(0)} ft` : `${l.d.toFixed(2)} mi`}</span>
                    </div>
                    <div className="text-muted-foreground truncate">{l.p.OWNER || "Owner N/A"} · {l.p.SUB_1 || "—"} → {l.p.SUB_2 || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <PowerLineDetailsPanel selected={selected} onClose={() => setSelected(null)} />
        </div>
      </div>
    </div>
  );
}
