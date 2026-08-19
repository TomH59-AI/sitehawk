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
  environmentalData,
}) {
  const hazardBand = environmentalData?.hazard?.band;
  const hazardTone = {
    "VERY LOW": "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    LOW: "border-green-400/25 bg-green-400/10 text-green-200",
    MODERATE: "border-yellow-400/25 bg-yellow-400/10 text-yellow-200",
    HIGH: "border-orange-400/25 bg-orange-400/10 text-orange-200",
    SEVERE: "border-red-400/25 bg-red-400/10 text-red-200",
  }[hazardBand] || "border-white/15 bg-white/5 text-white/75";

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
          <Chip active={layers.oeaaa} onClick={() => setLayers((l) => ({ ...l, oeaaa: !l.oeaaa }))} color="#d946ef">FAA OE/AAA</Chip>
          <Chip active={layers.environmental} onClick={() => setLayers((l) => ({ ...l, environmental: !l.environmental }))} color="#0f766e">Environmental Intelligence</Chip>
        </div>
        {layers.environmental && (
          <div className="mt-2 rounded-lg border border-teal-400/20 bg-teal-400/5 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-teal-200/90">
              Environmental Intelligence
            </div>
            {environmentalData?.hazard && (
              <div className={`mt-1.5 rounded-md border px-2 py-1.5 ${hazardTone}`}>
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span>{hazardBand} RISK</span>
                  <span>{environmentalData.hazard.score} / 100</span>
                </div>
                {environmentalData.hazard.provisional && (
                  <div className="mt-0.5 text-[8px] font-medium uppercase tracking-wide opacity-70">
                    Provisional · one or more federal sources unavailable
                  </div>
                )}
                {environmentalData.hazard.reasons?.length > 0 && (
                  <p className="mt-1 text-[9px] leading-snug opacity-80">
                    {environmentalData.hazard.reasons.join("; ")}.
                  </p>
                )}
              </div>
            )}
            {!environmentalData?.hazard && (
              <p className="mt-1 text-[10px] leading-snug text-white/50">
                Loading a 3-mile screening radius at the map center…
              </p>
            )}
            <div className="mt-2 space-y-1.5 text-[9px] leading-tight text-white/60">
              <div>
                <div className="font-semibold text-white/80">Wetlands · USFWS NWI</div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span><i className="mr-1 inline-block h-2 w-2 bg-[#00b3b3]" />Emergent</span>
                  <span><i className="mr-1 inline-block h-2 w-2 bg-[#008080]" />Forested</span>
                  <span><i className="mr-1 inline-block h-2 w-2 bg-[#3399ff]" />Estuarine</span>
                  <span><i className="mr-1 inline-block h-2 w-2 bg-[#0066cc]" />Marine</span>
                  <span><i className="mr-1 inline-block h-2 w-2 bg-[#66ccff]" />Riverine</span>
                  <span><i className="mr-1 inline-block h-2 w-2 bg-[#99ddff]" />Lacustrine</span>
                </div>
              </div>
              <div>
                <div className="font-semibold text-white/80">Hydrology · USGS NHD</div>
                <div className="mt-0.5"><i className="mr-1 inline-block h-0.5 w-3 bg-[#0066cc] align-middle" />Rivers, streams, lakes, ponds &amp; water bodies</div>
              </div>
              <div>
                <div className="font-semibold text-white/80">Flood Zones · FEMA NFHL</div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span><i className="mr-1 inline-block h-2 w-2 bg-[#ff6666]" />A</span>
                  <span><i className="mr-1 inline-block h-2 w-2 bg-[#ff3333]" />AE</span>
                  <span><i className="mr-1 inline-block h-2 w-2 bg-[#cc0000]" />VE</span>
                  <span><i className="mr-1 inline-block h-2 w-2 bg-[#ffcc99]" />X</span>
                </div>
              </div>
            </div>
            {environmentalData?.metadata?.counts && (
              <div className="mt-2 border-t border-white/10 pt-1.5 text-[9px] text-white/45">
                {environmentalData.metadata.counts.wetlands} wetlands · {environmentalData.metadata.counts.hydrology} water features · {environmentalData.metadata.counts.floodZones} flood polygons
              </div>
            )}
            <p className="mt-1.5 text-[9px] leading-snug text-amber-100/60">
              Preliminary screening only—not a jurisdictional or permitting determination.
            </p>
          </div>
        )}
        {layers.oeaaa && (
          <div className="mt-2 rounded-lg border border-fuchsia-400/20 bg-fuchsia-400/5 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-fuchsia-200/80">
              FAA Part 77 screening
            </div>
            <p className="mt-1 text-[10px] leading-snug text-white/50">
              Screens a 3-mile radius at the map center. Magenta shows generalized notice-criteria areas; red shows intersections. Screening only—not an FAA determination.
            </p>
          </div>
        )}
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
        Coverage &amp; dead zones are modeled on demand (CloudRF). Towers, Copernicus, FAA screening, and environmental intelligence follow the visible area.
      </p>
    </div>
  );
}