import { useEffect, useState } from "react";
import { integrationDiagnostics } from "@/functions/integrationDiagnostics";
import { base44 } from "@/api/base44Client";
import { Activity, RefreshCw } from "lucide-react";

export default function DiagnosticsPanel() {
  const [checks, setChecks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => setIsAdmin(u?.role === "admin")).catch(() => {});
  }, []);

  const run = async () => {
    setLoading(true);
    try {
      const res = await integrationDiagnostics({});
      setChecks(res.data?.checks || []);
    } catch (e) {
      setChecks([{ name: "Diagnostics", ok: false, error: e.message }]);
    }
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) run(); }, [isAdmin]);

  if (!isAdmin) return null;

  const allOk = checks && checks.every((c) => c.ok);
  const redCount = checks ? checks.filter((c) => !c.ok).length : 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${allOk ? "text-emerald-500" : "text-amber-500"}`} />
          <span className="font-heading font-bold text-sm text-foreground">Integration Diagnostics</span>
          {checks && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              allOk ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"
            }`}>
              {allOk ? "All systems operational" : `${redCount} issue${redCount !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!expanded && checks && (
            <div className="flex items-center gap-1">
              {checks.map((c) => (
                <span
                  key={c.name}
                  title={`${c.name}: ${c.ok ? "OK" : c.error}`}
                  className={`w-2.5 h-2.5 rounded-full ${c.ok ? "bg-emerald-500" : "bg-red-500"}`}
                />
              ))}
            </div>
          )}
          <span className="text-xs text-muted-foreground">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-1.5">
          <div className="flex items-center justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); run(); }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Re-check
            </button>
          </div>
          {!checks && loading && (
            <div className="text-xs text-muted-foreground py-3 text-center">Running diagnostics…</div>
          )}
          {checks && checks.map((c) => (
            <div
              key={c.name}
              className={`flex items-start gap-2 px-2 py-1.5 rounded text-xs ${
                c.ok ? "bg-emerald-500/5" : "bg-red-500/5"
              }`}
              title={c.ok ? "OK" : c.error}
            >
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${c.ok ? "bg-emerald-500" : "bg-red-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">{c.name}</div>
                {!c.ok && <div className="text-red-600 break-words">{c.error}</div>}
                {c.ok && c.note && <div className="text-muted-foreground">{c.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}