import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-3 text-[11px]">
    <span className="text-slate-500">{k}</span>
    <span className="text-right font-medium text-slate-800">{v ?? "No data available"}</span>
  </div>
);

/**
 * TalonFitPopup — popup body for a graded probe point.
 * Shows the full TalonFit-AI-1.0 verdict: GREEN/RED decision, max buildable
 * height, binding constraint, all computed constraints, parcel data (Realie),
 * and zoning registry citation. Double-click the map to save (up to 3 sites).
 */
export default function TalonFitPopup({ probe, onSave, canSave, saving, nextLetter, hideSave }) {
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
      {/* ── GREEN / RED verdict ── */}
      <div
        className={`rounded-md px-2 py-1 text-xs font-bold ${
          approved ? "bg-green-100 text-green-800" : rejected ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
        }`}
      >
        {r.decision || "VERIFY"}
        {Number.isFinite(r.maximum_buildable_height_ft) ? ` · max ${r.maximum_buildable_height_ft} ft` : ""}
      </div>
      {r.binding_constraint && <div className="text-[11px] text-slate-600">Binding: {r.binding_constraint}</div>}

      {/* ── Computed constraints ── */}
      <div className="border-t border-slate-200 pt-1.5">
        <div className="pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">TalonFit™ Constraints</div>
        <Row k="Lat / Lon" v={probe.lat != null ? `${probe.lat.toFixed(6)}, ${probe.lon.toFixed(6)}` : null} />
        <Row k="Max buildable height" v={Number.isFinite(r.maximum_buildable_height_ft) ? `${r.maximum_buildable_height_ft} ft` : null} />
        <Row k="Effective fall-zone mult" v={Number.isFinite(r.effective_fall_zone_multiplier) ? `${r.effective_fall_zone_multiplier}×` : null} />
        <Row k="Distance to property line" v={Number.isFinite(r.distance_to_property_line_ft) ? `${r.distance_to_property_line_ft} ft` : null} />
        <Row k="Nearest existing tower" v={Number.isFinite(r.distance_to_nearest_existing_tower_ft) ? `${r.distance_to_nearest_existing_tower_ft} ft` : null} />
        <Row k="Nearest external structure" v={Number.isFinite(r.distance_to_nearest_external_structure_ft) ? `${r.distance_to_nearest_external_structure_ft} ft` : null} />
        <Row k="Distance from ring center" v={Number.isFinite(r.distance_from_ring_center_miles) ? `${r.distance_from_ring_center_miles} mi` : null} />
        <Row k="PE letter required" v={r.pe_letter_required != null ? (r.pe_letter_required ? "Yes" : "No") : null} />
      </div>

      {/* ── Reasons / missing info ── */}
      {r.reasons?.length > 0 && (
        <div className="border-t border-slate-200 pt-1.5">
          <div className="pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Reasons</div>
          {r.reasons.map((reason, i) => (
            <div key={i} className="text-[11px] text-slate-700">{reason}</div>
          ))}
        </div>
      )}
      {r.missing_information?.length > 0 && (
        <div className="border-t border-slate-200 pt-1.5">
          <div className="pb-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">Missing / Unconfirmed</div>
          {r.missing_information.map((m, i) => (
            <div key={i} className="text-[10px] text-amber-700">{m}</div>
          ))}
        </div>
      )}

      {/* ── Parcel (Realie) ── */}
      <div className="border-t border-slate-200 pt-1.5">
        <div className="pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Parcel (Realie)</div>
        <Row k="Address" v={p.address} />
        <Row k="APN" v={p.parcel_id} />
        <Row k="Owner" v={d.owner} />
        <Row k="Acreage" v={Number.isFinite(Number(d.acreage)) ? `${d.acreage} ac` : null} />
        <Row k="Zoning" v={p.zoning_classification} />
        <Row k="Jurisdiction" v={p.jurisdiction} />
      </div>

      {/* ── Zoning registry ── */}
      <div className="border-t border-slate-200 pt-1.5">
        <div className="pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Zoning registry {o.ordinance_data_verified ? "· verified" : "· unverified"}
        </div>
        <Row k="Height limit" v={Number.isFinite(o.maximum_tower_height_ft) ? `${o.maximum_tower_height_ft} ft` : null} />
        <Row k="Citation" v={o.ordinance_section} />
        {o.ordinance_source_url && (
          <a href={o.ordinance_source_url} target="_blank" rel="noreferrer" className="text-[11px] text-cyan-700 underline">
            Ordinance source
          </a>
        )}
      </div>

      {/* ── Save button (hidden for auto-selected targets) ── */}
      {!hideSave && hasParcel && (
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || saving}
          className="mt-1 w-full rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : canSave ? `Save as Site ${nextLetter} (double-click)` : "3 sites already saved"}
        </button>
      )}
      {!hideSave && !hasParcel && (
        <div className="text-[11px] text-slate-500">No parcel record at this point — pick another spot.</div>
      )}
    </div>
  );
}