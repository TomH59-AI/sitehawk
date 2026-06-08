/**
 * SARFCoachTour — sequential onboarding coachmarks for the SARF → SCIP flow.
 *
 * Two-page tour (Plan B):
 *   Steps 1–3 on /search   (form fields, scan button, SARF map)
 *   Steps 4–5 on /scip     (params form, print button) — gated on first arrival
 *                          with location.state.candidate present.
 *
 * Behavior:
 *   • Dark callout (#1a2436, accent #3b82f6, text #e8edf5) with HawkIcon.
 *   • SVG spotlight overlay dims the page and cuts a hole around target.
 *   • Next advances; last step ends.
 *   • Anchors discovered by data-coach="..." attribute; tour waits for the
 *     target element to mount (polls rAF) so steps never fire against a
 *     half-rendered page.
 *   • localStorage flag "sarf_coach_tour_completed_v1" → only auto-runs once.
 *   • Imperative start via window.__sarfCoachStart() for the header restart icon.
 */

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import HawkIcon from "../HawkIcon";

const LS_DONE = "sarf_coach_tour_completed_v1";
const LS_SEARCH_DONE = "sarf_coach_search_done_v1"; // marks /search portion finished

// Step definitions — split by route. `anchor` is a data-coach attribute on the target.
const SEARCH_STEPS = [
  {
    id: "name",
    anchor: "sarf-name",
    title: "1 · Add your name",
    body: "Start here — drop your name so this SARF is tagged to you, the hawk on the hunt.",
  },
  {
    id: "ring",
    anchor: "sarf-ring",
    title: "2 · Name your search ring",
    body: "Give this ring a name you'll recognize later — like \"Site A — Tampa I-75\".",
  },
  {
    id: "radius",
    anchor: "sarf-radius",
    title: "3 · Set your search radius",
    body: "Pick how wide the hawk's eye sweeps — your search radius around the SARF center.",
  },
  {
    id: "compound",
    anchor: "sarf-compound",
    title: "4 · Add the compound dimensions",
    body: "Enter your compound size (e.g. 100x100) so we size the buildable footprint right.",
  },
  {
    id: "coords",
    anchor: "sarf-coords",
    title: "5 · Drop your coordinates",
    body: "Add the latitude and longitude — this is the exact center the hawk locks onto.",
  },
  {
    id: "scan",
    anchor: "sarf-scan",
    title: "6 · Start your scan",
    body: "Everything's loaded — hit Scan and let SiteHawk hunt your buildable parcels.",
  },
];

const SCIP_STEPS = [
  {
    id: "params",
    anchor: "scip-params",
    title: "4 · Your Target A",
    body: "Here's your Target A — auto-selected from the scan. Confirm the site parameters, then click Scan to load Targets A/B/C.",
  },
  {
    id: "print",
    anchor: "scip-print",
    title: "5 · Generate your SCIP",
    body: "When the package is ready, print or export your HawkVision SCIP report from here.",
  },
];

