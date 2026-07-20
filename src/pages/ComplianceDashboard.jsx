import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Loader2, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { TRIGGERS, NEPA_BADGE, DISCLAIMER } from "@/components/compliance/complianceConst";
import ComplianceDashboardStats from "@/components/compliance/ComplianceDashboardStats";

const flagsOf = (r) => r.nepaTriggerFlags || {};
const firedTriggers = (r) => TRIGGERS.filter((t) => flagsOf(r)[t.key]);

// Compliance Dashboard — portfolio-wide rollup of tribal land, wetland, and
// all NEPA trigger flags across every scanned site with a compliance record.
export default function ComplianceDashboard() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    base44.entities.ComplianceCheck.list("-updated_date", 500)
      .then(setRecords)
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    total: records.length,
    tribal: records.filter((r) => flagsOf(r).indianReligiousSite).length,
    wetlands: records.filter((r) => flagsOf(r).wetlands).length,
    floodplain: records.filter((r) => flagsOf(r).floodplain).length,
    flagged: records.filter((r) => firedTriggers(r).length > 0).length,
  };

  const visible = records.filter((r) => {
    if (filter === "tribal") return flagsOf(r).indianReligiousSite;
    if (filter === "wetlands") return flagsOf(r).wetlands;
    if (filter === "floodplain") return flagsOf(r).floodplain;
    if (filter === "flagged") return firedTriggers(r).length > 0;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <ShieldAlert className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Compliance Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Portfolio-wide NEPA trigger tracking — tribal land, wetlands, floodplain, and all 47 CFR 1.1307(a) risk factors.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading compliance records…
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No compliance records yet. Run Hawk Compliance on a SCIP site and it will appear here.
        </div>
      ) : (
        <>
          <ComplianceDashboardStats stats={stats} activeFilter={filter} onFilter={setFilter} />

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-2.5 font-semibold">Site</th>
                    <th className="px-4 py-2.5 font-semibold">Location</th>
                    <th className="px-4 py-2.5 font-semibold">NEPA Determination</th>
                    <th className="px-4 py-2.5 font-semibold">Triggers Fired</th>
                    <th className="px-4 py-2.5 font-semibold">Tribes Identified</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((r) => {
                    const fired = firedTriggers(r);
                    const badge = NEPA_BADGE[r.nepaDetermination] || NEPA_BADGE["Not Started"];
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {r.siteName || "Untitled site"}
                          {r.ownerName && <div className="text-[11px] text-muted-foreground font-normal">{r.ownerName}</div>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {[r.county, r.state].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                            style={{ background: badge.bg, color: badge.color || "#fff" }}
                          >
                            {r.nepaDetermination || "Not Started"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {fired.length === 0 ? (
                            <span className="text-[11px] font-semibold text-emerald-600">Clean — no triggers</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {fired.map((t) => (
                                <span
                                  key={t.key}
                                  title={t.source}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                    t.key === "indianReligiousSite"
                                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
                                      : t.key === "wetlands"
                                      ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/40"
                                      : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/40"
                                  }`}
                                >
                                  {t.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                          {(r.nacdTribesIdentified || []).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Link
                            to={`/scip/${r.scipRecordId}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            Open SCIP <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No sites match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground/70">{DISCLAIMER}</p>
        </>
      )}
    </div>
  );
}