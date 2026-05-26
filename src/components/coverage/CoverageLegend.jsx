/**
 * CoverageLegend — RSRP / signal-strength gradient legend for the
 * CloudRF coverage overlay on CoverageAnalysis.
 */

export default function CoverageLegend({ visible }) {
  if (!visible) return null;
  return (
    <div className="absolute bottom-3 left-3 bg-black/80 text-white rounded-md px-3 py-2 text-[10px] font-mono w-[220px]">
      <div className="font-semibold mb-1 tracking-wider">RF SIGNAL STRENGTH (dBm)</div>
      <div
        className="h-2 rounded"
        style={{
          background:
            "linear-gradient(to right, #1e3a8a, #2563eb, #22d3ee, #22c55e, #facc15, #f97316, #ef4444)",
        }}
      />
      <div className="flex justify-between mt-1 text-[9px]">
        <span>-120</span>
        <span>-100</span>
        <span>-85</span>
        <span>-70</span>
        <span>-50</span>
      </div>
      <div className="text-[9px] mt-1 opacity-70">Weak → Strong</div>
    </div>
  );
}