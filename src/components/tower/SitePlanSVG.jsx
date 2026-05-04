// Engineering-style site plan SVG: parcel boundary, setback envelope, valid zone,
// fall zone circle, compound, access easement, and labels.

export default function SitePlanSVG({ analysis, parcel }) {
  if (!analysis?.ok) return null;
  const { parcelDims, validZone, placement, setbackFt, compoundSizeFt, accessEasement, accessPreference, towerHeightFt } = analysis;
  const { extents } = parcelDims;

  const pad = 60;
  const minX = extents.minX - pad, maxX = extents.maxX + pad;
  const minY = extents.minY - pad, maxY = extents.maxY + pad;
  const widthFt = maxX - minX, depthFt = maxY - minY;
  const targetW = 700;
  const scale = targetW / widthFt;
  const w = targetW;
  const h = depthFt * scale;

  const tx = (x) => (x - minX) * scale;
  const ty = (y) => (maxY - y) * scale;

  const ringPts = parcelDims.points.map(p => `${tx(p.x_ft)},${ty(p.y_ft)}`).join(" ");
  const sbX1 = tx(extents.minX + setbackFt);
  const sbX2 = tx(extents.maxX - setbackFt);
  const sbY1 = ty(extents.maxY - setbackFt);
  const sbY2 = ty(extents.minY + setbackFt);

  const tBaseX = tx(placement.x_ft);
  const tBaseY = ty(placement.y_ft);
  const fallR = setbackFt * scale;
  const compHalf = (compoundSizeFt / 2) * scale;

  let easementRect = null;
  const halfCompFt = compoundSizeFt / 2;
  if (accessPreference?.includes("north")) {
    easementRect = { x: tx(placement.x_ft - 6), y: ty(extents.maxY), w: 12 * scale, h: ty(placement.y_ft + halfCompFt) - ty(extents.maxY) };
  } else if (accessPreference?.includes("south")) {
    easementRect = { x: tx(placement.x_ft - 6), y: ty(placement.y_ft - halfCompFt), w: 12 * scale, h: ty(extents.minY) - ty(placement.y_ft - halfCompFt) };
  } else if (accessPreference?.includes("east")) {
    easementRect = { x: tx(placement.x_ft + halfCompFt), y: ty(placement.y_ft + 6), w: tx(extents.maxX) - tx(placement.x_ft + halfCompFt), h: 12 * scale };
  } else if (accessPreference?.includes("west")) {
    easementRect = { x: tx(extents.minX), y: ty(placement.y_ft + 6), w: tx(placement.x_ft - halfCompFt) - tx(extents.minX), h: 12 * scale };
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-semibold text-sm text-foreground">Site Plan — Recommended Tower Placement</h3>
        <span className="text-[10px] text-muted-foreground">Scale: 1 px ≈ {(1 / scale).toFixed(1)} ft · North ↑</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" style={{ background: "#f8fafc" }}>
        <polygon points={ringPts} fill="#e2e8f0" stroke="#0f172a" strokeWidth="2" />
        {validZone.valid && (
          <rect x={sbX1} y={sbY1} width={sbX2 - sbX1} height={sbY2 - sbY1} fill="rgba(239,68,68,0.06)" stroke="#ef4444" strokeWidth="1.2" strokeDasharray="6,4" />
        )}
        {validZone.valid && (
          <rect x={sbX1} y={sbY1} width={sbX2 - sbX1} height={sbY2 - sbY1} fill="rgba(34,197,94,0.10)" stroke="#22c55e" strokeWidth="1" />
        )}
        {easementRect && (
          <rect x={easementRect.x} y={easementRect.y} width={easementRect.w} height={easementRect.h} fill="rgba(234,179,8,0.5)" stroke="#a16207" strokeWidth="1" />
        )}
        <circle cx={tBaseX} cy={tBaseY} r={fallR} fill="rgba(249,115,22,0.10)" stroke="#f97316" strokeWidth="1.2" strokeDasharray="4,3" />
        <rect x={tBaseX - compHalf} y={tBaseY - compHalf} width={compHalf * 2} height={compHalf * 2} fill="rgba(14,165,233,0.25)" stroke="#0284c7" strokeWidth="1.5" />
        <circle cx={tBaseX} cy={tBaseY} r="6" fill="#dc2626" stroke="#fff" strokeWidth="1.5" />
        <g transform={`translate(${w - 50}, 30)`}>
          <circle r="18" fill="#fff" stroke="#0f172a" strokeWidth="1" />
          <text textAnchor="middle" y="5" fontSize="14" fontWeight="700" fill="#0f172a">N</text>
        </g>
        <text x={tBaseX + 10} y={tBaseY - 10} fontSize="10" fontWeight="700" fill="#dc2626">{towerHeightFt}ft Tower</text>
        <text x={(tx(extents.minX) + tx(extents.maxX)) / 2} y={ty(extents.maxY) - 8} textAnchor="middle" fontSize="10" fill="#0f172a" fontWeight="600">
          {Math.round(extents.maxX - extents.minX)} ft (E-W)
        </text>
        <text x={tx(extents.minX) - 12} y={(ty(extents.minY) + ty(extents.maxY)) / 2} textAnchor="middle" fontSize="10" fill="#0f172a" fontWeight="600"
          transform={`rotate(-90, ${tx(extents.minX) - 12}, ${(ty(extents.minY) + ty(extents.maxY)) / 2})`}>
          {Math.round(extents.maxY - extents.minY)} ft (N-S)
        </text>
      </svg>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
        <LegendDot color="#dc2626" label={`Tower base (${towerHeightFt}ft)`} />
        <LegendDot color="#0284c7" label={`${compoundSizeFt}'×${compoundSizeFt}' compound`} />
        <LegendDot color="#f97316" label={`${setbackFt}ft fall zone`} />
        <LegendDot color="#ef4444" label="Setback boundary" dashed />
        <LegendDot color="#22c55e" label="Valid placement zone" />
        <LegendDot color="#a16207" label="12ft access easement" />
      </div>

      {parcel && (
        <div className="mt-3 pt-3 border-t border-border text-[10px] text-muted-foreground">
          <div className="font-mono">
            Tower base coords: {placement.lat.toFixed(6)}°, {placement.lon.toFixed(6)}° · WGS84
            {accessEasement?.lengthFt > 0 && <span> · Easement: 12ft × {Math.round(accessEasement.lengthFt)}ft</span>}
          </div>
          <div className="mt-1 italic">⚠ Field survey required to confirm coordinates within ±5 m.</div>
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label, dashed }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color + "40", border: `1.5px ${dashed ? "dashed" : "solid"} ${color}` }} />
      <span className="text-foreground">{label}</span>
    </div>
  );
}