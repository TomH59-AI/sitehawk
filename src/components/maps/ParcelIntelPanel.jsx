const Row = ({ label, value }) => (
  <div className="grid grid-cols-[120px_1fr] gap-2 border-t border-slate-800 py-1.5 text-xs">
    <dt className="text-slate-500">{label}</dt>
    <dd className="break-words text-slate-200">{value ?? "—"}</dd>
  </div>
);

export default function ParcelIntelPanel({ intel, onClose }) {
  if (!intel) return null;
  const d = intel.data;
  const fiberText = d?.fiber?.status === "ok"
    ? `${d.fiber.provider} — ${d.fiber.distance_miles} mi`
    : d?.fiber?.status === "not_initialized" ? "Fiber database not initialized"
    : d?.fiber?.status === "no_routes_in_range" ? "None within ~35 mi"
    : "—";

  return (
    <section className="absolute bottom-8 right-4 z-20 w-80 max-w-[calc(100vw-32px)] rounded-2xl border border-emerald-500/30 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
      <button type="button" onClick={onClose} className="float-right text-slate-500 hover:text-white">×</button>
      <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Parcel intelligence</div>
      <h2 className="mt-1 pr-6 text-sm font-bold text-white">
        {intel.lat.toFixed(5)}, {intel.lon.toFixed(5)}
      </h2>

      {intel.loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          Sampling GIS layers…
        </div>
      ) : intel.error ? (
        <div className="mt-3 rounded-lg bg-red-950/60 px-2 py-1.5 text-[11px] text-red-300">{intel.error}</div>
      ) : d ? (
        <dl className="mt-3 max-h-72 overflow-y-auto">
          <Row label="Zoning" value={d.zoning?.code ? `${d.zoning.code}${d.zoning.name ? ` — ${d.zoning.name}` : ""}` : null} />
          <Row label="Jurisdiction" value={d.zoning?.jurisdiction} />
          <Row label="Utility" value={d.utility?.name ? `${d.utility.name}${d.utility.type ? ` (${d.utility.type})` : ""}` : null} />
          <Row label="Nearest fiber" value={fiberText} />
          <Row label="Flood zone" value={d.flood?.zone ? `${d.flood.zone}${d.flood.sfha ? " (SFHA)" : ""}` : null} />
          <Row label="Elevation" value={d.elevation_ft != null ? `${d.elevation_ft} ft AMSL` : null} />
          <Row label="Slope" value={d.slope_percent != null ? `${d.slope_percent}%` : null} />
          <Row label="Land cover" value={d.land_cover?.label} />
          <Row label="Impervious" value={d.impervious_percent != null ? `${d.impervious_percent}%` : null} />
          <Row label="Soil" value={d.soil?.name ? `${d.soil.symbol ? `${d.soil.symbol} — ` : ""}${d.soil.name}` : null} />
        </dl>
      ) : null}
    </section>
  );
}