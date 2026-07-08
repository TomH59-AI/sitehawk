import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const META = {
  works: { label: "Works", icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  fails: { label: "Fails", icon: XCircle, cls: "bg-red-50 text-red-700 border-red-300" },
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
        <h3 className="font-heading font-semibold text-sm text-foreground">Fit Status</h3>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${meta.cls}`}>
          <Icon className="w-3.5 h-3.5" /> {meta.label}
        </span>
      </div>
      <ul className="space-y-1.5">
        {fit.reasons.map((r, i) => (
          <li key={i} className="text-xs text-muted-foreground flex gap-2">
            <span className="text-foreground">•</span>{r}
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        Preliminary screen — not a survey or zoning determination.
      </p>
    </div>
  );
}