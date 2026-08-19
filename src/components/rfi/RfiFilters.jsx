import { CARRIERS, BANDS, TECHNOLOGIES } from "./rfiConfig";

const SATELLITE_MODES = [
  { code: "true_color", label: "True Color" },
  { code: "ndvi", label: "NDVI" },
  { code: "swir", label: "SWIR" },
  { code: "sar", label: "S1 SAR" },
];

// RFI Engine filter controls — carrier / band / technology selectors + layer
// visibility toggles for towers, coverage, and dead zones. Rendered inside the
// left control panel (no map-overlay positioning of its own).
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

export default function RfiFilters({
  filters, setFilters, layers, setLayers, onDrawCoverage, drawing,
  satelliteMode, setSatelliteMode,
}) {
  const toggleSet = (key, val) => {
    setFilters((f) => {
      const next = new Set(f[key]);
      next.has(val) ? next.delete(val) : next.add(val);
      return { ...f, [key]: next };
    });
  };

  return (
    <div className="space-y-3 text-xs text-white">
      <div>
        <div className="font-heading font-bold text-[11px] tracking-wide uppercase text-white/70 mb-1.5">Layers</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={layers.towers} onClick={() => setLayers((l) => ({ ...l, towers: !l.towers }))} color="#0ea5e9">Towers</Chip>
          <Chip active={layers.coverage} onClick={() => setLayers((l) => ({ ...l, coverage: !l.coverage }))} color="#22c55e">Coverage</Chip>
          <Chip active={layers.deadzones} onClick={() => setLayers((l) => ({ ...l, deadzones: !l.deadzones }))} color="#64748b">Dead Zones</Chip>
          <Chip active={layers.copernicus} onClick={() => setLayers((l) => ({ ...l, copernicus: !l.copernicus }))} color="#06b6d4">Copernicus</Chip>
        </div>
        {layers.copernicus && (
          <div className="mt-2 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-2">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200/80">
              Satellite rendering
            </div>
            <div className="flex flex-wrap gap-1">
              {SATELLITE_MODES.map((mode) => (
                <Chip
                  key={mode.code}
                  active={satelliteMode === mode.code}
                  onClick={() => setSatelliteMode(mode.code)}
                  color="#0891b2"
                >
                  {mode.label}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-white/40">
              Updates after the map stops moving. Zoom 7+ for useful imagery.
            </p>
          </div>
        )}
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
        Coverage &amp; dead zones are modeled on demand (CloudRF). Towers and optional Copernicus satellite context follow the visible area.
      </p>
    </div>
  );
}