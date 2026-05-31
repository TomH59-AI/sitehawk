// Section 8 — dBm coverage color scale legend (CloudRF RSRP/RSSI thresholds).
const BANDS = [
  { label: "Excellent", range: "≥ -85 dBm", color: "#22c55e" },
  { label: "Good", range: "-85 to -95", color: "#a3e635" },
  { label: "Fair", range: "-95 to -105", color: "#facc15" },
  { label: "Poor", range: "-105 to -115", color: "#f97316" },
  { label: "None", range: "< -115", color: "#ef4444" },
];

export default function PropagationLegend() {
  return (
    <div className="rounded-lg bg-[#0C1B2E]/90 backdrop-blur border border-[#628C83]/40 p-2.5 text-white">
      <div className="text-[10px] font-mono tracking-[0.2em] text-[#628C83] mb-1.5">SIGNAL · dBm</div>
      <div className="space-y-1">
        {BANDS.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-3.5 h-3.5 rounded-sm" style={{ background: b.color }} />
            <span className="font-semibold w-16">{b.label}</span>
            <span className="text-white/60 font-mono text-[10px]">{b.range}</span>
          </div>
        ))}
      </div>
    </div>
  );
}