import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Search,
  Eye,
  FileText,
  Send,
  Handshake,
  Lock,
} from "lucide-react";
import HawkProgressBar from "./HawkProgressBar";

/**
 * ProspectingWorkflow — Tower prospecting checklist that shows users
 * exactly what to do next AFTER they've identified a parcel.
 *
 * Computes step completion from the user's actual data:
 *   searches[], results[], deals[]
 *
 * The hawk flies across the progress bar as steps complete.
 */
const STEPS = [
  {
    key: "scan",
    icon: Search,
    title: "Run a Site Scan",
    desc: "Pick coordinates, define your search ring, and pull every parcel inside it.",
    to: "/search",
    cta: "Start Scan",
  },
  {
    key: "identify",
    icon: Eye,
    title: "Identify Top 3 Parcels",
    desc: "Review match-scored candidates and lock your Targets A / B / C.",
    to: "/results",
    cta: "Pick Targets",
  },
  {
    key: "scip",
    icon: FileText,
    title: "Build the SCIP",
    desc: "Generate the full Site Candidate Information Package — zoning, infra, RF, maps.",
    to: "/results",
    cta: "Build SCIP",
  },
  {
    key: "outreach",
    icon: Send,
    title: "Mail the Landowner",
    desc: "Push targets to CRM and fire off a Lob direct-mail letter to each owner.",
    to: "/crm",
    cta: "Open CRM",
  },
  {
    key: "close",
    icon: Handshake,
    title: "Close the Deal",
    desc: "Move targets to Signed in your pipeline once leases come back executed.",
    to: "/crm",
    cta: "Pipeline",
  },
];

function computeStepStates({ searches = [], results = [], deals = [] }) {
  const hasSearch = searches.length > 0;
  const hasIdentified = results.length >= 3;
  const hasScip = deals.some((d) => d.notes && /scip/i.test(d.notes)) || deals.length > 0;
  const hasOutreach = deals.some((d) => ["contacted", "interested", "negotiating", "signed"].includes(d.stage));
  const hasClosed = deals.some((d) => d.stage === "signed");

  return {
    scan: hasSearch,
    identify: hasIdentified,
    scip: hasScip,
    outreach: hasOutreach,
    close: hasClosed,
  };
}

export default function ProspectingWorkflow({ searches = [], results = [], deals = [] }) {
  const states = useMemo(
    () => computeStepStates({ searches, results, deals }),
    [searches, results, deals]
  );

  const completedCount = STEPS.filter((s) => states[s.key]).length;
  const pct = (completedCount / STEPS.length) * 100;

  // Find next actionable step (first incomplete)
  const nextIdx = STEPS.findIndex((s) => !states[s.key]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header + hawk progress bar */}
      <div className="p-5 border-b border-border bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h2 className="font-heading font-semibold text-base text-foreground">
              Tower Prospecting Workflow
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount === STEPS.length
                ? "🦅 Lock-on. You ran the full chain — go close the deal."
                : `Step ${nextIdx + 1} of ${STEPS.length} — ${STEPS[nextIdx]?.title}`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-heading font-bold text-foreground tabular-nums">
              {completedCount}/{STEPS.length}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">
              Steps Complete
            </div>
          </div>
        </div>

        <HawkProgressBar value={pct} />
      </div>

      {/* Steps */}
      <div className="p-3 space-y-2">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isDone = states[step.key];
          const isNext = idx === nextIdx;
          const isLocked = !isDone && !isNext && idx > nextIdx;

          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                isDone
                  ? "bg-emerald-500/5 border-emerald-500/30"
                  : isNext
                    ? "bg-primary/5 border-primary/40 ring-2 ring-primary/20"
                    : "bg-background border-border opacity-60"
              }`}
            >
              <div className="flex-shrink-0">
                {isDone ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 fill-emerald-500/20" />
                ) : isLocked ? (
                  <Lock className="w-6 h-6 text-muted-foreground/50" />
                ) : (
                  <Circle className="w-6 h-6 text-primary" />
                )}
              </div>

              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                <Icon className={`w-4 h-4 ${isDone ? "text-emerald-600" : "text-primary"}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-heading font-semibold text-sm ${
                      isDone ? "text-emerald-700 line-through" : "text-foreground"
                    }`}
                  >
                    {idx + 1}. {step.title}
                  </span>
                  {isNext && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider">
                      NEXT
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{step.desc}</p>
              </div>

              {!isDone && (
                <Link
                  to={step.to}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    isNext
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {step.cta}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}