// Wait until a [data-coach="..."] element is in the DOM and has a non-zero bounding rect.
function waitForAnchor(anchor, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const el = document.querySelector(`[data-coach="${anchor}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return resolve(el);
      }
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export default function SARFCoachTour() {
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [steps, setSteps] = useState([]);
  const activeRef = useRef(false);

  // Determine which step set applies to the current page
  const onSearch = location.pathname === "/search";
  const onScip = location.pathname === "/scip";

  // Public start handler — wired to window for the header restart icon
  const startTour = useCallback(() => {
    try { localStorage.removeItem(LS_DONE); localStorage.removeItem(LS_SEARCH_DONE); } catch {}
    if (onSearch) {
      setSteps(SEARCH_STEPS);
      setStepIdx(0);
      setActive(true);
      activeRef.current = true;
    } else if (onScip) {
      setSteps(SCIP_STEPS);
      setStepIdx(0);
      setActive(true);
      activeRef.current = true;
    }
  }, [onSearch, onScip]);

  useEffect(() => {
    window.__sarfCoachStart = startTour;
    return () => { delete window.__sarfCoachStart; };
  }, [startTour]);

  // Auto-fire logic
  useEffect(() => {
    let done = false;
    try { done = localStorage.getItem(LS_DONE) === "1"; } catch {}
    if (done) return;

    if (onSearch) {
      let searchDone = false;
      try { searchDone = localStorage.getItem(LS_SEARCH_DONE) === "1"; } catch {}
      if (!searchDone) {
        setSteps(SEARCH_STEPS);
        setStepIdx(0);
        setActive(true);
        activeRef.current = true;
      }
    } else if (onScip) {
      // Only fire the /scip portion on first arrival WITH candidate state
      const hasCandidate = !!location.state?.candidate;
      let searchDone = false;
      try { searchDone = localStorage.getItem(LS_SEARCH_DONE) === "1"; } catch {}
      if (hasCandidate && searchDone) {
        setSteps(SCIP_STEPS);
        setStepIdx(0);
        setActive(true);
        activeRef.current = true;
      }
    }
  }, [location.pathname, location.state, onSearch, onScip]);

  // When step changes, wait for the anchor to mount, then measure its rect
  useLayoutEffect(() => {
    if (!active || !steps.length) return;
    let cancelled = false;
    const step = steps[stepIdx];
    if (!step) return;

    (async () => {
      const el = await waitForAnchor(step.anchor);
      if (cancelled || !activeRef.current) return;
      if (!el) {
        // Anchor never appeared — skip this step rather than block forever
        advance();
        return;
      }
      // Scroll target into view if it's offscreen
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      // Re-measure after scroll settles
      setTimeout(() => {
        if (cancelled || !activeRef.current) return;
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }, 350);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx, steps]);

  // Re-measure on resize/scroll while a step is active
  useEffect(() => {
    if (!active || !steps.length) return;
    const step = steps[stepIdx];
    if (!step) return;
    const update = () => {
      const el = document.querySelector(`[data-coach="${step.anchor}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, stepIdx, steps]);

  const finish = useCallback(() => {
    setActive(false);
    activeRef.current = false;
    setRect(null);
    // Mark the segment finished
    try {
      if (steps === SEARCH_STEPS) localStorage.setItem(LS_SEARCH_DONE, "1");
      else localStorage.setItem(LS_DONE, "1");
    } catch {}
  }, [steps]);

  const advance = useCallback(() => {
    if (stepIdx + 1 >= steps.length) {
      finish();
    } else {
      setStepIdx((i) => i + 1);
    }
  }, [stepIdx, steps.length, finish]);

  if (!active || !steps.length || !rect) return null;

  const step = steps[stepIdx];
  const pad = 8;
  const holeTop = rect.top - pad;
  const holeLeft = rect.left - pad;
  const holeW = rect.width + pad * 2;
  const holeH = rect.height + pad * 2;

  // Position the callout: prefer below the target, flip above if no room
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const calloutW = Math.min(360, vw - 32);
  const spaceBelow = vh - (rect.top + rect.height);
  const placeBelow = spaceBelow > 220;
  const calloutTop = placeBelow ? rect.top + rect.height + 16 : Math.max(16, rect.top - 16 - 200);
  let calloutLeft = rect.left + rect.width / 2 - calloutW / 2;
  calloutLeft = Math.max(16, Math.min(calloutLeft, vw - calloutW - 16));

  // Arrow position relative to callout
  const arrowLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - calloutLeft - 8, calloutW - 32));

  return (
    <div className="fixed inset-0 z-[200] no-print" aria-live="polite">
      {/* SVG spotlight overlay — dims everything except the hole */}
      <svg width="100%" height="100%" className="absolute inset-0 pointer-events-auto">
        <defs>
          <mask id="sarf-coach-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={holeLeft}
              y={holeTop}
              width={holeW}
              height={holeH}
              rx="10"
              ry="10"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(8, 14, 25, 0.72)"
          mask="url(#sarf-coach-mask)"
          onClick={finish}
        />
        {/* Accent ring around the spotlight */}
        <rect
          x={holeLeft}
          y={holeTop}
          width={holeW}
          height={holeH}
          rx="10"
          ry="10"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          pointerEvents="none"
        />
      </svg>

      {/* Callout */}
      <div
        className="absolute rounded-xl shadow-2xl border"
        style={{
          top: calloutTop,
          left: calloutLeft,
          width: calloutW,
          background: "#1a2436",
          borderColor: "#3b82f6",
          color: "#e8edf5",
        }}
      >
        {/* Arrow */}
        {placeBelow && (
          <div
            className="absolute -top-2 w-4 h-4 rotate-45"
            style={{ left: arrowLeft, background: "#1a2436", borderTop: "1px solid #3b82f6", borderLeft: "1px solid #3b82f6" }}
          />
        )}
        {!placeBelow && (
          <div
            className="absolute -bottom-2 w-4 h-4 rotate-45"
            style={{ left: arrowLeft, background: "#1a2436", borderBottom: "1px solid #3b82f6", borderRight: "1px solid #3b82f6" }}
          />
        )}

        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              <HawkIcon size={36} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="font-heading font-bold text-sm" style={{ color: "#e8edf5" }}>
                  {step.title}
                </div>
                <button
                  onClick={finish}
                  className="p-1 rounded hover:bg-white/10 transition-colors"
                  aria-label="Dismiss tour"
                >
                  <X className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
                </button>
              </div>
              <p className="text-xs leading-relaxed mt-1.5" style={{ color: "#cbd5e1" }}>
                {step.body}
              </p>
              <div className="flex items-center justify-between mt-3">
                <div className="text-[10px] font-mono tracking-wider" style={{ color: "#64748b" }}>
                  {stepIdx + 1} / {steps.length}
                </div>
                <button
                  onClick={advance}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all"
                  style={{ background: "#3b82f6", color: "#ffffff" }}
                >
                  {stepIdx + 1 >= steps.length ? "Done" : "Next"}
                  {stepIdx + 1 < steps.length && <ArrowRight className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}