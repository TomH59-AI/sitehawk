/**
 * CoverageLegend — small legend overlay shown on the Coverage Analysis map
 * once an RF simulation overlay is rendered. Buckets follow CloudRF's
 * RAINBOW.dBm scale (excellent → poor).
 */

export default function CoverageLegend({ visible }) {
  if (!visible) return null;
  const items = [
    { color: "#16a34a", label: "Excellent  (> -70 dBm)" },
    { color: "#84cc16", label: "Good  (-70 to -85 dBm)" },
    { color: "#eab308", label: "Fair  (-85 to -95 dBm)" },
    { color: "#f97316", label: "Marginal  (-95 to -105 dBm)" },
    { color: "#ef4444", label: "Poor  (< -105 dBm)" },
  ];
  return (
    <div className="absolute bottom-3 right-3 bg-black/80 text-white text-[10px] font-mono px-2.5 py-2 rounded space-y-0.5 z-[1]">
      <div className="text-purple-300 mb-1 tracking-wider">SIGNAL STRENGTH</div>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded" style={{ background: it.color }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}