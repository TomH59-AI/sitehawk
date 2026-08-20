import { useState } from "react";
import { Wrench, Loader2, CheckCircle2, AlertTriangle, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { runScipQc, isScipQcPass } from "@/lib/scipQcGate";
import { collectMissingFields, collectMissingMaps } from "./scipBookData";

export default function BookQcPanel({ record, onUpdate }) {
  const [running, setRunning] = useState(false);
  const [manifest, setManifest] = useState(null);
  const missingFields = collectMissingFields(record);
  const missingMaps = collectMissingMaps(record);
  const qc = record?.book_qc || null;
  const complete = isScipQcPass(record)
    && missingFields.length === 0
    && missingMaps.length === 0;
  const status = manifest?.status || qc?.status || "NOT_RUN";

  async function runQc() {
    setRunning(true);
    try {
      const result = await runScipQc(record, { repairAllowed: true });
      if (result.record) onUpdate?.(result.record);
      setManifest(result.qc_manifest || null);
      const repaired = Number(result.book_qc?.repaired_field_count || 0);
      if (result.qc_manifest?.status === "PASS") {
        toast.success("OpenRouter QC passed" + (repaired ? " — " + repaired + " item(s) repaired" : ""));
      } else {
        toast.warning("QC " + (result.qc_manifest?.status || "blocked") + " — release remains locked");
      }
      return result.record || record;
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || "OpenRouter QC failed — release remains locked");
    } finally {
      setRunning(false);
    }
  }

  const StatusIcon = status === "PASS"
    ? CheckCircle2
    : status === "FAIL"
      ? ShieldX
      : AlertTriangle;
  const statusColor = status === "PASS"
    ? "text-green-600"
    : status === "FAIL"
      ? "text-red-600"
      : "text-amber-500";

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#c8d4de" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <StatusIcon className={"w-5 h-5 " + statusColor} />
          <div>
            <p className="text-sm font-bold" style={{ color: "#0f2a43" }}>
              {complete
                ? "QC PASS — SCIP release authorized"
                : status.replaceAll("_", " ") + " · " + missingFields.length + " unresolved field(s) · " + missingMaps.length + " missing map(s)"}
            </p>
            <p className="text-[11px] text-slate-500">
              OpenRouter checks, repairs evidence-backed blanks, reruns deterministic QC, and keeps release locked until every mandatory check passes.
            </p>
          </div>
        </div>
        <button
          onClick={runQc}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "#1d6fb8" }}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
          {running ? "Checking and repairing…" : "Run OpenRouter QC + Repair"}
        </button>
      </div>

      {qc && (
        <div className="mt-3 pt-3 border-t text-[11px] space-y-2" style={{ borderColor: "#e4ebf1" }}>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
            {qc.qc_run_id && <span>Run: {qc.qc_run_id}</span>}
            <span>Repairs: {qc.repaired_field_count || 0}</span>
            <span>Remaining: {qc.remaining_blank_count ?? missingFields.length}</span>
          </div>
          {qc.summary && <p className="text-slate-600">{qc.summary}</p>}
          {(manifest?.blockers || qc.blockers)?.length > 0 && (
            <FindingList title="Release blockers:" items={manifest?.blockers || qc.blockers} color="text-red-600" />
          )}
          {qc.needs_human?.length > 0 && (
            <FindingList
              title="Human review still required:"
              items={qc.needs_human.map((item) => item.why || item.label || String(item))}
              color="text-amber-600"
            />
          )}
        </div>
      )}

      {missingMaps.length > 0 && (
        <div className="mt-3 pt-3 border-t text-[11px]" style={{ borderColor: "#e4ebf1" }}>
          <p className="font-semibold text-slate-600 mb-1">Map exhibits still to generate:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-slate-500">
            {missingMaps.map((item) => <li key={item.page + "-" + item.label}>{item.label}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function FindingList({ title, items, color }) {
  return (
    <div>
      <p className={"font-semibold mb-1 " + color}>{title}</p>
      <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
        {items.map((item, index) => <li key={index + "-" + item}>{item}</li>)}
      </ul>
    </div>
  );
}
