// Popup body for a TalonFit™ probe pin. Shows only what the solver actually
// returned — a value with no source stays blank and is named as missing, never
// guessed. Ordinance values carry their citation so the subscriber can confirm.
const HEAD = {
  fit: { label: "BUILDABLE", cls: "bg-green-600" },
  ejected: { label: "REJECTED", cls: "bg-red-600" },
  verify: { label: "VERIFY", cls: "bg-amber-600" },
  pending: { label: "CHECKING…", cls: "bg-slate-500" },
};

function Row({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-2 py-[2px]">
      <span className="w-[104px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-[11px] font-medium text-slate-900">{value}</span>
    </div>
  );
}

const ft = (v) => (Number.isFinite(Number(v)) ? `${Number(v)} ft` : null);

export default function ProbePopup({ probe }) {
  const h = HEAD[probe.verdict] || HEAD.pending;
  const p = probe.parcel || {};
  const o = probe.ordinance || {};
  const missing = probe.unverified_fields || [];
  return (
    <div className="w-[290px] font-body">
      <div className={`-mx-3 -mt-3 mb-2 rounded-t px-3 py-2 text-white ${h.cls}`}>
        <div className="text-[12px] font-extrabold tracking-wide">
          {h.label}
          {Number(probe.max_height_ft) > 0 ? ` — ${Number(probe.max_height_ft)} ft max` : ""}
        </div>
        <div className="font-mono text-[10px] opacity-90">
          {probe.lat.toFixed(6)}, {probe.lon.toFixed(6)}
        </div>
      </div>

      {probe.reason && probe.verdict !== "fit" && (
        <p className="mb-2 rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-800">{probe.reason}</p>
      )}

      <Row label="Binding" value={probe.binding_constraint} />
      <Row label="To line" value={ft(probe.edge_distance_ft)} />
      <Row label="To tower" value={ft(probe.distance_to_tower_ft)} />
      <Row label="To structure" value={ft(probe.distance_to_structure_ft)} />

      <div className="mt-2 border-t border-slate-200 pt-1.5">
        <Row label="Address" value={p.address} />
        <Row label="Owner" value={p.owner} />
        <Row label="APN" value={p.apn} />
        <Row label="Acreage" value={p.acreage ? `${p.acreage} ac` : null} />
        <Row label="Zoning" value={p.zoning} />
      </div>

      <div className="mt-2 border-t border-slate-200 pt-1.5">
        <Row label="Jurisdiction" value={o.jurisdiction} />
        <Row label="Height cap" value={ft(o.height_limit_ft)} />
        <Row label="Setback" value={ft(o.setback_ft)} />
        <Row label="Approval" value={o.permit_type} />
        <Row label="Citation" value={o.section_ref} />
        {o.source_url && (
          <a
            href={o.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[11px] font-semibold text-cyan-700 underline"
          >
            Open the ordinance source →
          </a>
        )}
      </div>

      {missing.length > 0 && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium leading-snug text-amber-900">
          Not confirmed from code: {missing.join(", ")}. Verify before filing.
        </p>
      )}
      {probe.verdict === "fit" && (
        <p className="mt-2 text-[10px] font-medium text-slate-500">Double-click this spot to save it as D, E or F.</p>
      )}
    </div>
  );
}