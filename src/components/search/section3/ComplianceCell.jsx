/**
 * ComplianceCell — shows whether a target parcel MEETS the zoning criteria
 * (classification, setbacks, height restriction, fall zone) that qualified it
 * as a top-3 target. Read-only; driven by the `compliance` object returned by
 * scipBestParcels.
 */
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export default function ComplianceCell({ target }) {
  if (!target) return <div className="px-4 py-2 text-xs text-muted-foreground">—</div>;
  const compliant = target.zoning_compliant !== false && target.compliance?.pass !== false;
  const checks = target.compliance?.checks || [];

  return (
    <div className="px-4 py-2 space-y-1.5">
      <div
        className={`inline-flex items-center gap-1.5 text-xs font-bold ${
          compliant ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
        }`}
      >
        {compliant ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {compliant ? "Meets zoning criteria" : "Does NOT meet criteria"}
      </div>
      {checks.length > 0 && (
        <ul className="space-y-0.5">
          {checks.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
              {c.pass ? (
                <CheckCircle2 className="w-3 h-3 mt-0.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 mt-0.5 text-red-600 shrink-0" />
              )}
              <span className={c.pass ? "text-muted-foreground" : "text-red-700 dark:text-red-300 font-medium"}>
                <span className="font-semibold text-foreground">{c.criterion}:</span> {c.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}