import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

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
        .sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date));
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
        <Link to="/hawk-law" className="text-sm text-primary hover:underline">+ New Analysis</Link>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">No active sessions. Start a new analysis above.</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 border-b border-border">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-4 py-3">File Name</th>
                <th className="text-left px-4 py-3">Triage</th>
                <th className="text-left px-4 py-3">Vendor</th>
                <th className="text-left px-4 py-3">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{s.file_name}</td>
                  <td className="px-4 py-3">
                    {s.triage_result ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${triageColor[s.triage_result]}`}>
                        {triageLabel[s.triage_result]}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.vendor_detected || "Unknown"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {s.updated_date ? new Date(s.updated_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/hawk-law/sessions/${s.id}`} className="text-primary text-xs hover:underline flex items-center gap-1 justify-end">
                      Open <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}