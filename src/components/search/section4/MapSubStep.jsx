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
import { Lock, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import HawkFlightSpinner from "../HawkFlightSpinner";

const BRAND_GREEN = "#628C83";

export default function MapSubStep({
  index, title, runLabel, spinnerLabel, banner,
  unlocked, loading, done, onRun, mapRef, children,
}) {
  const localRef = useRef(null);
  const ref = mapRef || localRef;

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

      {loading && <HawkFlightSpinner label={spinnerLabel} />}

      {!loading && !done && (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Click <span className="font-semibold text-foreground">{runLabel}</span> to generate this Target A map.
        </div>
      )}

      {/* Map canvas + optional banner stay mounted once generated so the map persists. */}
      <div style={{ display: done && !loading ? "block" : "none" }}>
        {banner}
        <div className="relative w-full bg-card" style={{ height: 560 }}>
          <div ref={ref} className="absolute inset-0" />
        </div>
        {children}
      </div>
    </div>
  );
}