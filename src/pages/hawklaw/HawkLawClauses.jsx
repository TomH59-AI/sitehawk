import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronUp } from "lucide-react";

const CATEGORY_OPTS = ["All", "Term", "Rent", "DueDiligence", "Exclusivity", "ROFR", "Assignment", "Default", "Termination", "Indemnification", "Insurance", "Hazmat", "Utilities", "LenderRights", "Waivers", "Other"];
const SEVERITY_OPTS = ["All", "none", "caution", "critical"];

const severityBadge = {
  none: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  caution: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
};
const severityLabel = { none: "None", caution: "⚠ Caution", critical: "⛔ Critical" };

function Stars({ score }) {
  const n = Math.round(Math.max(1, Math.min(5, score || 0)));
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= n ? "text-amber-400" : "text-border"}>★</span>
      ))}
    </div>
  );
}

function ClauseRow({ clause }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className="border-b border-border hover:bg-secondary/20 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 font-medium text-foreground">{clause.clause_name}</td>
        <td className="px-4 py-3 text-muted-foreground text-sm">{clause.clause_category}</td>
        <td className="px-4 py-3">
          <Stars score={clause.landlord_favorability_score} />
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityBadge[clause.red_flag_severity]}`}>
            {severityLabel[clause.red_flag_severity]}
          </span>
        </td>
        <td className="px-4 py-3 text-right text-muted-foreground">
          {expanded ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-secondary/10">
          <td colSpan={5} className="px-4 py-4 space-y-3">
            {clause.ai_explainer && (
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Plain English</div>
                <p className="text-sm text-foreground leading-relaxed">{clause.ai_explainer}</p>
              </div>
            )}
            {clause.clause_text_typical && (
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Typical Language</div>
                <p className="text-xs text-muted-foreground italic leading-relaxed">"{clause.clause_text_typical}"</p>
              </div>
            )}
            {clause.counter_suggestion && (
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Counter Suggestion</div>
                <p className="text-sm text-primary leading-relaxed">{clause.counter_suggestion}</p>
              </div>
            )}
            {clause.source_vendor && (
              <div className="text-xs text-muted-foreground">Source vendor: {clause.source_vendor}</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function HawkLawClauses() {
  const [clauses, setClauses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");

  useEffect(() => {
    base44.entities.HawkLawClause.list("-landlord_favorability_score", 500).then(data => {
      setClauses(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = clauses.filter(c => {
    if (categoryFilter !== "All" && c.clause_category !== categoryFilter) return false;
    if (severityFilter !== "All" && c.red_flag_severity !== severityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading font-semibold text-foreground mb-1">Clause Library</h2>
        <p className="text-sm text-muted-foreground">Read-only browse of known tower lease clause patterns with favorability scoring.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          {CATEGORY_OPTS.map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          {SEVERITY_OPTS.map(o => <option key={o} value={o}>{o === "All" ? "All Severities" : severityLabel[o]}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} clause{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">No clauses match your filters.</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 border-b border-border">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3">Clause Name</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Landlord Favorability</th>
                  <th className="text-left px-4 py-3">Red Flag</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => <ClauseRow key={c.id} clause={c} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}