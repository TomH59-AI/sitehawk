/**
 * ViewshedSubStep — one gated cardinal-direction viewshed panel inside the
 * HAWK RF VIEWSHED VISION suite (Section 5). One direction (N/S/E/W).
 *
 * Gating contract (mirrors Sections 1–4):
 *  - LOCKED until the previous direction completes (`unlocked` false).
 *  - Fires NOTHING until the user clicks its own "Run … Viewshed" button.
 *  - While in flight: ONLY the hawk flying-in-place spinner.
 *  - On success: render the 2D viewshed full-bleed + stats panel + Regenerate.
 *  - Never auto-advances — the parent unlocks the next direction on complete.
 */

import { Lock, Sparkles, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import HawkFlightSpinner from "../HawkFlightSpinner";

export default function ViewshedSubStep({
  dir, runLabel, unlocked, loading, done, engine, stats,
  rangeMiles, towerHeightFt, beamAngle, onBeamAngleChange, onRun, mapRef,
}) {
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">VIEWSHED {dir.short} · LOCKED</div>
            <h3 className="font-heading font-bold text-base leading-tight">{dir.label}</h3>
          </div>
        </div>
        <div className="px-4 py-4 text-sm text-muted-foreground">
          Complete the previous viewshed to unlock the {dir.label}.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-white"
        style={{ background: `linear-gradient(90deg, ${dir.color}, ${dir.color}cc)` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-heading font-bold text-sm bg-white/20 border border-white/40"
          >
            {dir.short}
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">TARGET A · BEARING {dir.bearing}° ± {dir.spread}°</div>
            <h3 className="font-heading font-bold text-base leading-tight">{dir.label}</h3>
          </div>
        </div>
        {!done ? (
          <Button onClick={onRun} disabled={loading} className="bg-white hover:bg-white/90 font-semibold shadow" style={{ color: dir.color }}>
            <Sparkles className="w-4 h-4 mr-2" /> {runLabel}
          </Button>
        ) : (
          <Button onClick={onRun} disabled={loading} variant="outline" className="bg-white/10 border-white/40 text-white hover:bg-white/20 font-semibold">
            <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
          </Button>
        )}
      </div>

      {/* Beam-angle override — engineer can tweak before running / re-running. */}
      <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2 text-xs">
        <span className="font-medium text-foreground">Beam angle:</span>
        {[60, 90, 120].map((a) => (
          <button
            key={a}
            onClick={() => onBeamAngleChange?.(a)}
            disabled={loading}
            className={`px-2.5 py-1 rounded-md font-mono border transition-colors ${
              beamAngle === a
                ? "text-white border-transparent"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
            style={beamAngle === a ? { background: dir.color } : undefined}
          >
            {a}°
          </button>
        ))}
        <span className="text-muted-foreground ml-auto font-mono">
          Range {rangeMiles} mi · Tower {towerHeightFt} ft AGL
        </span>
      </div>

      {loading && <HawkFlightSpinner label={`Generating ${dir.label} for Target A…`} />}

      {!loading && !done && (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Click <span className="font-semibold text-foreground">{runLabel}</span> to render the {dir.label} for Target A.
        </div>
      )}

      {/* Map canvas + stats stay mounted once generated so the map persists. */}
      <div style={{ display: done && !loading ? "block" : "none" }}>
        <div className="relative w-full bg-[#0C1B2E]" style={{ height: 540 }}>
          <div ref={mapRef} className="absolute inset-0" />
          {/* compass rose + range label overlay */}
          <div className="absolute top-3 left-3 z-10 px-2.5 py-1.5 rounded-lg bg-black/55 backdrop-blur text-white text-[11px] font-mono leading-tight">
            <div className="font-bold" style={{ color: dir.color }}>{dir.short} · {dir.bearing}°</div>
            <div className="opacity-80">2D plan-view · {rangeMiles} mi</div>
          </div>
          {engine && (
            <div className="absolute bottom-3 right-3 z-10 px-2 py-1 rounded bg-black/55 backdrop-blur text-white/90 text-[10px] font-mono uppercase tracking-widest">
              {engine === "cesium" ? "Cesium Ion" : "Mapbox fallback"}
            </div>
          )}
        </div>

        {/* Stats panel */}
        <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-5 gap-3 border-t border-border bg-muted/20 text-sm">
          <Stat label="Bearing / Width" value={`${dir.bearing}° · ${dir.spread * 2}°`} />
          <Stat label="Range" value={`${rangeMiles} mi`} />
          <Stat label="Tower Height" value={`${towerHeightFt} ft AGL`} />
          <Stat
            label="% Tree-line Blocked"
            value={stats?.pctObstructed != null ? `${stats.pctObstructed}%` : "—"}
            tone={stats?.pctObstructed > 50 ? "bad" : "good"}
          />
          <Stat
            label="% Clear LOS"
            value={stats?.pctClear != null ? `${stats.pctClear}%` : "—"}
            tone={stats?.pctClear >= 50 ? "good" : "bad"}
          />
        </div>

        <div className="px-4 pb-3 -mt-1 text-xs font-mono flex items-center gap-1.5">
          {stats?.clear ? (
            <><CheckCircle2 className="w-4 h-4 text-green-600" /> <span className="text-green-700">Clear line-of-sight for the full corridor</span></>
          ) : (
            <><XCircle className="w-4 h-4 text-red-600" /> <span className="text-red-700">First tree-line obstruction @ {stats?.firstObstructionMi ?? "—"} mi</span></>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === "bad" ? "text-red-600" : tone === "good" ? "text-green-700" : "text-foreground";
  return (
    <div>
      <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">{label}</div>
      <div className={`font-heading font-bold ${color}`}>{value}</div>
    </div>
  );
}