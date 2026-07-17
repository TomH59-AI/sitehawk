import { CARRIERS, BANDS, TECHNOLOGIES } from "./rfiConfig";

// RFI Engine filter panel — carrier / band / technology selectors + layer
// visibility toggles for towers, coverage, and dead zones.
function Chip({ active, onClick, children, color }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
      style={
        active
          ? { background: color || "#fff", color: color ? "#fff" : "#0f172a", borderColor: color || "#fff" }
          : { background: "transparent", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.25)" }
      }
    >
      {children}
    </button>
  );
}

export default function RfiFilters({ filters, setFilters, layers, setLayers, onDrawCoverage, drawing }) {
  const toggleSet = (key, val) => {
    setFilters((f) => {
      const next = new Set(f[key]);
      next.has(val) ? next.delete(val) : next.add(val);
      return { ...f, [key]: next };
    });
  };

  return (
    <div className="absolute top-4 right-4 z-10 w-72 rounded-xl border border-white/10 bg-slate-900/85 backdrop-blur text-white p-3 space-y-3 text-xs shadow-2xl">
      <div>
        <div className="font-heading font-bold text-[11px] tracking-wide uppercase text-white/70 mb-1.5">Layers</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={layers.towers} onClick={() => setLayers((l) => ({ ...l, towers: !l.towers }))} color="#0ea5e9">Towers</Chip>
          <Chip active={layers.coverage} onClick={() => setLayers((l) => ({ ...l, coverage: !l.coverage }))} color="#22c55e">Coverage</Chip>
          <Chip active={layers.deadzones} onClick={() => setLayers((l) => ({ ...l, deadzones: !l.deadzones }))} color="#64748b">Dead Zones</Chip>
        </div>
      </div>

      <div>
        <div className="font-heading font-bold text-[11px] tracking-wide uppercase text-white/70 mb-1.5">Carrier</div>
        <div className="flex flex-wrap gap-1.5">
          {CARRIERS.map((c) => (
            <Chip key={c.code} active={filters.carriers.has(c.code)} onClick={() => toggleSet("carriers", c.code)}>{c.label}</Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="font-heading font-bold text-[11px] tracking-wide uppercase text-white/70 mb-1.5">Band</div>
        <div className="flex flex-wrap gap-1.5">
          {BANDS.map((b) => (
            <Chip key={b.code} active={filters.bands.has(b.code)} onClick={() => toggleSet("bands", b.code)}>{b.code}</Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="font-heading font-bold text-[11px] tracking-wide uppercase text-white/70 mb-1.5">Technology</div>
        <div className="flex flex-wrap gap-1.5">
          {TECHNOLOGIES.map((t) => (
            <Chip key={t} active={filters.techs.has(t)} onClick={() => toggleSet("techs", t)}>{t}</Chip>
          ))}
        </div>
      </div>

      <button
        onClick={onDrawCoverage}
        disabled={drawing}
        className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs transition-colors"
      >
        {drawing ? "Modeling coverage…" : "Model coverage at map center"}
      </button>
      <p className="text-[10px] text-white/40 leading-snug">
        Coverage &amp; dead zones are modeled on demand (CloudRF) for the current map center. Towers load live for the visible area.
      </p>
    </div>
  );
}