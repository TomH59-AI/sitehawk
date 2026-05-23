/**
 * HeadlineMapSidebar — parcel info panel that sits next to the satellite map.
 *
 * Shows the SARF waypoint center (always) plus the selected candidate's core
 * parcel data so the user can read it without scrolling away from the map.
 * Falls back to the highest-scoring candidate when nothing is selected yet.
 */

function Row({ label, value, mono = true, highlight = false }) {
  const has = value != null && value !== "" && value !== "—";
  return (
    <div className="flex flex-col py-1.5 border-b border-[#1e293b] last:border-b-0">
      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">
        {label}
      </span>
      <span
        className={`text-[12.5px] leading-snug ${mono ? "font-mono" : ""} ${
          has ? (highlight ? "text-cyan-300 font-semibold" : "text-slate-100") : "text-slate-600 italic"
        }`}
      >
        {has ? value : "—"}
      </span>
    </div>
  );
}

export default function HeadlineMapSidebar({ searchCenter, candidate, rank }) {
  const fmtCoord = (n) => (Number.isFinite(n) ? n.toFixed(6) : "—");

  return (
    <div className="w-full md:w-[320px] flex-shrink-0 bg-[#0a0e17] border-l border-[#1e293b] overflow-y-auto text-slate-200">
      {/* SARF waypoint header */}
      <div className="px-4 py-3 bg-gradient-to-br from-[#0C1B2E] to-[#1e3a6e] border-b border-[#1e293b]">
        <div className="text-[10px] font-mono font-bold tracking-[0.15em] text-cyan-300 mb-1">
          🦅 SARF WAYPOINT CENTER
        </div>
        <div className="font-mono text-[12px] text-white">
          {fmtCoord(searchCenter?.lat)}, {fmtCoord(searchCenter?.lon)}
        </div>
      </div>

      {/* Parcel info */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono font-bold tracking-[0.15em] text-cyan-400">
            📍 PARCEL INFO
          </span>
          {rank != null && (
            <span className="bg-cyan-400 text-[#0a0e17] text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
              #{rank}
            </span>
          )}
        </div>

        {!candidate ? (
          <div className="text-[12px] text-slate-500 italic py-4">
            Click a pin on the map (or a card in the list) to load parcel details.
          </div>
        ) : (
          <>
            <Row label="Owner's Name" value={candidate.owner_name} mono={false} highlight />
            <Row label="Parcel Address" value={candidate.parcel_address} mono={false} />
            <Row label="Parcel ID" value={candidate.parcel_id} />
            <Row
              label="Parcel Size (acres)"
              value={candidate.parcel_size_acres != null ? `${candidate.parcel_size_acres} ac` : null}
            />
            <Row label="Zoning Classification" value={candidate.zoning_classification} highlight />
            <Row
              label="Owner's Mailing Address"
              value={candidate.owner_mailing_address}
              mono={false}
            />
            <Row label="Latitude" value={fmtCoord(candidate.latitude)} />
            <Row label="Longitude" value={fmtCoord(candidate.longitude)} />
            <Row label="FEMA Risk Factor" value={candidate.fema_risk_factor} highlight />
            <Row label="Phone" value={candidate.phone} />
          </>
        )}
      </div>
    </div>
  );
}