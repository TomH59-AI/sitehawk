import { useState } from "react";
import { Loader2, ShieldCheck, Wrench, CheckCircle2, AlertTriangle, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";
import { runScipQc } from "@/lib/scipQcGate";

export default function ScipQualityAuditor({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [manifest, setManifest] = useState(null);

  const runAudit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await runScipQc(record, { repairAllowed: true });
      setManifest(result.qc_manifest || null);
      if (result.record) onUpdate?.(result.record);
      if (result.qc_manifest?.status === "PASS") toast.success("OpenRouter QC passed — release authorized");
      else toast.warning("OpenRouter QC " + (result.qc_manifest?.status || "blocked") + " — review findings below");
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "OpenRouter QC failed");
    } finally {
      setBusy(false);
    }
  };

  const status = manifest?.status || record?.book_qc?.status || "NOT_RUN";
  const Icon = status === "PASS" ? CheckCircle2 : status === "FAIL" ? ShieldX : AlertTriangle;
  const color = status === "PASS" ? "#16a34a" : status === "FAIL" ? "#dc2626" : "#d97706";

  return (
    <div className="bg-white rounded-lg border p-5" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5" style={{ color: SKYWAVE.blue }} />
            <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>OpenRouter Quality Control + AI Handyman</h3>
          </div>
          <p className="text-xs" style={{ color: SKYWAVE.muted }}>
            Finds failed or missing work, safely repairs deterministic and authoritative-source blanks, reruns every downstream check, and blocks release unless the final status is PASS.
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: SKYWAVE.blue }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
          {busy ? "Checking and repairing…" : "Run QC + Auto-Repair"}
        </button>
      </div>

      <div className="mt-4 rounded-lg border p-3" style={{ borderColor: color }}>
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5" style={{ color }} />
          <span className="font-bold text-sm" style={{ color }}>{status.replaceAll("_", " ")}</span>
          {(manifest?.qc_run_id || record?.book_qc?.qc_run_id) && (
            <span className="text-[10px] ml-auto" style={{ color: SKYWAVE.muted }}>
              {manifest?.qc_run_id || record?.book_qc?.qc_run_id}
            </span>
          )}
        </div>
        {(manifest?.summary || record?.book_qc?.summary) && (
          <p className="text-xs mt-2" style={{ color: SKYWAVE.ink }}>{manifest?.summary || record?.book_qc?.summary}</p>
        )}
      </div>

      {manifest && (
        <div className="mt-3 grid gap-3 md:grid-cols-2 text-xs">
          <Findings title="Repairs applied" items={(manifest.repairs || []).filter((item) => item.status === "APPLIED").map((item) => item.field_key + ": " + item.applied_value)} color="#16a34a" />
          <Findings title="Release blockers" items={manifest.blockers || []} color="#dc2626" />
          <Findings title="Human review" items={manifest.manual_review_reasons || []} color="#d97706" />
          <Findings title="Warnings" items={manifest.warnings || []} color="#64748b" />
        </div>
      )}
    </div>
  );
}

function Findings({ title, items, color }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: SKYWAVE.line }}>
      <p className="font-semibold mb-1" style={{ color }}>{title}</p>
      <ul className="list-disc pl-4 space-y-1" style={{ color: SKYWAVE.ink }}>
        {items.slice(0, 12).map((item, index) => <li key={index + "-" + item}>{item}</li>)}
      </ul>
    </div>
  );
}
