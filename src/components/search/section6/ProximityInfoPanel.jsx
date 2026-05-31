/**
 * ProximityInfoPanel — glass-morphism overlay summarizing the proximity result
 * (airport or cell tower) for a Section 6 map. Mirrors the Section 5 stats card
 * style: dark glass, brand-green accent, monospace metrics.
 *
 * `rows` = [{ label, value }]; `title` = destination headline; `distMi` is shown
 * as a prominent mi + ft badge at the top.
 */

const BRAND_GREEN = "#628C83";

export default function ProximityInfoPanel({ kicker, title, distMi, rows = [] }) {
  const ft = Number.isFinite(distMi) ? Math.round(distMi * 5280).toLocaleString() : null;
  return (
    <div className="w-60 rounded-xl border border-white/15 bg-black/55 backdrop-blur-md text-white shadow-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10" style={{ background: `${BRAND_GREEN}cc` }}>
        <div className="text-[9px] font-mono tracking-[0.3em] opacity-80">{kicker}</div>
        <div className="font-heading font-bold text-sm leading-tight truncate">{title}</div>
      </div>
      {ft != null && (
        <div className="px-3 py-2 border-b border-white/10 flex items-baseline gap-1.5">
          <span className="font-heading font-extrabold text-xl tabular-nums">{distMi.toFixed(2)}</span>
          <span className="text-[11px] font-mono opacity-70">mi</span>
          <span className="text-[11px] font-mono opacity-50 ml-1">· {ft} ft</span>
        </div>
      )}
      <div className="px-3 py-2 space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start justify-between gap-2 text-[11px]">
            <span className="font-mono opacity-60 shrink-0">{r.label}</span>
            <span className="font-mono text-right break-words">{r.value ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}