import { useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import HawkIcon from "../HawkIcon";

const STEPS = [
  { id: "plan", label: "Activate a paid plan", desc: "Unlock AI scanning with Hawk 20/20 Vision", link: "/pricing", linkLabel: "View Plans" },
  { id: "scan", label: "Run your first scan", desc: "Drop coordinates into Site Search and scan a 0.5-mile radius", link: "/search", linkLabel: "Go to Search" },
  { id: "skiptrace", label: "Skip trace an owner", desc: "Click 'Skip Trace' on any candidate to get verified contact info", link: "/search", linkLabel: "Go to Search" },
  { id: "ai", label: "Chat with SiteHawk AI", desc: "Open the AI chat panel after a scan — it's the hawk icon bottom-right", link: "/search", linkLabel: "Start a Scan" },
  { id: "pdf", label: "Download a PDF report", desc: "Generate a full intelligence report from your scan results", link: "/search", linkLabel: "Start a Scan" },
];

export default function OnboardingChecklist({ searches, hasSkipTrace, tier }) {
  const [collapsed, setCollapsed] = useState(false);

  const completed = {
    plan: tier === "monthly" || tier === "annual",
    scan: searches > 0,
    skiptrace: hasSkipTrace,
    ai: searches > 0,
    pdf: searches > 0,
  };

  const completedCount = Object.values(completed).filter(Boolean).length;
  const allDone = completedCount === STEPS.length;

  if (allDone) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-primary/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <HawkIcon size={28} />
          <div>
            <p className="font-heading font-bold text-sm text-foreground">Get started with SiteHawk</p>
            <p className="text-xs text-muted-foreground">{completedCount} of {STEPS.length} steps complete</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Mini progress */}
          <div className="hidden sm:flex gap-1">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`w-2 h-2 rounded-full ${completed[s.id] ? "bg-primary" : "bg-secondary"}`}
              />
            ))}
          </div>
          {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Steps */}
      {!collapsed && (
        <div className="px-5 pb-5 space-y-2">
          {STEPS.map((step) => {
            const done = completed[step.id];
            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-xl transition-all ${done ? "opacity-50" : "bg-card border border-border"}`}
              >
                {done
                  ? <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  : <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                }
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>{step.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
                {!done && (
                  <Link
                    to={step.link}
                    className="shrink-0 text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                  >
                    {step.linkLabel} →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}