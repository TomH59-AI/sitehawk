import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import TalonFitTagline from "@/components/talonfit/TalonFitTagline";

const META = {
  works: { label: "Allowable", icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  fails: { label: "Unallowable", icon: XCircle, cls: "bg-red-50 text-red-700 border-red-300" },
  needs_review: { label: "Needs Review", icon: AlertTriangle, cls: "bg-amber-50 text-amber-700 border-amber-300" },
};

// HawkFit Map — live feasibility verdict panel.
export default function FitStatusPanel({ fit }) {
  if (!fit) return null;
  const meta = META[fit.status] || META.needs_review;
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-sm text-foreground">HawkPerch Live Status</h3>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${meta.cls}`}>
          <Icon className="w-3.5 h-3.5" /> {meta.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-muted p-2"><span className="text-muted-foreground">Edge clearance</span><br/><strong>{Math.round(fit.edgeDistanceFt || 0)} ft</strong></div>
        <div className="rounded-lg bg-muted p-2"><span className="text-muted-foreground">Highest allowable</span><br/><strong>{Math.round(fit.maxAvailableHeight || 0)} ft</strong></div>
      </div>
      {fit.errorCode && <p className="font-mono text-xs font-semibold text-destructive">{fit.errorCode}</p>}
      <ul className="space-y-1.5">
        {fit.reasons.map((r, i) => (
          <li key={i} className="text-xs text-muted-foreground flex gap-2">
            <span className="text-foreground">•</span>{r}
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        NOT final engineering, NOT a stamped survey, and NOT a final zoning determination.
      </p>
      <TalonFitTagline />
    </div>
  );
}