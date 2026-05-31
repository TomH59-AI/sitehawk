/**
 * ViewshedStatsPanel — glass-card RF stats for one direction (Section 5 only).
 * Dark glass, rounded, brand-green accents. Floats over the right side of the map.
 */

import { AlertTriangle } from "lucide-react";

const BEARING_RANGE = {
  N: "315° – 045°", S: "135° – 225°", E: "045° – 135°", W: "225° – 315°",
};

export default function ViewshedStatsPanel({ dir, stats, rangeMiles, towerHeightFt, beamWidth = 90, timestamp }) {
  const s = stats || {};
  return (
    <div className="w-[208px] rounded-xl border border-white/15 bg-black/55 backdrop-blur-md text-white shadow-2xl overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: `${dir.color}22`, borderBottom: `1px solid ${dir.color}55` }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center font-heading font-bold text-lg" style={{ background: dir.color, color: "#0C1B2E" }}>
          {dir.short}
        </div>
        <div className="leading-tight">
          <div className="text-[10px] font-mono tracking-widest text-white/60 uppercase">{dir.label}</div>
          <div className="font-mono text-xs">{BEARING_RANGE[dir.short]}</div>
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-2 text-xs font-mono">
        <Row label="Beam width" value={`${beamWidth}°`} />
        <Row label="Range" value={`${rangeMiles} mi`} />
        <Row label="Tower height" value={`${towerHeightFt} ft AGL`} />

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg bg-white/5 px-2 py-1.5 text-center">
            <div className="text-[9px] text-white/50 uppercase tracking-widest">Clear</div>
            <div className="text-emerald-400 font-heading font-bold text-xl leading-none mt-0.5">{s.pctClear != null ? `${s.pctClear}%` : "—"}</div>
          </div>
          <div className="rounded-lg bg-white/5 px-2 py-1.5 text-center">
            <div className="text-[9px] text-white/50 uppercase tracking-widest">Blocked</div>
            <div className="text-red-400 font-heading font-bold text-xl leading-none mt-0.5">{s.pctObstructed != null ? `${s.pctObstructed}%` : "—"}</div>
          </div>
        </div>

        {s.maxObstructionFt != null && (
          <div className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div className="leading-tight">
              Max obstruction <span className="font-bold">{s.maxObstructionFt} ft AMSL</span>
              {s.maxObstructionMi != null ? ` @ ${s.maxObstructionMi} mi` : ""}
            </div>
          </div>
        )}

        <Row label="Best path loss" value={s.bestPathLossDb != null ? `${s.bestPathLossDb} dB` : "—"} />
        <Row label="Worst path loss" value={s.worstPathLossDb != null ? `${s.worstPathLossDb} dB` : "—"} />
        {timestamp && <div className="text-[9px] text-white/40 pt-1 border-t border-white/10">Run {timestamp}</div>}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/55">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}