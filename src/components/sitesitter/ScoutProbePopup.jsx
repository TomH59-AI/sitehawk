import { Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-3 text-[11px]">
    <span className="text-slate-500">{k}</span>
    <span className="text-right font-medium text-slate-800">{v ?? "No data available"}</span>
  </div>
);

/**
 * ScoutProbePopup — popup body for a graded scout point: TalonFit verdict,
 * Realie parcel record, and the zoning registry citation, with the Save button.
 * Values are shown verbatim — missing data reads "No data available".
 */
export default function ScoutProbePopup({ probe, onSave, canSave, saving, nextLetter }) {
  if (probe.solving) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-slate-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Grading with TalonFit-AI-1.0…
      </div>
    );
  }
  if (probe.error || !probe.solve) {
    return <div className="py-1 text-xs text-red-600">{probe.error || "Solver returned no result."}</div>;
  }

  const s = probe.solve;
  const r = s.calculated_result || {};
  const p = s.parcel || {};
  const d = s.parcel_details || {};
  const o = s.ordinance_rules || {};
  const approved = r.decision === "APPROVED";
  const rejected = r.decision === "REJECTED";
  const hasParcel = Boolean(p.parcel_id || p.address);

  return (
    <div className="space-y-1.5">
      <div
        className={`rounded-md px-2 py-1 text-xs font-bold ${
          approved ? "bg-green-100 text-green-800" : rejected ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
        }`}
      >
        {r.decision || "VERIFY"}
        {Number.isFinite(r.maximum_buildable_height_ft) ? ` · max ${r.maximum_buildable_height_ft} ft` : ""}
      </div>
      {r.binding_constraint && <div className="text-[11px] text-slate-600">Binding: {r.binding_constraint}</div>}

      {/* TalonFit® agent analysis — the WHY behind the numbers */}
      <div className="border-t border-slate-200 pt-1.5">
        <div className="pb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-cyan-700">
          <Sparkles className="h-3 w-3" /> TalonFit® Agent Analysis
        </div>
        {probe.agentThinking ? (
          <div className="flex items-center gap-1.5 py-1 text-[11px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Agent analyzing site…
          </div>
        ) : probe.agentAnalysis ? (
          <div className="max-h-44 overflow-y-auto rounded-md bg-cyan-50/60 px-2 py-1.5 text-[11px] leading-relaxed text-slate-700">
            <ReactMarkdown>{probe.agentAnalysis}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-[10px] text-slate-400">Agent analysis unavailable.</div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-1.5">
        <div className="pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Parcel (Realie)</div>
        <Row k="Address" v={p.address} />
        <Row k="APN" v={p.parcel_id} />
        <Row k="Owner" v={d.owner} />
        <Row k="Acreage" v={Number.isFinite(Number(d.acreage)) ? `${d.acreage} ac` : null} />
        <Row k="Zoning" v={p.zoning_classification} />
        <Row k="Jurisdiction" v={p.jurisdiction} />
      </div>

      <div className="border-t border-slate-200 pt-1.5">
        <div className="pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Zoning registry {o.ordinance_data_verified ? "· verified" : "· unverified"}
        </div>
        <Row k="Height limit" v={Number.isFinite(o.maximum_tower_height_ft) ? `${o.maximum_tower_height_ft} ft` : null} />
        <Row k="Citation" v={o.ordinance_section} />
        {o.ordinance_source_url && (
          <a
            href={o.ordinance_source_url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-cyan-700 underline"
          >
            Ordinance source
          </a>
        )}
      </div>

      {hasParcel ? (
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || saving}
          className="mt-1 w-full rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-800 disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : canSave
            ? `Save as Target ${nextLetter}`
            : "All 3 extra target slots used"}
        </button>
      ) : (
        <div className="text-[11px] text-slate-500">No parcel record at this point — pick another spot.</div>
      )}
    </div>
  );
}