import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
  Eye,
  FileText,
  Send,
  Sparkles,
} from "lucide-react";

/**
 * HowToUseInstructions — a step-by-step "how to use this bad boy" guide that
 * lives on the Dashboard. Users can expand/collapse the panel and tick off
 * steps as they go. Local progress persists in localStorage.
 */
const STEPS = [
  {
    icon: Search,
    title: "Run a Site Scan",
    desc: "Drop a pin or address on /search and SiteHawk pulls every parcel within your ring — zoning, owner, acreage, fiber, power.",
    to: "/search",
    cta: "Start Scan",
  },
  {
    icon: Eye,
    title: "Pick Your Targets with Hawk Vision",
    desc: "Review match-scored candidates on /results. The top 3 (Targets A/B/C) become your Hawk Vision picks for the SCIP.",
    to: "/results",
    cta: "View Results",
  },
  {
    icon: FileText,
    title: "Generate the SCIP",
    desc: "Click any candidate → Build SCIP. Generate each section (Zoning, Infrastructure, Maps) — accuracy over speed.",
    to: "/results",
    cta: "Build SCIP",
  },
  {
    icon: Send,
    title: "Send Landowner Mailers",
    desc: "Push your top parcels into the CRM and fire off Lob direct-mail letters straight from /crm.",
    to: "/crm",
    cta: "Open CRM",
  },
  {
    icon: Sparkles,
    title: "Visualize with AI",
    desc: "Drop an aerial photo into /tower-placement and AI renders the tower on the parcel for landowner presentations.",
    to: "/tower-placement",
    cta: "Open AI Vision",
  },
];

const STORAGE_KEY = "sitehawk_howto_progress";

export default function HowToUseInstructions() {
  const [expanded, setExpanded] = useState(() => {
    return localStorage.getItem("sitehawk_howto_expanded") !== "0";
  });
  const [done, setDone] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    localStorage.setItem("sitehawk_howto_expanded", next ? "1" : "0");
  };

  const toggleStep = (idx) => {
    const next = { ...done, [idx]: !done[idx] };
    setDone(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const completedCount = STEPS.filter((_, i) => done[i]).length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-heading font-semibold text-base text-foreground">
              How to Use SiteHawk
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount} of {STEPS.length} steps complete · click to {expanded ? "hide" : "show"}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      {/* Steps */}
      {expanded && (
        <div className="px-5 pb-5 pt-1 space-y-2 border-t border-border">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isDone = !!done[idx];
            return (
              <div
                key={idx}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  isDone
                    ? "bg-emerald-500/5 border-emerald-500/30"
                    : "bg-background border-border hover:border-primary/40"
                }`}
              >
                <button
                  onClick={() => toggleStep(idx)}
                  className="mt-0.5 flex-shrink-0"
                  aria-label={isDone ? "Mark step as incomplete" : "Mark step as complete"}
                >
                  <CheckCircle2
                    className={`w-6 h-6 transition-colors ${
                      isDone ? "text-emerald-500 fill-emerald-500/20" : "text-muted-foreground/40 hover:text-primary"
                    }`}
                  />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-primary" />
                    <span
                      className={`font-heading font-semibold text-sm ${
                        isDone ? "text-emerald-700 line-through" : "text-foreground"
                      }`}
                    >
                      Step {idx + 1}: {step.title}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>

                <Link
                  to={step.to}
                  className="flex-shrink-0 text-xs font-medium text-primary hover:text-primary/80 px-3 py-1.5 rounded-md border border-primary/30 hover:bg-primary/5 transition-colors whitespace-nowrap"
                >
                  {step.cta} →
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}