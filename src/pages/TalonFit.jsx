import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Zap } from "lucide-react";
import SiteSitterStats from "@/components/sitesitter/SiteSitterStats";
import SiteSitterRow from "@/components/sitesitter/SiteSitterRow";
import SiteSitterScout from "@/components/sitesitter/SiteSitterScout";
import { rollUpSites, summarize } from "@/lib/siteSitterFeasibility";
import HawkBoltBoundaryMap from "@/components/hawkbolt/HawkBoltBoundaryMap";
import ShadowPanel from "@/components/talonfit/ShadowPanel";

// TalonFit™ — TalonFit-AI-1.0 feasibility dashboard, target scout, and
// boundary map. One page, reached from the TalonFit™ sidebar link.
export default function TalonFit() {
  const [sites, setSites] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    base44.entities.TalonFitRunLog.list("-run_timestamp_utc", 500).then((runs) =>
      setSites(rollUpSites(runs))
    );
    base44.auth
      .me()
      .then((user) => setIsAdmin(user?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-8">
      <header>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="font-heading text-2xl text-foreground">TalonFit™</h1>
          <span className="text-xs text-muted-foreground">
            TalonFit-AI-1.0 feasibility solver · Patent Pending
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Latest feasibility verdict for every site you have scored, ranked by allowable tower height.
          Source: TalonFit® run log.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Screening tool only — ordinance readings and fit results are not a substitute for a PE-stamped
          drawing or the jurisdiction's own determination.
        </p>
      </header>

      {sites === null ? (
        <div className="flex items-center justify-center p-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading feasibility results…
        </div>
      ) : (
        <>
          <SiteSitterStats summary={summarize(sites)} />

          <SiteSitterScout />

          {sites.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              No data available — no feasibility runs have been recorded yet. Score a target to populate this view.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[900px] text-left">
                <thead className="border-b border-border bg-secondary/40">
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Verdict</th>
                    <th className="px-3 py-2 font-medium">Site</th>
                    <th className="px-3 py-2 font-medium">Jurisdiction</th>
                    <th className="px-3 py-2 font-medium">Max allowable</th>
                    <th className="px-3 py-2 font-medium">Height evaluated</th>
                    <th className="px-3 py-2 font-medium">Binding constraint</th>
                    <th className="px-3 py-2 font-medium">Last run</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => (
                    <SiteSitterRow key={s.key} site={s} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Admin-only: HawkPerchSolver v2 vs the live engine. Not user-facing. */}
      <ShadowPanel isAdmin={isAdmin} />

      <HawkBoltBoundaryMap />
    </div>
  );
}