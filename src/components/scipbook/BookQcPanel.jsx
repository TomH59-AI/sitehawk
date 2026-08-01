import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { scipBookQc } from "@/functions/scipBookQc";
import { collectMissingFields, collectMissingMaps } from "./scipBookData";

// Gemini quality-control panel — finds every blank field in the SCIP Book,
// asks Gemini to fill what it can verify from public sources, and lists what
// still needs a human or a pipeline run before delivery.
export default function BookQcPanel({ record, onUpdate }) {
  const [running, setRunning] = useState(false);
  const missingFields = collectMissingFields(record);
  const missingMaps = collectMissingMaps(record);
  const qc = record?.book_qc || null;
  const complete = missingFields.length === 0 && missingMaps.length === 0;

  async function runQc() {
    setRunning(true);
    try {
      const t = record.parcel_targets?.[record.active_target_index || 0] || {};
      const res = await scipBookQc({
        scip_id: record.id,
        missing: missingFields,
        context: {
          site_name: record.site_name,
          latitude: t.latitude ?? record.latitude,
          longitude: t.longitude ?? record.longitude,
          address: t.parcel_address || null,
          county: record.county || null,
          state: record.state || null,
          jurisdiction: record.zoning_jurisdiction || null,
        },
      });
      if (res.data?.record) onUpdate(res.data.record);
      toast.success(`Gemini QC complete — ${Object.keys(res.data?.book_qc?.filled || {}).length} field(s) filled`);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Gemini QC failed — try again");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#c8d4de" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {complete ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          )}
          <div>
            <p className="text-sm font-bold" style={{ color: "#0f2a43" }}>
              {complete ? "SCIP complete — ready to deliver" : `${missingFields.length} blank field(s) · ${missingMaps.length} missing map(s)`}
            </p>
            <p className="text-[11px] text-slate-500">
              Gemini QC fills blanks it can verify from public sources — nothing is fabricated. Missing maps are generated from the SCIP pipeline sections.
            </p>
          </div>
        </div>
        <button
          onClick={runQc}
          disabled={running || missingFields.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "#1d6fb8" }}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Run Gemini QC
        </button>
      </div>

      {qc && (
        <div className="mt-3 pt-3 border-t text-[11px] space-y-2" style={{ borderColor: "#e4ebf1" }}>
          {qc.summary && <p className="text-slate-600">{qc.summary}</p>}
          {qc.needs_human?.length > 0 && (
            <div>
              <p className="font-semibold text-amber-600 mb-1">Needs human input before delivery:</p>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
                {qc.needs_human.map((n) => (
                  <li key={n.key || n.label}>{n.label}{n.why ? ` — ${n.why}` : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {missingMaps.length > 0 && (
        <div className="mt-3 pt-3 border-t text-[11px]" style={{ borderColor: "#e4ebf1" }}>
          <p className="font-semibold text-slate-600 mb-1">Map exhibits still to generate (via SCIP pipeline):</p>
          <ul className="list-disc pl-5 space-y-0.5 text-slate-500">
            {missingMaps.map((m) => <li key={`${m.page}-${m.label}`}>{m.label}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}