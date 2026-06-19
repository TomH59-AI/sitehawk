/**
 * BusProbePanel — TEMPORARY runtime probe for the SiteHawk data bus.
 * Renders the live `sectionData` object on-screen and tells you which of the
 * expected emits have fired vs. are still missing. Admin-only. Remove this
 * component (and its usage in pages/SiteSearch) once the scorecard is wired.
 */
const EXPECTED = [
  ["zoning", "Section 2 · Zoning"],
  ["parcelFit", "Section 3 · Parcel fit"],
  ["fema", "Section 4 · FEMA flood"],
  ["zoneomicsDistrict", "Section 4 · Zoning district"],
  ["wetlands", "Wetlands (score-only)"],
  ["airport", "Section 6 · Airport"],
  ["tower", "Section 6 · Cell tower"],
  ["wind", "Section 6 · Wind"],
  ["fiber", "Section 7 · Fiber"],
  ["carriers", "Section 7 · Carriers"],
  ["propagation", "Section 8 · Propagation"],
];

export default function BusProbePanel({ sectionData }) {
  const keys = Object.keys(sectionData || {});
  return (
    <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/60 dark:bg-amber-950/20 overflow-hidden">
      <div className="px-4 py-2.5 bg-amber-400/20 border-b border-amber-300/60 flex items-center justify-between">
        <div className="font-mono text-[11px] tracking-[0.25em] text-amber-800 dark:text-amber-200 font-bold">
          🔬 BUS PROBE · sectionData (TEMP — remove before launch)
        </div>
        <div className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
          {keys.length}/{EXPECTED.length} keys populated
        </div>
      </div>

      {/* Checklist — which emits have fired */}
      <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        {EXPECTED.map(([key, label]) => {
          const fired = key in (sectionData || {});
          return (
            <div key={key} className="flex items-center gap-2 font-mono">
              <span>{fired ? "✅" : "⬜"}</span>
              <span className={fired ? "text-foreground" : "text-muted-foreground"}>{label}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{key}</span>
            </div>
          );
        })}
      </div>

      {/* Raw dump */}
      <pre className="px-4 py-3 m-0 text-[11px] leading-relaxed bg-slate-900 text-emerald-200 overflow-x-auto max-h-80 font-mono">
        {JSON.stringify(sectionData || {}, null, 2)}
      </pre>
    </div>
  );
}