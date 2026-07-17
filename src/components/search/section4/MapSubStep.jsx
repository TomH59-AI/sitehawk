/**
 * MapSubStep — one gated map panel inside the Hawk Target A Map Suite.
 *
 * Gating contract (mirrors the section-level pipeline rules):
 *  - LOCKED until the previous sub-step is complete (`unlocked` false).
 *  - Fires NOTHING until the user clicks its own "Run …" button.
 *  - While in flight: ONLY the hawk flying-in-place spinner.
 *  - On success: render the map full-bleed, show "Regenerate".
 *  - Never auto-advances — the parent unlocks the next sub-step on complete.
 */

import { useRef } from "react";
import { Lock, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import HawkFlightSpinner from "../HawkFlightSpinner";

const BRAND_GREEN = "#628C83";

export default function MapSubStep({
  index, title, runLabel, spinnerLabel, banner, tourKey,
  unlocked, loading, done, onRun, mapRef, children, error, fillContent, overlay,
}) {
  const localRef = useRef(null);
  const ref = mapRef || localRef;
  // The map canvas must be VISIBLE & SIZED while it initializes — Mapbox cannot
  // measure a display:none container (root cause of the blank/never-render bug).
  // Show the canvas whenever the step is in flight OR done, hide only when idle.
  const canvasVisible = loading || done;

  if (!unlocked) {
    return (
      <div data-tour={tourKey} className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 select-none">
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
    <div data-tour={tourKey} className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-white" style={{ background: BRAND_GREEN }}>
        <div className="flex items-center gap-2">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">MAP {index} · TARGET A</div>
            <h3 className="font-heading font-bold text-base leading-tight">{title}</h3>
          </div>
        </div>
        {!done ? (
          <Button onClick={onRun} disabled={loading} className="bg-white hover:bg-emerald-50 font-semibold shadow" style={{ color: BRAND_GREEN }}>
            <Sparkles className="w-4 h-4 mr-2" /> {runLabel}
          </Button>
        ) : (
          <Button onClick={onRun} disabled={loading} variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20 font-semibold">
            <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
          </Button>
        )}
      </div>

      {/* Spinner overlays the map area while in flight (canvas stays mounted/sized below). */}
      {loading && <HawkFlightSpinner label={spinnerLabel} />}

      {!loading && !done && !error && (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Click <span className="font-semibold text-foreground">{runLabel}</span> to generate this Target A map.
        </div>
      )}

      {/* Error surface — no more silent spinner-forever. */}
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

      {/* Map canvas stays mounted & SIZED whenever loading or done so Mapbox can
          measure it. display:none during init = blank map, so we gate on
          canvasVisible (loading || done), never on `done` alone. */}
      <div style={{ display: canvasVisible ? "block" : "none" }}>
        {done && !loading && banner}
        <div className="relative w-full bg-card" style={{ minHeight: 500, height: 560, width: "100%" }}>
          <div ref={ref} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />
          {/* Full-bleed map overlay (e.g. Customize buildability probe) — needs
              the relative map container so its absolute positioning works. */}
          {done && !loading && overlay}
          {/* Static-image sub-steps (e.g. 2D Viewshed) render their tiles here,
              filling the same canvas area instead of a live Mapbox instance. */}
          {done && !loading && fillContent}
          {/* Legend / overlay menu — absolutely positioned in the top-left on
              desktop/tablet (below map controls), hidden here on mobile. */}
          {done && !loading && children && (
            <div className="hidden sm:block absolute top-16 left-4 z-[500]">
              {children}
            </div>
          )}
        </div>
        {/* Mobile: render the same legend statically BELOW the map so it never
            floats over working map content. */}
        {done && !loading && children && (
          <div className="sm:hidden px-3 pb-3 pt-2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}