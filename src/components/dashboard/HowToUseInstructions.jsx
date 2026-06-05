import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Search,
  Eye,
  FileText,
  Send,
  Sparkles,
  ArrowRight,
} from "lucide-react";

/**
 * HowToUseInstructions — a collapsible "how to use this bad boy" guide that
 * lives at the top of the Dashboard. Shows the workflow steps connected by
 * arrows. Read-only: no action buttons/links (the WorkflowIndex handles
 * navigation). Expanded/collapsed state persists in localStorage.
 */
const STEPS = [
  {
    icon: Search,
    title: "Run a Site Scan",
    desc: "Drop a pin or address and SiteHawk pulls every parcel within your ring — zoning, owner, acreage, fiber, power.",
  },
  {
    icon: Eye,
    title: "Pick Your Targets with Hawk Vision",
    desc: "Review match-scored candidates. The top 3 (Targets A/B/C) become your Hawk Vision picks for the SCIP.",
  },
  {
    icon: FileText,
    title: "Generate the SCIP",
    desc: "Build the SCIP section by section (Zoning, Infrastructure, Maps) — accuracy over speed.",
  },
  {
    icon: Send,
    title: "Send Landowner Mailers",
    desc: "Push your top parcels into the CRM and fire off direct-mail letters to landowners.",
  },
  {
    icon: Sparkles,
    title: "Visualize with AI",
    desc: "Drop in an aerial photo and AI renders the tower on the parcel for landowner presentations.",
  },
];

export default function HowToUseInstructions() {
  const [expanded, setExpanded] = useState(() => {
    return localStorage.getItem("sitehawk_howto_expanded") !== "0";
  });

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    localStorage.setItem("sitehawk_howto_expanded", next ? "1" : "0");
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-heading font-semibold text-base text-foreground">
              How to Use SiteHawk
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              The {STEPS.length}-step workflow · click to {expanded ? "hide" : "show"}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      {/* Steps connected by arrows — read-only, no action buttons */}
      {expanded && (
        <div className="px-5 pb-5 pt-4 border-t border-border">
          <div className="flex flex-col gap-2">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={idx}>
                  <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-background">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center relative">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center border-2 border-card">
                        {idx + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-heading font-semibold text-sm text-foreground">
                        {step.title}
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowRight className="w-4 h-4 text-muted-foreground/50 rotate-90" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}