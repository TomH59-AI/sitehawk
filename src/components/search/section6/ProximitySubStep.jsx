/**
 * ProximitySubStep — one gated proximity/environment map panel inside the
 * HAWK PROXIMITY & ENVIRONMENT VISION suite (Section 6).
 *
 * Gating contract (mirrors Sections 1–5):
 *  - LOCKED until the previous sub-step completes (`unlocked` false).
 *  - Fires NOTHING until the user clicks its own "Run …" button.
 *  - While in flight: ONLY the hawk flying-in-place spinner.
 *  - On success: render the map full-bleed + optional banner/legend + Regenerate.
 *  - Never auto-advances — the parent unlocks the next sub-step on complete.
 */

import { Lock, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import HawkFlightSpinner from "../HawkFlightSpinner";
import ProximityInfoPanel from "./ProximityInfoPanel";
import { BRAND_GREEN } from "@/lib/section6Proximity";

export default function ProximitySubStep({
  index, title, runLabel, spinnerLabel, legend,
  unlocked, loading, done, error, info, onRun, mapRef, banner,
}) {
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">MAP {index} · LOCKED</div>
            <h3 className="font-heading font-bold text-base leading-tight">{title}</h3>
          </div>
        </div>
        <div className="px-4 py-4 text-sm text-muted-foreground">
          Complete the previous map to unlock {title}.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-white" style={{ background: BRAND_GREEN }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-heading font-bold text-sm bg-white/20 border border-white/40">
            {index}
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">TARGET A</div>
            <h3 className="font-heading font-bold text-base leading-tight">{title}</h3>
          </div>
        </div>
        {!done ? (
          <Button onClick={onRun} disabled={loading} className="bg-white hover:bg-white/90 font-semibold shadow" style={{ color: BRAND_GREEN }}>
            <Sparkles className="w-4 h-4 mr-2" /> {runLabel}
          </Button>
        ) : (
          <Button onClick={onRun} disabled={loading} variant="outline" className="bg-white/10 border-white/40 text-white hover:bg-white/20 font-semibold">
            <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
          </Button>
        )}
      </div>

      {loading && <HawkFlightSpinner label={spinnerLabel} />}

      {!loading && !done && !error && (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Click <span className="font-semibold text-foreground">{runLabel}</span> to render {title} for Target A.
        </div>
      )}

      {/* Error surface — no silent forever-spinner. */}
      {error && !loading && (
        <div className="px-4 py-4 bg-destructive/5 border-y border-destructive/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-destructive">{title} failed: {error}</div>
            <Button onClick={onRun} size="sm" variant="outline" className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      )}

      {/* Map canvas stays mounted once generated so the map persists. */}
      <div style={{ display: done && !loading ? "block" : "none" }}>
        {banner}
        <div className="relative w-full bg-[#0C1B2E]" style={{ height: 540 }}>
          <div ref={mapRef} className="absolute inset-0" />
          {info && (
            <div className="absolute top-3 left-3 z-10">
              <ProximityInfoPanel kicker={info.kicker} title={info.title} distMi={info.distMi} rows={info.rows} />
            </div>
          )}
          {legend && (
            <div className="absolute bottom-3 left-3 z-10 px-2.5 py-1.5 rounded-lg bg-black/55 backdrop-blur text-white text-[11px] font-mono leading-tight flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5" style={{ background: BRAND_GREEN }} />
              {legend}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}