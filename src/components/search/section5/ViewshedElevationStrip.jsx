/**
 * ViewshedElevationStrip — 120px terrain elevation profile along a viewshed's
 * center bearing (Section 5 only).
 *  - X axis: distance from tower (0 → range, ft)
 *  - Y axis: elevation (ft AMSL)
 *  - Tan terrain line + muted-brown filled area below
 *  - Green band = assumed tree-canopy height on top of terrain
 *  - Dashed red horizontal line = tower antenna height (AMSL) → LOS reference
 * Pure SVG from the scipViewshed profile. No network.
 */

const TREE_CANOPY_FT = 40;
const W = 760, H = 120, PAD_L = 44, PAD_B = 18, PAD_T = 8, PAD_R = 8;

export default function ViewshedElevationStrip({ profile, towerHeightFt = 199, color = "#00BFFF" }) {
  const pts = (profile || []).filter((p) => p.ground_ft != null);
  if (pts.length < 2) {
    return (
      <div className="px-4 py-3 border-t border-border bg-[#0C1B2E] text-[11px] font-mono text-white/50">
        Elevation profile unavailable — no USGS samples returned for this corridor.
      </div>
    );
  }

  const maxMi = Math.max(...pts.map((p) => p.dist_mi));
  const baseGround = pts[0].ground_ft ?? 0;
  const antennaAmsl = baseGround + towerHeightFt;

  const grounds = pts.map((p) => p.ground_ft);
  const minEl = Math.min(...grounds);
  const maxEl = Math.max(antennaAmsl, ...grounds.map((g) => g + TREE_CANOPY_FT));
  const span = Math.max(1, maxEl - minEl);

  const x = (mi) => PAD_L + (mi / (maxMi || 1)) * (W - PAD_L - PAD_R);
  const y = (ft) => PAD_T + (1 - (ft - minEl) / span) * (H - PAD_T - PAD_B);

  const terrainLine = pts.map((p) => `${x(p.dist_mi)},${y(p.ground_ft)}`).join(" ");
  const terrainArea = `${PAD_L},${H - PAD_B} ${terrainLine} ${x(maxMi)},${H - PAD_B}`;
  const canopyArea = `${pts.map((p) => `${x(p.dist_mi)},${y(p.ground_ft + TREE_CANOPY_FT)}`).join(" ")} ${pts.slice().reverse().map((p) => `${x(p.dist_mi)},${y(p.ground_ft)}`).join(" ")}`;
  const antY = y(antennaAmsl);

  return (
    <div className="border-t border-border bg-[#0C1B2E]">
      <div className="px-4 pt-2 flex items-center justify-between text-[10px] font-mono text-white/60 uppercase tracking-widest">
        <span>Elevation profile · center bearing</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#C8A26A]" /> Terrain</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-[#2E7D32]/70" /> Canopy</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-red-500" /> Antenna {Math.round(antennaAmsl)}ft</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }} preserveAspectRatio="none">
        {/* Y grid + labels */}
        {[0, 0.5, 1].map((f) => {
          const ft = minEl + f * span;
          const yy = y(ft);
          return (
            <g key={f}>
              <line x1={PAD_L} y1={yy} x2={W - PAD_R} y2={yy} stroke="#ffffff" strokeOpacity="0.08" />
              <text x={PAD_L - 4} y={yy + 3} textAnchor="end" fontSize="8" fill="#ffffff" fillOpacity="0.5" fontFamily="monospace">{Math.round(ft)}</text>
            </g>
          );
        })}
        {/* canopy band (green) */}
        <polygon points={canopyArea} fill="#2E7D32" fillOpacity="0.55" />
        {/* terrain fill (muted brown) + line (tan) */}
        <polygon points={terrainArea} fill="#5C4A33" fillOpacity="0.7" />
        <polyline points={terrainLine} fill="none" stroke="#C8A26A" strokeWidth="2" />
        {/* antenna height dashed red */}
        <line x1={PAD_L} y1={antY} x2={W - PAD_R} y2={antY} stroke="#EF4444" strokeWidth="1.5" strokeDasharray="6 4" />
        {/* X labels */}
        {[0, 0.5, 1].map((f) => {
          const mi = f * maxMi;
          return (
            <text key={f} x={x(mi)} y={H - 5} textAnchor="middle" fontSize="8" fill="#ffffff" fillOpacity="0.5" fontFamily="monospace">
              {Math.round(mi * 5280)} ft
            </text>
          );
        })}
      </svg>
    </div>
  );
}