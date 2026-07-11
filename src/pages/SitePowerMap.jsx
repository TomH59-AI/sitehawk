/**
 * SitePowerMap — full-screen page wrapper around <UnifiedGridMap>.
 *
 * Resolves the target(s) and renders the one seamless power + distribution +
 * fiber map for the active Target A/B/C. The map itself (and all its layers,
 * toggles, and stats) lives in the reusable UnifiedGridMap component so the
 * exact same view can be embedded inline in the SCIP Power & Airport section.
 *
 * Coordinate sources (priority):
 *   1. ?scip=<recordId>  → ScipRecord → Target A/B/C via resolveScipActiveTarget
 *   2. ?lat=&lon=&label=&address=  (+ optional &blat/&blon, &clat/&clon, &ti)
 *   3. Brevard County, FL demo (no params)
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Zap, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { resolveScipActiveTarget } from "@/lib/scipTarget";
import UnifiedGridMap from "../components/powerlines/UnifiedGridMap";

const TARGET_LABELS = ["Target A", "Target B", "Target C"];
const DEMO_TARGETS = [
  { label: "Target A", lat: 28.3489, lon: -80.7419, address: "Rockledge · Brevard County, FL" },
  { label: "Target B", lat: 28.3600, lon: -80.7300, address: "Viera · Brevard County, FL" },
  { label: "Target C", lat: 28.0836, lon: -80.6081, address: "Palm Bay · Brevard County, FL" },
];

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

export default function SitePowerMap() {
  const [params] = useSearchParams();
  const scipId = params.get("scip");

  const [targets, setTargets] = useState(() => targetsFromParams(params) || DEMO_TARGETS);
  const [isDemo, setIsDemo] = useState(() => !scipId && !targetsFromParams(params));
  const [scipMeta, setScipMeta] = useState(null);
  const [scipLoading, setScipLoading] = useState(!!scipId);
  const [scipError, setScipError] = useState(null);
  const [activeIdx, setActiveIdx] = useState(() => {
    const ti = parseInt(params.get("ti"), 10);
    return Number.isFinite(ti) && ti >= 0 ? ti : 0;
  });
  const target = targets[activeIdx] || targets[0] || null;

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

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-amber-500/15 via-transparent to-transparent border border-amber-500/30 px-5 py-4 flex items-center gap-4">
        <Zap className="w-9 h-9 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono text-amber-700 tracking-[0.3em]">SCIP · POWER + FIBER · ONE VIEW · LIVE</div>
          <h1 className="font-heading font-bold text-2xl text-foreground leading-tight">Site Power Map</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {scipLoading ? "Loading SCIP target…" : (
              <>
                {target ? `${target.label} · ${target.address}` : "No target"}
                {scipMeta?.site_name ? ` · ${scipMeta.site_name}` : ""}
                {isDemo && <span className="ml-2 text-amber-600 font-mono text-xs">DEMO SITE</span>}
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

      <UnifiedGridMap target={target} height={660} />
    </div>
  );
}
