/**
 * HawkInstructions — floating step-by-step coach marks for SCIP generation.
 *
 * Pure UI overlay. No business logic. It anchors to existing Section1Shell
 * step numbers via `[data-scip-step="<n>"]` selectors (injected by an
 * accompanying small DOM hook below). Clicking the tooltip advances to the
 * next step; an "x" dismisses the tour entirely (persisted in localStorage).
 *
 * Steps mirror the SCIP generation order:
 *   1  Site Acquisition  → "Enter coordinates + tower height here"
 *   2  SARF Map          → "Click GENERATE SARF MAP"
 *   3  Hawk Vision       → "Click GENERATE 3 TARGETS"
 *   4  Existing Cond.    → "Click GENERATE CONDITIONS"
 *   5  Site Notes        → "Add any extra notes"
 *   6  Zoning Overview   → "Generate zoning"
 *   7  Tower Specifics   → "Generate tower specs"
 *   8  Building Permits  → "Generate permits"
 *   9  Infrastructure Map→ "Generate power + fiber overlays"
 *   10 Viewsheds         → "Generate N/E/S/W viewsheds"
 */

import { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { X, ArrowRight, Sparkles } from "lucide-react";

const STORAGE_KEY = "scip_hawk_instructions_v1";

const STEPS = [
  { step: 1,  title: "Enter your waypoint",      body: "Type the Latitude, Longitude, Tower Height, and Search Radius in this block. Everything below pulls from these inputs." },
  { step: 2,  title: "Generate the SARF map",    body: "Click GENERATE SARF MAP (top-right) to draw the red search ring on satellite imagery." },
  { step: 3,  title: "Find 3 best parcels",      body: "Click GENERATE 3 TARGETS — Hawk Vision uses Realie + Notion zoning to rank the 3 best non-residential parcels." },
  { step: 4,  title: "Pull existing conditions", body: "Click GENERATE CONDITIONS to fetch FEMA flood, wetlands, elevation, and wind for Target One." },
  { step: 5,  title: "Add site notes",           body: "Optional — add anything the field tech should know (access, gates, hazards, contacts)." },
  { step: 6,  title: "Generate zoning overview", body: "Click GENERATE ZONING — pulls the local ordinance from Notion and parses tower-specific clauses." },
  { step: 7,  title: "Generate tower specifics", body: "Click GENERATE TOWER SPECIFICS — height limits, setbacks, fall zone, stealth requirements." },
  { step: 8,  title: "Generate building permits",body: "Click GENERATE PERMITS to extract permitting workflow, fees, and approval path." },
  { step: 9,  title: "Generate infrastructure",  body: "Click GENERATE INFRASTRUCTURE OVERLAYS — power (red) and fiber (orange) within 1 mile of Target A." },
  { step: 10, title: "Generate viewsheds",       body: "Click GENERATE on each N / E / S / W tile to capture conical tree-line viewsheds." },
];

function getAnchorRect(step) {
  const el = document.querySelector(`[data-scip-step="${step}"]`);
  if (!el) return null;
  return el.getBoundingClientRect();
}

export default function HawkInstructions() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [, setTick] = useState(0); // forces re-position on scroll/resize

  const current = STEPS[idx];

  const reposition = useCallback(() => {
    if (!current) return;
    setRect(getAnchorRect(current.step));
  }, [current]);

  // Recompute position on mount, idx change, scroll, resize, and a short polling
  // loop for the first ~3 seconds (anchors may render slightly after this mounts).
  useLayoutEffect(() => {
    reposition();
    const onScroll = () => setTick((t) => t + 1);
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    let count = 0;
    const poll = setInterval(() => {
      reposition();
      count += 1;
      if (count > 15) clearInterval(poll);
    }, 200);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      clearInterval(poll);
    };
  }, [reposition]);

  useEffect(() => {
    reposition();
  }, [idx, reposition]);

  function advance() {
    if (idx >= STEPS.length - 1) {
      dismiss();
      return;
    }
    const next = idx + 1;
    setIdx(next);
    // Scroll the next anchor into view, smoothly
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-scip-step="${STEPS[next].step}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch (e) { /* ignore */ }
  }

  if (dismissed) {
    return (
      <button
        onClick={() => { setDismissed(false); setIdx(0); try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ } }}
        className="fixed bottom-6 right-6 z-[60] inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-cyan-500 text-[#0C1B2E] font-bold text-xs tracking-wider shadow-lg hover:bg-cyan-400 transition-colors no-print"
      >
        <Sparkles className="w-3.5 h-3.5" /> HAWK GUIDE
      </button>
    );
  }

  // Compute tooltip position. If anchor isn't found yet, float bottom-right.
  let style;
  if (rect) {
    const top = Math.max(12, rect.top + window.scrollY);
    const left = Math.min(window.innerWidth - 340, rect.right + 16);
    // If there isn't room to the right (mobile), drop it under the anchor.
    const fitsRight = rect.right + 340 < window.innerWidth;
    style = fitsRight
      ? { position: "absolute", top, left, width: 320 }
      : { position: "absolute", top: rect.bottom + window.scrollY + 12, left: Math.max(12, rect.left + window.scrollX), width: 320 };
  } else {
    style = { position: "fixed", bottom: 24, right: 24, width: 320 };
  }

  return (
    <div className="no-print">
      {/* Highlight ring on the anchor */}
      {rect && (
        <div
          style={{
            position: "absolute",
            top: rect.top + window.scrollY - 6,
            left: rect.left + window.scrollX - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 16,
            border: "2px solid #22d3ee",
            boxShadow: "0 0 0 6px rgba(34, 211, 238, 0.18), 0 0 24px rgba(34, 211, 238, 0.45)",
            pointerEvents: "none",
            zIndex: 55,
            transition: "all 250ms ease",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        style={{ ...style, zIndex: 60 }}
        className="rounded-xl bg-[#0C1B2E] border-2 border-cyan-400/60 shadow-2xl text-white overflow-hidden animate-in fade-in slide-in-from-bottom-2"
      >
        <div className="px-3 py-2 bg-gradient-to-r from-cyan-500 to-cyan-400 flex items-center justify-between text-[#0C1B2E]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#0C1B2E] text-cyan-300 font-mono font-bold text-[10px] flex items-center justify-center">
              {idx + 1}/{STEPS.length}
            </div>
            <span className="font-mono font-bold text-[10px] tracking-[0.2em]">HAWK GUIDE</span>
          </div>
          <button
            onClick={dismiss}
            className="text-[#0C1B2E] hover:bg-black/10 rounded p-1"
            aria-label="Dismiss tour"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={advance}
          className="w-full text-left px-4 py-3.5 hover:bg-white/5 transition-colors group"
        >
          <div className="font-heading font-bold text-sm mb-1 text-cyan-300">
            Step {current.step}: {current.title}
          </div>
          <div className="text-xs text-slate-200 leading-relaxed">
            {current.body}
          </div>
          <div className="mt-2.5 inline-flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-[0.15em] text-cyan-300 group-hover:text-cyan-200">
            {idx >= STEPS.length - 1 ? "FINISH" : "GOT IT — NEXT STEP"}
            <ArrowRight className="w-3 h-3" />
          </div>
        </button>
      </div>
    </div>
  );
}