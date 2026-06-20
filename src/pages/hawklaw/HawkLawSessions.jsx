import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const triageColor = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  yellow: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/10 text-red-700 dark:text-red-400",
};
const triageLabel = { green: "✓ Green", yellow: "⚠ Yellow", red: "⛔ Red" };

export default function HawkLawSessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.HawkLawSession.filter({}).then(data => {
      const all = (Array.isArray(data) ? data : [])
        .filter(s => !s.attorney_export_at)
        .sort((a, b) => new Date(b.created_date || b.updated_date) - new Date(a.created_date || a.updated_date));
      setSessions(all);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-semibold text-foreground">Active Sessions</h2>
          <p className="text-sm text-muted-foreground">{sessions.length} active analysis session{sessions.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" asChild>
          <Link to="/hawk-law"><Plus className="w-4 h-4 mr-1" /> New Analysis</Link>
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-muted-foreground">No active sessions yet.</p>
          <Button size="sm" asChild variant="outline">
            <Link to="/hawk-law">+ Start a New Analysis</Link>
          </Button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 border-b border-border">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3">Document Name</th>
                  <th className="text-left px-4 py-3">Vendor Detected</th>
                  <th className="text-left px-4 py-3">Triage Result</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/hawk-law/sessions/${s.id}`}>
                    <td className="px-4 py-3 font-medium text-foreground">{s.file_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.vendor_detected || "Unknown"}</td>
                    <td className="px-4 py-3">
                      {s.triage_result ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${triageColor[s.triage_result]}`}>
                          {triageLabel[s.triage_result]}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        s.extracted_clauses ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : 
                        s.triage_result ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                        "bg-secondary text-muted-foreground"
                      }`}>
                        {s.extracted_clauses ? "Full Review Done" : s.triage_result ? "Triaged" : "Uploaded"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {s.created_date ? new Date(s.created_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/hawk-law/sessions/${s.id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-primary text-xs hover:underline flex items-center gap-1 justify-end"
                      >
                        Open <ArrowRight className="w-3 h-3" />
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