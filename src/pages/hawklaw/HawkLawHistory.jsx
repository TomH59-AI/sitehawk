import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";

const triageColor = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  yellow: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/10 text-red-700 dark:text-red-400",
};
const triageLabel = { green: "✓ Green", yellow: "⚠ Yellow", red: "⛔ Red" };

const VENDOR_OPTS = ["All", "Anthemnet", "Pop_Wireless", "Verizon", "AT&T", "T-Mobile", "CCI", "AMT", "SBA", "ViaSat", "Other", "Unknown"];
const TRIAGE_OPTS = ["All", "green", "yellow", "red"];

export default function HawkLawHistory() {
  const [allSessions, setAllSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triageFilter, setTriageFilter] = useState("All");
  const [vendorFilter, setVendorFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    base44.entities.HawkLawSession.filter({}).then(data => {
      // History = all sessions (completed/archived = attorney_export_at set, OR all sessions for a history view)
      const all = (Array.isArray(data) ? data : [])
        .sort((a, b) => new Date(b.created_date || b.updated_date) - new Date(a.created_date || a.updated_date));
      setAllSessions(all);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = allSessions.filter(s => {
    if (triageFilter !== "All" && s.triage_result !== triageFilter) return false;
    if (vendorFilter !== "All" && (s.vendor_detected || "Unknown") !== vendorFilter) return false;
    if (dateFrom && s.created_date && new Date(s.created_date) < new Date(dateFrom)) return false;
    if (dateTo && s.created_date && new Date(s.created_date) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading font-semibold text-foreground mb-1">History</h2>
        <p className="text-sm text-muted-foreground">All Hawk Law sessions — completed, active, and archived.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={triageFilter} onChange={e => setTriageFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          {TRIAGE_OPTS.map(o => <option key={o} value={o}>{o === "All" ? "All Triage" : triageLabel[o] || o}</option>)}
        </select>
        <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          {VENDOR_OPTS.map(o => <option key={o}>{o === "All" ? "All Vendors" : o}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-36 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-36 text-sm" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} session{filtered.length !== 1 ? "s" : ""}</span>
        {(triageFilter !== "All" || vendorFilter !== "All" || dateFrom || dateTo) && (
          <button onClick={() => { setTriageFilter("All"); setVendorFilter("All"); setDateFrom(""); setDateTo(""); }}
            className="text-xs text-primary hover:underline">Clear filters</button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">No sessions match your filters.</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 border-b border-border">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3">Document Name</th>
                  <th className="text-left px-4 py-3">Vendor Detected</th>
                  <th className="text-left px-4 py-3">Triage</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{s.file_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.vendor_detected || "Unknown"}</td>
                    <td className="px-4 py-3">
                      {s.triage_result ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${triageColor[s.triage_result]}`}>
                          {triageLabel[s.triage_result]}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        s.attorney_export_at ? "bg-slate-500/10 text-slate-600 dark:text-slate-400" :
                        s.extracted_clauses ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                        s.triage_result ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                        "bg-secondary text-muted-foreground"
                      }`}>
                        {s.attorney_export_at ? "Exported" : s.extracted_clauses ? "Full Review" : s.triage_result ? "Triaged" : "Uploaded"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {s.created_date ? new Date(s.created_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/hawk-law/sessions/${s.id}`} className="text-primary text-xs hover:underline flex items-center gap-1 justify-end">
                        View <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}