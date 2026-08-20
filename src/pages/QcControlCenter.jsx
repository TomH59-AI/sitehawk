import { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_STYLE = {
  VALIDATED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MONITORING: "bg-blue-50 text-blue-700 border-blue-200",
  ADMIN_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  BLOCKED: "bg-red-50 text-red-700 border-red-200",
};

const RUN_ICON = {
  PASS: CheckCircle2,
  REVIEW_REQUIRED: AlertTriangle,
  FAIL: XCircle,
};

export default function QcControlCenter() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await base44.functions.invoke("adaptiveSiteHawkQc", { action: "status" });
      setData(response.data);
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "Could not load adaptive QC status");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (user?.role === "admin") load(); }, [load, user?.role]);

  const policyByFamily = useMemo(() => new Map((data?.policies || []).map((policy) => [policy.task_family, policy])), [data]);
  const changed = (data?.families || []).filter((family) => family.current_source_hash !== family.validated_source_hash);

  async function approve(family) {
    const adminNotes = String(notes[family.task_family] || "").trim();
    if (adminNotes.length < 12) {
      toast.error("Add regression-review notes before approving this changed family.");
      return;
    }
    setBusy(true);
    try {
      await base44.functions.invoke("adaptiveSiteHawkQc", {
        action: "approve_family",
        task_family: family.task_family,
        admin_notes: adminNotes,
        confirm_regression_review: true,
      });
      toast.success(`${family.task_family} contract validated`);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  if (user?.role !== "admin") {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">Administrator access is required.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-mono tracking-[0.3em] text-primary">ADMIN · OPENROUTER</div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl">Adaptive Quality Control Center</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Every Base44 build fingerprints SiteHawk’s functions, pages, workflows, agents, and schemas. Changed task families automatically enter monitoring or administrator review. Policies are versioned and cannot silently weaken themselves.
          </p>
        </div>
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Metric icon={ShieldCheck} label="App fingerprint" value={data?.manifest?.fingerprint?.slice(0, 12) || "—"} />
        <Metric icon={Wrench} label="Task families" value={data?.families?.length ?? "—"} />
        <Metric icon={AlertTriangle} label="Changed families" value={changed.length} alert={changed.length > 0} />
      </div>

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-heading font-bold">Versioned task contracts</h2>
          <p className="text-xs text-muted-foreground">Noncritical changes auto-validate after three clean supervised runs. Zoning, TalonFit, legal, authentication, and administrative changes always require administrator approval.</p>
        </div>
        <div className="divide-y divide-border">
          {(data?.families || []).map((family) => {
            const policy = policyByFamily.get(family.task_family);
            const stale = family.current_source_hash !== family.validated_source_hash;
            return (
              <div key={family.task_family} className="p-4 grid lg:grid-cols-[180px_1fr_260px] gap-4 items-start">
                <div>
                  <div className="font-semibold capitalize">{family.task_family.replace(/_/g, " ")}</div>
                  <div className={`inline-flex mt-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[family.status] || STATUS_STYLE.MONITORING}`}>{family.status}</div>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Policy v{policy?.version || 1} · {policy?.risk_level || "medium"} risk · AI {String(policy?.ai_review_mode || "ON_CHANGE").toLowerCase().replace(/_/g, " ")}</div>
                  <div className="font-mono">Current {family.current_source_hash?.slice(0, 10)} · Validated {family.validated_source_hash?.slice(0, 10)}</div>
                  <div>{family.pass_count || 0} clean run(s) · {family.fail_count || 0} failed run(s) on this change</div>
                </div>
                {stale ? (
                  <div className="space-y-2">
                    <textarea value={notes[family.task_family] || ""} onChange={(event) => setNotes((current) => ({ ...current, [family.task_family]: event.target.value }))} placeholder="What changed and what regression evidence did you review?" className="w-full min-h-20 rounded-lg border border-border bg-background p-2 text-xs" />
                    <button onClick={() => approve(family)} disabled={busy || (family.pass_count || 0) < 1} className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">Approve current contract</button>
                  </div>
                ) : <div className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Current source validated</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border"><h2 className="font-heading font-bold">Recent task evidence</h2></div>
        <div className="divide-y divide-border">
          {(data?.recent_runs || []).slice(0, 25).map((run) => {
            const Icon = RUN_ICON[run.status] || AlertTriangle;
            return (
              <div key={run.id} className="px-4 py-3 flex items-start gap-3">
                <Icon className={`w-4 h-4 mt-0.5 ${run.status === "PASS" ? "text-emerald-600" : run.status === "FAIL" ? "text-red-600" : "text-amber-600"}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{run.task_key} <span className="text-xs font-normal text-muted-foreground">· {run.task_family}</span></div>
                  <div className="text-xs text-muted-foreground">{run.summary || run.status} · {run.qc_run_id}</div>
                </div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">{run.checked_at ? new Date(run.checked_at).toLocaleString() : ""}</div>
              </div>
            );
          })}
          {!data?.recent_runs?.length && <div className="p-6 text-sm text-muted-foreground">No app-wide task reviews yet.</div>}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, alert = false }) {
  return <div className={`rounded-xl border p-4 ${alert ? "border-amber-300 bg-amber-50/60" : "border-border bg-card"}`}><Icon className={`w-5 h-5 ${alert ? "text-amber-600" : "text-primary"}`} /><div className="text-2xl font-bold mt-2">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>;
}
