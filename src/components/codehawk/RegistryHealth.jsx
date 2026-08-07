import { useCallback, useEffect, useState } from "react";
import { codehawkStats } from "@/functions/codehawkStats";
import { codehawkBatch } from "@/functions/codehawkBatch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Play, RefreshCw, AlertTriangle, CheckCircle2, Database } from "lucide-react";

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function Stat({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "text-foreground",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-destructive",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Bar({ filled, total }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct(filled, total)}%` }} />
    </div>
  );
}

const duration = (ms) => (ms ? (ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)}m`) : "—");
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

export default function RegistryHealth({ isAdmin }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [batchSize, setBatchSize] = useState(25);
  const [stateFilter, setStateFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await codehawkStats({});
      if (res.data?.error) throw new Error(res.data.error);
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load registry stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function runBatch(dryRun) {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await codehawkBatch({
        batch_size: Number(batchSize) || 25,
        state_filter: stateFilter.trim().toUpperCase() || undefined,
        mode: "backfill",
        dry_run: dryRun,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setRunResult(res.data);
      if (!dryRun) load();
    } catch (e) {
      setRunResult({ error: e?.response?.data?.error || e.message || "Batch failed." });
    } finally {
      setRunning(false);
    }
  }

  if (!isAdmin) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Registry health is admin-only.</div>;
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the registry…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
      </div>
    );
  }

  const registry = data?.registry || {};
  const total = registry.total || 0;
  const critical = registry.critical_fields || 6;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Jurisdictions on file" value={total.toLocaleString()} sub={`${registry.with_source_url || 0} have a source URL`} />
        <Stat
          label={`All ${critical} critical values`}
          value={(registry.complete || 0).toLocaleString()}
          sub={`${pct(registry.complete, total)}% of the registry`}
          tone={registry.complete > total * 0.25 ? "good" : "warn"}
        />
        <Stat
          label="No critical values at all"
          value={(registry.empty || 0).toLocaleString()}
          sub={`${pct(registry.empty, total)}% — the backfill target`}
          tone={registry.empty > total * 0.5 ? "bad" : "warn"}
        />
        <Stat
          label="Waiting on review"
          value={(data?.review_queue?.pending || 0).toLocaleString()}
          sub="Values CodeHawk would not write on its own"
          tone={data?.review_queue?.pending > 0 ? "warn" : "good"}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-sm font-bold">Coverage by critical value</h3>
        </div>
        <div className="space-y-3">
          {(registry.field_coverage || []).map((f) => (
            <div key={f.field}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-medium text-foreground">{f.label}</span>
                <span className="text-muted-foreground">
                  {f.populated.toLocaleString()} populated · <span className="text-primary">{f.cited.toLocaleString()} cited</span>
                </span>
              </div>
              <Bar filled={f.populated} total={total} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          &ldquo;Cited&rdquo; means the value carries a verbatim ordinance quote and a section number that passed the quality-control pass.
          A populated-but-uncited value predates CodeHawk and has not been re-verified yet.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 font-heading text-sm font-bold">Completeness spread</h3>
        <div className="flex items-end gap-2">
          {(registry.histogram || []).map((bucket) => {
            const max = Math.max(...(registry.histogram || []).map((b) => b.count), 1);
            return (
              <div key={bucket.score} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-muted-foreground">{bucket.count.toLocaleString()}</span>
                <div
                  className={`w-full rounded-t ${bucket.score === critical ? "bg-emerald-500" : bucket.score === 0 ? "bg-destructive/60" : "bg-primary/50"}`}
                  style={{ height: `${Math.max(4, (bucket.count / max) * 120)}px` }}
                />
                <span className="text-[10px] font-medium text-foreground">{bucket.score}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Critical values present, per jurisdiction</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 font-heading text-sm font-bold">Run a batch now</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Jurisdictions</label>
            <Input type="number" min={1} max={50} value={batchSize} onChange={(e) => setBatchSize(e.target.value)} className="w-24" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">State (optional)</label>
            <Input value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} placeholder="FL" maxLength={2} className="w-20 uppercase" />
          </div>
          <Button variant="outline" disabled={running} onClick={() => runBatch(true)} className="gap-1.5">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Dry run
          </Button>
          <Button disabled={running} onClick={() => runBatch(false)} className="gap-1.5">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run batch
          </Button>
          <Button variant="ghost" size="sm" onClick={load} disabled={running} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh stats
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Backfill first: weakest and stalest records go first, and anything checked in the last 30 days is skipped. A dry run extracts and
          quality-checks everything but writes nothing.
        </p>

        {runResult && (
          <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-xs">
            {runResult.error ? (
              <span className="text-destructive">{runResult.error}</span>
            ) : (
              <div className="space-y-1">
                <div className="font-medium text-foreground">
                  {runResult.dry_run ? "Dry run" : "Batch"} finished — {runResult.targeted} targeted, {runResult.improved} improved,{" "}
                  {runResult.created} created, {runResult.queued_for_review} queued for review, {runResult.failed} failed.
                </div>
                <div className="text-muted-foreground">
                  {runResult.direct_fetch_calls} direct fetches · {runResult.oxylabs_calls} needed OxyLabs
                  {runResult.skipped_time_budget > 0 && ` · ${runResult.skipped_time_budget} deferred to the next run (time budget)`}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 font-heading text-sm font-bold">Recent runs</h3>
        {!(data?.runs || []).length ? (
          <p className="text-xs text-muted-foreground">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Started</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium text-right">Done</th>
                  <th className="py-2 pr-3 font-medium text-right">Improved</th>
                  <th className="py-2 pr-3 font-medium text-right">New</th>
                  <th className="py-2 pr-3 font-medium text-right">Queued</th>
                  <th className="py-2 pr-3 font-medium text-right">OxyLabs</th>
                  <th className="py-2 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((run) => (
                  <tr key={run.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-muted-foreground">{when(run.started_at)}</td>
                    <td className="py-2 pr-3">
                      {run.run_type?.replace(/_/g, " ")}
                      {run.state_filter ? ` · ${run.state_filter}` : ""}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          run.status === "completed"
                            ? "text-emerald-600"
                            : run.status === "running"
                              ? "text-primary"
                              : "text-destructive"
                        }
                      >
                        {run.status === "timed_out" ? "timed out" : run.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">{run.processed}</td>
                    <td className="py-2 pr-3 text-right">{run.improved}</td>
                    <td className="py-2 pr-3 text-right">{run.created}</td>
                    <td className="py-2 pr-3 text-right">{run.queued_for_review}</td>
                    <td className="py-2 pr-3 text-right">{run.oxylabs_calls}</td>
                    <td className="py-2 text-right text-muted-foreground">{duration(run.duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(registry.by_state || []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 font-heading text-sm font-bold">Biggest gaps by state</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {registry.by_state.slice(0, 12).map((s) => (
              <div key={s.state} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-xs">
                <span className="font-semibold">{s.state}</span>
                <span className="text-muted-foreground">
                  {s.complete}/{s.total} complete
                  {s.empty > 0 && <span className="text-amber-600"> · {s.empty} empty</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {registry.complete === total && total > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Every jurisdiction on file carries all six critical values.
        </div>
      )}
    </div>
  );
}
