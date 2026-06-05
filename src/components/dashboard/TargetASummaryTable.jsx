import { Link } from "react-router-dom";
import { Target, ArrowRight } from "lucide-react";
import { daysSince, shotClock, SHPO_RUNNING, THPO_RUNNING } from "@/components/compliance/complianceConst";
import PrintSiteHawkScipButton from "@/components/scip/PrintSiteHawkScipButton";

// Human labels for ScipCRMDeal stages.
const STAGE_LABELS = {
  scip_generated: "SCIP Generated",
  mailers_drafted: "Mailers Drafted",
  mailers_sent: "Mailers Sent",
  call_due: "Call Due",
  owner_contacted: "Owner Contacted",
  interested: "Interested",
  not_interested: "Not Interested",
  loi_terms: "LOI / Terms",
  lease_drafting: "Lease Drafting",
  zoning_package: "Zoning Package",
  permit_package: "Permit Package",
  submitted: "Submitted",
  approved: "Approved",
  on_hold: "On Hold",
  lost: "Lost",
  exhausted: "Exhausted",
};

// Smallest remaining shot-clock days across any running SHPO/THPO record on a
// compliance check (30-day FCC NPA clock). Returns null when nothing is running.
function remainingShotClock(compliance) {
  if (!compliance) return null;
  const running = [];
  (compliance.shpoRecords || []).forEach((r) => {
    if (r.determination === SHPO_RUNNING && r.submissionDate) {
      const d = daysSince(r.submissionDate);
      if (d != null) running.push(30 - d);
    }
  });
  (compliance.thpoRecords || []).forEach((r) => {
    if (r.status === THPO_RUNNING && r.notificationDate) {
      const d = daysSince(r.notificationDate);
      if (d != null) running.push(30 - d);
    }
  });
  if (!running.length) return null;
  return Math.min(...running);
}

export default function TargetASummaryTable({ rows }) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <Target className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No active Target A sites yet. Generate a SCIP from Site Search to start tracking.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-4 py-3 font-heading font-semibold text-foreground">Target A Site</th>
              <th className="px-4 py-3 font-heading font-semibold text-foreground">Pipeline Stage</th>
              <th className="px-4 py-3 font-heading font-semibold text-foreground">Shot Clock</th>
              <th className="px-4 py-3 font-heading font-semibold text-foreground">Coverage</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const remaining = remainingShotClock(row.compliance);
              const clock = remaining != null ? shotClock(30 - remaining) : null;
              return (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{row.siteName}</div>
                    {row.owner ? <div className="text-xs text-muted-foreground">{row.owner}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                      {STAGE_LABELS[row.stage] || "SCIP Generated"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {clock ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: clock.color }}>
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: clock.color }} />
                        {remaining <= 0 ? "Expired" : `${remaining} day${remaining !== 1 ? "s" : ""} left`}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.hasCoverage ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Generated
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <PrintSiteHawkScipButton scipId={row.id} variant="link" />
                      <Link to={`/scip/${row.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        Open <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}