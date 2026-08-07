/**
 * Shadow-mode review panel — admin only.
 *
 * The numbers that decide whether to cut over from the live geometry engine to
 * HawkPerchSolver v2. The headline is the split: sites the live engine BLOCKED
 * that v2 allows are the fix landing (the single max(front,side,rear) setback
 * rejecting points that clear their own edge's rule). Sites v2 blocks that the
 * live engine allowed are v2 applying rules the old engine never checked, and
 * each one deserves a look before switching.
 */
import { useCallback, useEffect, useState } from "react";
import { solverShadowLog } from "@/functions/solverShadowLog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, GitCompare, AlertTriangle } from "lucide-react";

function Stat({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "text-foreground",
    good: "text-emerald-600",
    warn: "text-amber-600",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function ShadowPanel({ isAdmin }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await solverShadowLog({ action: "summary" });
      if (res.data?.error) throw new Error(res.data.error);
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load the shadow comparison.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin && open && !data) load();
  }, [isAdmin, open, data, load]);

  if (!isAdmin) return null;

  return (
    <div className="mb-3 rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <GitCompare className="h-4 w-4 text-primary" />
          Solver shadow comparison
          {data?.total ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
              {data.total} recorded
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            HawkPerchSolver v2 runs alongside the live engine on every fit check. Nothing below is user-facing — the live
            engine is still authoritative. These are the disagreements collected from real use.
          </p>

          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              {data.total === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No disagreements recorded yet. Use HawkFit or the Customize probe on a few parcels and check back.
                </p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat
                      label="Live blocked, v2 allows"
                      value={data.live_blocked_v2_allows}
                      sub="Buildable sites the old engine rejected"
                      tone="good"
                    />
                    <Stat
                      label="v2 blocks, live allowed"
                      value={data.v2_blocks_live_allows}
                      sub="Rules the old engine never checked"
                      tone="warn"
                    />
                    <Stat label="v2 taller / shorter" value={`${data.v2_taller} / ${data.v2_shorter}`} sub="Height changes ≥ 1 ft" />
                    <Stat label="Mean height delta" value={`${data.mean_abs_delta_ft} ft`} sub="Average absolute change" />
                  </div>

                  {data.default_side_count > 0 && (
                    <div className="rounded-lg border border-amber-400/50 bg-amber-500/5 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                      {data.default_side_count} of {data.total} comparisons ran with <strong>default_side</strong> frontage —
                      the front setback was not applied because the road frontage was unknown. Those sites may be more
                      restrictive than v2 reported.
                    </div>
                  )}

                  {Object.keys(data.by_binding_constraint || {}).length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-semibold text-foreground">What binds the height</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(data.by_binding_constraint)
                          .sort((a, b) => b[1] - a[1])
                          .map(([k, v]) => (
                            <span key={k} className="rounded-full border border-border px-2 py-0.5 text-[10px] font-mono">
                              {k.replace(/_/g, " ")} · {v}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-1.5 pr-2 font-medium">Where</th>
                          <th className="py-1.5 pr-2 font-medium">Live</th>
                          <th className="py-1.5 pr-2 font-medium">v2</th>
                          <th className="py-1.5 pr-2 font-medium text-right">Δ ft</th>
                          <th className="py-1.5 font-medium">Why</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.recent || []).slice(0, 15).map((r) => (
                          <tr key={r.id} className="border-b border-border/50 align-top">
                            <td className="py-1.5 pr-2 font-mono">
                              {r.jurisdiction || "—"}
                              <div className="text-muted-foreground">
                                {Number.isFinite(r.lat) ? `${r.lat.toFixed(4)}, ${r.lon?.toFixed(4)}` : ""}
                              </div>
                            </td>
                            <td className="py-1.5 pr-2">
                              <span className={r.live_code ? "text-destructive" : "text-emerald-600"}>
                                {r.live_code || "ok"}
                              </span>
                              <div className="text-muted-foreground">{r.live_max_ft ?? "—"} ft</div>
                            </td>
                            <td className="py-1.5 pr-2">
                              <span className={r.v2_codes?.length ? "text-destructive" : "text-emerald-600"}>
                                {r.v2_codes?.length ? r.v2_codes.join(", ") : "ok"}
                              </span>
                              <div className="text-muted-foreground">
                                {r.v2_max_ft != null ? `${Math.round(r.v2_max_ft)} ft · rung ${r.v2_rung}` : "—"}
                              </div>
                            </td>
                            <td
                              className={`py-1.5 pr-2 text-right font-mono ${
                                r.delta_ft > 0 ? "text-emerald-600" : r.delta_ft < 0 ? "text-amber-600" : ""
                              }`}
                            >
                              {r.delta_ft != null ? (r.delta_ft > 0 ? "+" : "") + Math.round(r.delta_ft) : "—"}
                            </td>
                            <td className="py-1.5 text-muted-foreground">{r.explanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      )}
    </div>
  );
}
