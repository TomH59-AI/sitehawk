import { Loader2, CheckCircle2, XCircle, AlertTriangle, MapPin, ScrollText } from "lucide-react";

const verdictConfig = (decision) => {
  if (decision === "APPROVED") return { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", Icon: CheckCircle2, label: "APPROVED" };
  if (decision === "REJECTED") return { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: XCircle, label: "REJECTED" };
  return { color: "#d97706", bg: "#fffbeb", border: "#fde68a", Icon: AlertTriangle, label: "VERIFY" };
};

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-2 text-[11px] leading-tight">
    <span className="text-slate-500">{k}</span>
    <span className="text-right font-medium text-slate-800">{v ?? "No data available"}</span>
  </div>
);

/**
 * SmartCursorTooltip — floating tooltip that follows the cursor and shows the
 * full TalonFit verdict: the equation breakdown, parcel record, and zoning
 * registry citation. Rendered as a sibling of the Leaflet map, positioned via
 * the pixel coordinates captured in SmartCursor's mousemove handler.
 */
export default function SmartCursorTooltip({ hover, mapWidth = 480 }) {
  if (!hover) return null;
  const { px, solving, result, error } = hover;

  // Flip the tooltip to the left of the cursor when near the right edge.
  const flip = px && px.x > mapWidth - 300;
  const style = {
    position: "absolute",
    left: px?.x ?? 0,
    top: px?.y ?? 0,
    transform: flip ? "translate(calc(-100% - 16px), -50%)" : "translate(16px, -50%)",
    zIndex: 1000,
    pointerEvents: "none",
  };

  if (solving) {
    return (
      <div style={style} className="flex items-center gap-2 rounded-lg border border-cyan-300 bg-white/95 px-3 py-2 text-xs font-semibold text-cyan-700 shadow-2xl backdrop-blur">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running TalonFit-AI-1.0…
      </div>
    );
  }

  if (error || !result) {
    return (
      <div style={style} className="rounded-lg border border-red-300 bg-white/95 px-3 py-2 text-xs font-medium text-red-600 shadow-2xl backdrop-blur">
        {error || "No data available — solver returned no result."}
      </div>
    );
  }

  const r = result.calculated_result || {};
  const p = result.parcel || {};
  const d = result.parcel_details || {};
  const o = result.ordinance_rules || {};
  const cfg = verdictConfig(r.decision);
  const { Icon } = cfg;
  const plr = o.property_line_rule || {};
  const pe = o.pe_policy || {};
  const maxH = r.maximum_buildable_height_ft;
  const jMax = o.maximum_tower_height_ft;
  const setback = plr.fixed_distance_ft;
  const mult = plr.height_multiplier;
  const peReduced = pe.reduction_allowed === true && pe.pe_multiplier != null && pe.pe_multiplier < (mult ?? 1);
  const mEff = peReduced ? pe.pe_multiplier : mult;

  return (
    <div style={style} className="w-72 rounded-xl border border-slate-200 bg-white shadow-2xl">
      {/* Verdict header */}
      <div style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }} className="flex items-center gap-1.5 rounded-t-xl border-b px-3 py-2 text-xs font-bold">
        <Icon className="h-4 w-4" /> {cfg.label}
        {Number.isFinite(maxH) ? <span className="ml-auto">max {maxH} ft</span> : null}
      </div>

      <div className="space-y-2 px-3 py-2">
        {r.binding_constraint && (
          <div className="text-[11px] font-medium text-slate-600">
            <span className="text-slate-400">Binding: </span>{r.binding_constraint}
          </div>
        )}

        {/* TalonFit equation */}
        <div className="rounded-md bg-slate-50 px-2 py-1.5">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">TalonFit™ Equation</div>
          <div className="font-mono text-[10px] leading-relaxed text-slate-700">
            H_MAX = MAX(0, MIN(<br />
            <span className="pl-2">Jurisdiction cap: {jMax != null ? `${jMax} ft` : "—"}</span><br />
            <span className="pl-2">(PropLine − {setback != null ? `${setback} ft` : "setback"}) ÷ m_eff</span><br />
            <span className="pl-2">m_eff = {peReduced ? "PE " : ""}{Number.isFinite(mEff) ? mEff : "—"}</span><br />
            )) = <span className="font-bold" style={{ color: cfg.color }}>{maxH ?? "—"} ft</span>
          </div>
        </div>

        {/* Parcel */}
        <div className="border-t border-slate-100 pt-1.5">
          <div className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <MapPin className="h-3 w-3" /> Parcel (Realie)
          </div>
          <Row k="Address" v={p.address} />
          <Row k="APN" v={p.parcel_id} />
          <Row k="Owner" v={d.owner} />
          <Row k="Acreage" v={Number.isFinite(Number(d.acreage)) ? `${d.acreage} ac` : null} />
          <Row k="Zoning" v={p.zoning_classification} />
        </div>

        {/* Zoning registry */}
        <div className="border-t border-slate-100 pt-1.5">
          <div className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <ScrollText className="h-3 w-3" /> Zoning {o.ordinance_data_verified ? "✓ verified" : "⚠ unverified"}
          </div>
          <Row k="Height limit" v={Number.isFinite(jMax) ? `${jMax} ft` : null} />
          <Row k="Citation" v={o.ordinance_section} />
          <Row k="PE reduction" v={pe.reduction_allowed === true ? "Allowed" : pe.reduction_allowed === false ? "Not allowed" : null} />
          {o.ordinance_source_url && (
            <a href={o.ordinance_source_url} target="_blank" rel="noreferrer" className="mt-0.5 block text-[10px] text-cyan-700 underline">
              Ordinance source
            </a>
          )}
        </div>

        {r.missing_information?.length > 0 && (
          <div className="border-t border-slate-100 pt-1.5 text-[10px] text-amber-600">
            ⚠ Missing: {r.missing_information.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}