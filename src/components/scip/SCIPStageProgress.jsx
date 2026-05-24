import HawkProgressBar from "../dashboard/HawkProgressBar";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

/**
 * SCIPStageProgress — Stage timeline showing the hawk flying across the
 * SCIP workflow. Each stage has status: 'done' | 'active' | 'pending'.
 *
 * Props:
 *   stages: Array<{ key, label, status }>
 */
export default function SCIPStageProgress({ stages = [] }) {
  const total = stages.length;
  const doneCount = stages.filter((s) => s.status === "done").length;
  const activeIdx = stages.findIndex((s) => s.status === "active");
  // Progress: completed stages + half credit for the active one
  const progress = total === 0 ? 0 : ((doneCount + (activeIdx >= 0 ? 0.5 : 0)) / total) * 100;
  const activeLabel = activeIdx >= 0 ? stages[activeIdx].label : doneCount === total ? "All stages complete" : "Ready to start";

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 sticky top-2 z-30 shadow-sm">
      <HawkProgressBar
        value={progress}
        label="SCIP Workflow"
        sublabel={activeLabel}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {stages.map((s) => {
          const Icon = s.status === "done" ? CheckCircle2 : s.status === "active" ? Loader2 : Circle;
          const tone =
            s.status === "done"
              ? "text-green-600"
              : s.status === "active"
              ? "text-primary"
              : "text-slate-400";
          return (
            <div key={s.key} className="flex items-center gap-2 text-xs">
              <Icon className={`w-4 h-4 shrink-0 ${tone} ${s.status === "active" ? "animate-spin" : ""}`} />
              <span className={`truncate ${s.status === "pending" ? "text-muted-foreground" : "text-foreground font-medium"}`}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}