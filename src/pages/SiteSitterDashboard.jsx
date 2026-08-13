import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import SiteSitterStats from "@/components/sitesitter/SiteSitterStats";
import SiteSitterRow from "@/components/sitesitter/SiteSitterRow";
import { rollUpSites, summarize } from "@/lib/siteSitterFeasibility";
import SiteSitterScout from "@/components/sitesitter/SiteSitterScout";

// SiteSitter™ Feasibility Dashboard — one row per active site, ranked so the
// best build opportunities (buildable, greatest allowable height) sit on top.
export default function SiteSitterDashboard() {
  const [sites, setSites] = useState(null);

  useEffect(() => {
    base44.entities.TalonFitRunLog.list("-run_timestamp_utc", 500).then((runs) =>
      setSites(rollUpSites(runs))
    );
  }, []);

  if (!sites) {
    return (
      <div className="flex items-center justify-center p-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading feasibility results…
      </div>
    );
  }

  const summary = summarize(sites);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-8">
      <header>
        <h1 className="font-heading text-2xl text-foreground">SiteSitter™ Feasibility Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Latest feasibility verdict for every site you have scored, ranked by allowable tower height.
          Source: SiteSitter™ / TalonFit® run log.
        </p>
      </header>

      <SiteSitterStats summary={summary} />

      <SiteSitterScout />

      {sites.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No data available — no feasibility runs have been recorded yet. Score a target in TalonFit® to populate this view.
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
    </div>
  );
}