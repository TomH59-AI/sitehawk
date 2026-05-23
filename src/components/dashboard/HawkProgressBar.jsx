import { useEffect, useState } from "react";
import HawkIcon from "../HawkIcon";

/**
 * HawkProgressBar — A reusable progress bar where the SiteHawk hawk icon
 * "flies" across the track as progress advances. Visual cue that the user
 * is making real progress through the workflow.
 *
 * Props:
 *   value     (0-100) — current progress
 *   label     string — small label shown above the bar
 *   sublabel  string — optional muted detail under the label
 */
export default function HawkProgressBar({ value = 0, label, sublabel }) {
  const clamped = Math.max(0, Math.min(100, value));
  // Animate to value
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDisplay(clamped));
    return () => cancelAnimationFrame(t);
  }, [clamped]);

  return (
    <div className="w-full">
      {(label || sublabel) && (
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-baseline gap-2">
            {label && <span className="text-sm font-heading font-semibold text-foreground">{label}</span>}
            {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
          </div>
          <span className="text-xs font-mono font-semibold text-primary">{Math.round(clamped)}%</span>
        </div>
      )}
      {/* Track */}
      <div className="relative h-8 rounded-full bg-secondary border border-border overflow-hidden">
        {/* Filled gradient */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-primary to-accent transition-all duration-1000 ease-out"
          style={{ width: `${display}%` }}
        />
        {/* Sky shimmer */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse pointer-events-none" />
        {/* Flying hawk */}
        <div
          className="absolute top-1/2 -translate-y-1/2 transition-all duration-1000 ease-out"
          style={{ left: `calc(${display}% - 18px)` }}
        >
          <div className="relative">
            {/* Speed lines behind the hawk */}
            <div className="absolute right-full top-1/2 -translate-y-1/2 flex items-center gap-0.5 mr-1">
              <div className="w-3 h-px bg-white/80 animate-pulse" />
              <div className="w-2 h-px bg-white/60 animate-pulse" style={{ animationDelay: "100ms" }} />
              <div className="w-1.5 h-px bg-white/40 animate-pulse" style={{ animationDelay: "200ms" }} />
            </div>
            {/* Hawk — bobs up & down like real flight */}
            <div className="animate-bounce" style={{ animationDuration: "1.4s" }}>
              <HawkIcon className="w-9 h-9 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}