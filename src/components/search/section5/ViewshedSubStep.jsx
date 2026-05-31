/**
 * ViewshedSubStep — one gated cardinal-direction viewshed panel inside the
 * HAWK RF VIEWSHED VISION suite (Section 5). One direction (N/S/E/W).
 *
 * Gating contract (mirrors Sections 1–4):
 *  - LOCKED until the previous direction completes (`unlocked` false).
 *  - Fires NOTHING until the user clicks its own "Run … Viewshed" button.
 *  - While in flight: ONLY the hawk flying-in-place spinner.
 *  - On success: render the 2D viewshed full-bleed + overlays + Regenerate.
 *  - On error: surface the message + a Retry button (no silent spinner).
 *  - Never auto-advances — the parent unlocks the next direction on complete.
 */

import { useState } from "react";
import { Lock, Sparkles, RefreshCw, AlertTriangle, SlidersHorizontal, AreaChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import HawkFlightSpinner from "../HawkFlightSpinner";
import ViewshedStatsPanel from "./ViewshedStatsPanel";
import ViewshedCompassRose from "./ViewshedCompassRose";
import ViewshedElevationStrip from "./ViewshedElevationStrip";

export default function ViewshedSubStep({
  dir, runLabel, unlocked, loading, done, engine, stats, profile, error,
  rangeMiles, towerHeightFt, beamAngle, onBeamAngleChange, onRun, onRecompute,
  mapRef, timestamp, combinedInset,
}) {
  const [showProfile, setShowProfile] = useState(true);

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
      {/* Panel chrome — brand green per spec (cone color shown via the rose/badge). */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-white" style={{ background: "#628C83" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-heading font-bold text-sm border border-white/40" style={{ background: dir.color, color: "#0C1B2E" }}>
            {dir.short}
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">TARGET A · BEARING {dir.bearing}° ± {dir.spread}°</div>
            <h3 className="font-heading font-bold text-base leading-tight">{dir.label}</h3>
          </div>
        </div>
        {!done ? (
          <Button onClick={onRun} disabled={loading} className="bg-white hover:bg-emerald-50 font-semibold shadow" style={{ color: "#628C83" }}>
            <Sparkles className="w-4 h-4 mr-2" /> {runLabel}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button onClick={onRecompute} disabled={loading} variant="outline" className="bg-white/10 border-white/40 text-white hover:bg-white/20 font-semibold">
              <SlidersHorizontal className="w-4 h-4 mr-2" /> Recompute
            </Button>
            <Button onClick={onRun} disabled={loading} variant="outline" className="bg-white/10 border-white/40 text-white hover:bg-white/20 font-semibold">
              <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
            </Button>
          </div>
        )}
      </div>

      {/* Beam-angle override. */}
      <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2 text-xs flex-wrap">
        <span className="font-medium text-foreground">Beam angle:</span>
        {[60, 90, 120].map((a) => (
          <button
            key={a}
            onClick={() => onBeamAngleChange?.(a)}
            disabled={loading}
            className={`px-2.5 py-1 rounded-md font-mono border transition-colors ${
              beamAngle === a ? "text-white border-transparent" : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
            style={beamAngle === a ? { background: dir.color } : undefined}
          >
            {a}°
          </button>
        ))}
        {done && (
          <button
            onClick={() => setShowProfile((v) => !v)}
            className="ml-2 px-2.5 py-1 rounded-md font-mono border border-border bg-card text-muted-foreground hover:bg-muted flex items-center gap-1"
          >
            <AreaChart className="w-3.5 h-3.5" /> {showProfile ? "Hide" : "Show"} profile
          </button>
        )}
        <span className="text-muted-foreground ml-auto font-mono">Range {rangeMiles} mi · Tower {towerHeightFt} ft AGL</span>
      </div>

      {loading && <HawkFlightSpinner label={`Generating ${dir.label} for Target A…`} />}

      {!loading && !done && !error && (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Click <span className="font-semibold text-foreground">{runLabel}</span> to render the {dir.label} for Target A.
        </div>
      )}

      {/* Error surface — no silent forever-spinner. */}
      {error && !loading && (
        <div className="px-4 py-4 bg-destructive/5 border-y border-destructive/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-destructive">{dir.label} failed: {error}</div>
            <Button onClick={onRun} size="sm" variant="outline" className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      )}

      {/* Map + overlays stay mounted once generated so the map persists. */}
      <div style={{ display: done && !loading ? "block" : "none" }}>
        <div className="relative w-full bg-[#0C1B2E]" style={{ height: 540 }}>
          <div ref={mapRef} className="absolute inset-0" />

          {/* Compass rose — top-right, active arrow glows the cone color. */}
          <div className="absolute top-3 right-3 z-10">
            <ViewshedCompassRose activeDir={dir.short} color={dir.color} size={40} />
          </div>

          {/* Glass stats panel — right side under the rose. */}
          <div className="absolute top-16 right-3 z-10">
            <ViewshedStatsPanel dir={dir} stats={stats} rangeMiles={rangeMiles} towerHeightFt={towerHeightFt} beamWidth={beamAngle || dir.spread * 2} timestamp={timestamp} />
          </div>

          {/* Combined-view inset — bottom-left, all generated cones. */}
          {combinedInset && (
            <div className="absolute bottom-3 left-3 z-10 rounded-lg overflow-hidden border border-white/20 shadow-lg">
              <img src={combinedInset} alt="All directions overlaid" width={120} height={120} className="block" />
              <div className="absolute bottom-0 inset-x-0 text-center text-[8px] font-mono text-white/80 bg-black/50 py-0.5">ALL DIRECTIONS</div>
            </div>
          )}

          {engine && (
            <div className="absolute bottom-3 right-3 z-10 px-2 py-1 rounded bg-black/55 backdrop-blur text-white/90 text-[10px] font-mono uppercase tracking-widest">
              {engine === "cesium" ? "Cesium terrain" : "MapBox terrain-rgb"}
            </div>
          )}
        </div>

        {/* Elevation profile strip (toggle). */}
        {showProfile && <ViewshedElevationStrip profile={profile} towerHeightFt={towerHeightFt} color={dir.color} />}
      </div>
    </div>
  );
}