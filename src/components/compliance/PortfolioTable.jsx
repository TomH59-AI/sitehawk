import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { daysSince, shotClock, SHPO_RUNNING, THPO_RUNNING, NEPA_BADGE, HC } from "./complianceConst";

function NepaPill({ det }) {
  const b = NEPA_BADGE[det] || NEPA_BADGE["Not Started"];
  const short = det === "CatEx Eligible" ? "CatEx" : det;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white whitespace-nowrap" style={{ background: b.bg, color: b.color || "#fff" }}>{short}</span>;
}

function worstDays(rec) {
  let worst = null;
  (rec.shpoRecords || []).forEach((s) => { if (s.determination === SHPO_RUNNING && s.submissionDate) { const d = daysSince(s.submissionDate); if (worst == null || d > worst) worst = d; } });
  (rec.thpoRecords || []).forEach((t) => { if (t.status === THPO_RUNNING && t.notificationDate) { const d = daysSince(t.notificationDate); if (worst == null || d > worst) worst = d; } });
  return worst;
}

export default function PortfolioTable({ records, unlinkedScips }) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = statusFilter === "all" ? records : records.filter((r) => r.nepaDetermination === statusFilter);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border flex-wrap">
        <h3 className="font-heading font-semibold">Sites</h3>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm border border-border rounded-lg px-2 py-1 bg-background">
          <option value="all">All NEPA statuses</option>
          {Object.keys(NEPA_BADGE).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="px-4 py-2.5 font-medium">Site</th>
              <th className="px-4 py-2.5 font-medium">NEPA</th>
              <th className="px-4 py-2.5 font-medium">SHPO</th>
              <th className="px-4 py-2.5 font-medium">THPO</th>
              <th className="px-4 py-2.5 font-medium">Days Out</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const wd = worstDays(r);
              const sc = wd != null ? shotClock(wd) : null;
              return (
                <tr key={r.id} onClick={() => navigate(`/hawk-compliance/${r.scipRecordId}`)} className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer">
                  <td className="px-4 py-3 font-medium">{r.siteName}</td>
                  <td className="px-4 py-3"><NepaPill det={r.nepaDetermination} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{(r.shpoRecords || []).length} state(s)</td>
                  <td className="px-4 py-3 text-muted-foreground">{(r.thpoRecords || []).length} tribe(s)</td>
                  <td className="px-4 py-3">{sc ? <span className="font-semibold" style={{ color: sc.color }}>{wd}d</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[160px]">{r.ownerName}</td>
                  <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-muted-foreground" /></td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">No compliance records yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {unlinkedScips?.length > 0 && (
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Start compliance tracking on an existing SCIP site:</p>
          <div className="flex flex-wrap gap-2">
            {unlinkedScips.map((s) => (
              <button key={s.id} onClick={() => navigate(`/hawk-compliance/${s.id}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted/50"
                style={{ color: HC.green }}>
                <Plus className="w-3.5 h-3.5" /> {s.site_name || "Untitled Site"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}