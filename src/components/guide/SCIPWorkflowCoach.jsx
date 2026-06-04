import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  FileText,
  Layers,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";

const LS_OPEN = "scip_coach_open_v2";
const LS_DONE = "scip_coach_completed_v2";
const LS_HIDDEN = "scip_coach_hidden_v2";

const STAGES = [
  {
    id: "search",
    title: "Scan parcels",
    blurb: "Enter coordinates, tower height, and search radius. Run the parcel scan.",
    icon: Search,
    path: "/search",
    match: ["/search"],
  },
  {
    id: "results",
    title: "Review candidates",
    blurb: "Inspect ranked parcels on the map and pick the strongest target.",
    icon: Layers,
    path: "/results",
    match: ["/results"],
  },
  {
    id: "scip",
    title: "Generate SCIP report",
    blurb: "Step through Site Acquisition, SARF, Zoning, Infrastructure, and Document Intelligence.",
    icon: FileText,
    path: "/scip",
    match: ["/scip"],
  },
  {
    id: "send",
    title: "Send / share / mail",
    blurb: "Print the PDF, share a link, or push to direct mail.",
    icon: Send,
    path: "/mail-orders",
    match: ["/mail-orders", "/send-update"],
  },
];

function loadDone() {
  try {
    const raw = localStorage.getItem(LS_DONE);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDone(set) {
  try {
    localStorage.setItem(LS_DONE, JSON.stringify([...set]));
  } catch {
    // ignore localStorage failures
  }
}

export default function SCIPWorkflowCoach() {
  const location = useLocation();
  const navigate = useNavigate();

  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(LS_HIDDEN) === "1";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(LS_OPEN) !== "0";
    } catch {
      return true;
    }
  });
  const [done, setDone] = useState(loadDone);

  const activeIdx = useMemo(() => {
    const pathname = location.pathname;
    return STAGES.findIndex((stage) => stage.match.some((match) => pathname.startsWith(match)));
  }, [location.pathname]);

  useEffect(() => {
    if (activeIdx <= 0) return;
    setDone((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (let index = 0; index < activeIdx; index += 1) {
        if (!next.has(STAGES[index].id)) {
          next.add(STAGES[index].id);
          changed = true;
        }
      }
      if (changed) saveDone(next);
      return changed ? next : prev;
    });
  }, [activeIdx]);

  const persistOpen = (value) => {
    setOpen(value);
    try {
      localStorage.setItem(LS_OPEN, value ? "1" : "0");
    } catch {
      // ignore localStorage failures
    }
  };

  const hidePanel = () => {
    setHidden(true);
    try {
      localStorage.setItem(LS_HIDDEN, "1");
    } catch {
      // ignore localStorage failures
    }
  };

  const showPanel = () => {
    setHidden(false);
    try {
      localStorage.removeItem(LS_HIDDEN);
    } catch {
      // ignore localStorage failures
    }
  };

  const resetProgress = () => {
    const empty = new Set();
    setDone(empty);
    saveDone(empty);
  };

  const toggleStage = (id) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveDone(next);
      return next;
    });
  };

  if (location.pathname === "/" || location.pathname.startsWith("/scip-share")) return null;

  if (hidden) {
    return (
      <button
        onClick={showPanel}
        className="fixed bottom-24 right-6 z-[55] inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-cyan-500 text-[#0C1B2E] font-bold text-xs tracking-wider shadow-lg hover:bg-cyan-400 transition-colors no-print"
        title="Open SCIP workflow guide"
      >
        <Sparkles className="w-3.5 h-3.5" /> SCIP GUIDE
      </button>
    );
  }

  const completedCount = STAGES.filter((stage) => done.has(stage.id)).length;
  const pct = Math.round((completedCount / STAGES.length) * 100);

  return (
    <div
      className="fixed bottom-6 right-6 z-[55] w-[320px] rounded-xl bg-[#0C1B2E] border-2 border-cyan-400/60 shadow-2xl text-white overflow-hidden no-print"
      style={{ maxHeight: open ? "calc(100vh - 48px)" : undefined }}
    >
      <div className="px-3 py-2 bg-gradient-to-r from-cyan-500 to-cyan-400 flex items-center justify-between text-[#0C1B2E]">
        <button onClick={() => persistOpen(!open)} className="flex items-center gap-2 flex-1 text-left">
          <Sparkles className="w-4 h-4" />
          <span className="font-mono font-bold text-[10px] tracking-[0.2em]">SCIP WORKFLOW GUIDE</span>
          <span className="ml-auto font-mono font-bold text-[10px]">{completedCount}/{STAGES.length}</span>
        </button>
        <button
          onClick={() => persistOpen(!open)}
          className="text-[#0C1B2E] hover:bg-black/10 rounded p-1 ml-1"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
        <button onClick={hidePanel} className="text-[#0C1B2E] hover:bg-black/10 rounded p-1" aria-label="Hide">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-1 bg-cyan-900/40">
        <div className="h-full bg-cyan-300 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {open && (
        <>
          <div className="px-3 py-2 border-b border-cyan-400/20 text-[10px] text-slate-300 leading-relaxed">
            Follow the real workflow from raw coordinates to a finished SCIP report. Tap a step to jump there.
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
            {STAGES.map((stage, index) => {
              const isDone = done.has(stage.id);
              const isActive = index === activeIdx;
              const Icon = stage.icon;
              return (
                <div
                  key={stage.id}
                  className={`flex items-start gap-2 px-3 py-2.5 border-b border-cyan-400/10 transition-colors ${
                    isActive ? "bg-cyan-400/10" : "hover:bg-white/5"
                  }`}
                >
                  <button
                    onClick={() => toggleStage(stage.id)}
                    className="mt-0.5 shrink-0"
                    title={isDone ? "Mark incomplete" : "Mark complete"}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Circle className={`w-4 h-4 ${isActive ? "text-cyan-300" : "text-slate-500"}`} />
                    )}
                  </button>
                  <button onClick={() => navigate(stage.path)} className="flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-3 h-3 ${isActive ? "text-cyan-300" : "text-slate-400"}`} />
                      <span className={`font-heading font-bold text-xs ${isDone ? "text-slate-400 line-through" : isActive ? "text-cyan-300" : "text-white"}`}>
                        {index + 1}. {stage.title}
                      </span>
                      {isActive && (
                        <span className="ml-auto font-mono font-bold text-[9px] tracking-[0.2em] text-cyan-300 bg-cyan-400/20 px-1.5 py-0.5 rounded">
                          HERE
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-300 leading-relaxed mt-0.5">
                      {stage.blurb}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="px-3 py-2 border-t border-cyan-400/20 flex items-center justify-between">
            <button
              onClick={resetProgress}
              className="text-[10px] font-mono text-slate-400 hover:text-cyan-300 tracking-wider"
            >
              RESET PROGRESS
            </button>
            <button
              onClick={() => {
                const nextIdx = STAGES.findIndex((stage) => !done.has(stage.id));
                navigate(STAGES[nextIdx >= 0 ? nextIdx : 0].path);
              }}
              className="inline-flex items-center gap-1 text-[10px] font-mono font-bold tracking-[0.15em] text-[#0C1B2E] bg-cyan-300 hover:bg-cyan-200 px-2 py-1 rounded transition-colors"
            >
              GO TO NEXT STEP
            </button>
          </div>
        </>
      )}
    </div>
  );
}
