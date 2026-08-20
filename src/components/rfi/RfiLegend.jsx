import { CARRIERS, CARRIER_COLORS, BAND_RAMP, SIGNAL_RAMP, DEADZONE_COLOR } from "./rfiConfig";
import { GripVertical } from "lucide-react";

// RFI Engine map legend — carrier colors, frequency-band stroke ramp, coverage
// signal-strength ramp, and the dead-zone swatch. Draggable by its header so
// it never blocks the map.
export default function RfiLegend() {
  return (
    <div className="w-60 rounded-xl border border-white/10 bg-slate-900/85 backdrop-blur text-white p-3 space-y-3 text-xs shadow-2xl">
      <div
        data-drag-handle
        className="flex items-center gap-1.5 font-heading font-bold text-[11px] tracking-wide uppercase text-white/70 cursor-grab active:cursor-grabbing select-none"
      >
        <GripVertical className="h-3 w-3 opacity-50" />
        Legend
      </div>

      <div>
        <div className="font-heading font-bold text-[11px] tracking-wide uppercase text-white/70 mb-1.5">Carrier (tower fill)</div>
        <div className="grid grid-cols-2 gap-1">
          {CARRIERS.map((c) => (
            <div key={c.code} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border border-white/40" style={{ background: CARRIER_COLORS[c.code] }} />
              <span className="truncate">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="font-heading font-bold text-[11px] tracking-wide uppercase text-white/70 mb-1.5">Band (tower ring)</div>
        <div className="space-y-1">
          {BAND_RAMP.map((b) => (
            <div key={b.label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: b.color, background: "transparent" }} />
              <span>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="font-heading font-bold text-[11px] tracking-wide uppercase text-white/70 mb-1.5">Coverage signal</div>
        <div className="flex h-3 rounded overflow-hidden border border-white/20">
          {SIGNAL_RAMP.map((s) => (
            <div key={s.dbm} className="flex-1" style={{ background: s.color }} title={s.label} />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-white/50 mt-0.5">
          <span>-120</span><span>weak → strong</span><span>-80</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded" style={{ background: DEADZONE_COLOR, opacity: 0.7 }} />
        <span>Dead zone (no service)</span>
      </div>
    </div>
  );
}