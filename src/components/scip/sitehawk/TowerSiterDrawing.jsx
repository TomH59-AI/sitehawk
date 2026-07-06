/* Tower Siter Exhibit — to-scale SVG site plan for the SCIP's final pages.
   Parcel · setbacks · landscaped compound · fenced interior · monopole ·
   fall zone · 20' utility easement · power & fiber tie-in points. */

const W = 740, H = 470;

export default function TowerSiterDrawing({ model, fence, utilities }) {
  const { parcel, envelope: env, compound, fallZone, tower, easement } = model;
  const bbox = parcel.bbox;

  const pad = Math.max(20, fallZone.radius * 0.08);
  const extMinX = Math.min(bbox.minX, tower.x - fallZone.radius) - pad;
  const extMaxX = Math.max(bbox.maxX, tower.x + fallZone.radius) + pad;
  const extMinY = Math.min(bbox.minY, tower.y - fallZone.radius) - pad;
  const extMaxY = Math.max(bbox.maxY, tower.y + fallZone.radius) + pad;
  const margin = 54;
  const scale = Math.min((W - margin * 2) / (extMaxX - extMinX), (H - margin * 2) / (extMaxY - extMinY));
  const ox = (W - (extMaxX - extMinX) * scale) / 2;
  const oy = (H + (extMaxY - extMinY) * scale) / 2;
  const t = (fx, fy) => [ox + (fx - extMinX) * scale, oy - (fy - extMinY) * scale];

  const parcelPath = "M" + parcel.vertices.map(([fx, fy]) => t(fx, fy).join(" ")).join(" L") + " Z";
  const [tpx, tpy] = t(tower.x, tower.y);
  const rPx = fallZone.radius * scale;

  const [e1x, e1y] = env.valid ? t(env.x1, env.y2) : [0, 0];
  const [c1x, c1y] = t(compound.x1, compound.y2);
  const [f1x, f1y] = t(fence.x1, fence.y2);
  const bl = t(bbox.minX, bbox.minY), br = t(bbox.maxX, bbox.minY), tl = t(bbox.minX, bbox.maxY);

  // landscaping shrubs along the buffer ring (midway between compound & fence)
  const shrubs = [];
  const inset = fence.buffer / 2;
  const step = Math.max(10, fence.buffer * 1.2);
  for (let x = compound.x1 + inset; x <= compound.x2 - inset + 0.01; x += step) {
    shrubs.push([x, compound.y1 + inset], [x, compound.y2 - inset]);
  }
  for (let y = compound.y1 + inset + step; y <= compound.y2 - inset - step + 0.01; y += step) {
    shrubs.push([compound.x1 + inset, y], [compound.x2 - inset, y]);
  }

  // tie-in points: power at east edge midpoint, fiber at the easement mouth (south)
  const [pwX, pwY] = t(bbox.maxX, (bbox.minY + bbox.maxY) / 2);
  const [fbX, fbY] = t(easement ? (easement.x1 + easement.x2) / 2 : (bbox.minX + bbox.maxX) / 2, bbox.minY);
  const powerLabel = utilities?.power?.serving_utility || "Electric utility tie-in";
  const powerDist = utilities?.power?.nearest_substation_mi != null ? `substation ${utilities.power.nearest_substation_mi} mi` : null;
  const fiberLabel = utilities?.fiber?.telco || "Fiber tie-in";
  const fiberDist = utilities?.fiber?.nearest_lit?.distance ? `lit carrier ${utilities.fiber.nearest_lit.distance} ft` : (utilities?.fiber?.count ? `${utilities.fiber.count} lit bldgs ≤1 mi` : null);

  const rx2 = tpx + rPx * Math.SQRT1_2, ry2 = tpy - rPx * Math.SQRT1_2;
  const barUnit = [10, 20, 25, 50, 100, 200, 400].find((u) => u * scale >= 55 && u * scale <= 160) || 50;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg" fontFamily="Helvetica, Arial, sans-serif" style={{ display: "block", background: "#F8FAFC", borderRadius: 8 }}>
      <defs>
        <clipPath id="ts-parcel-clip"><path d={parcelPath} /></clipPath>
        <mask id="ts-outside"><rect width={W} height={H} fill="white" /><path d={parcelPath} fill="black" /></mask>
        <pattern id="ts-red-hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#EF4444" strokeWidth="2" />
        </pattern>
        <pattern id="ts-esmt-hatch" width="7" height="7" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#64748B" strokeWidth="1.3" />
        </pattern>
      </defs>

      <rect width={W} height={H} rx="8" fill="#F8FAFC" stroke="#CBD5E1" />

      {/* parcel */}
      <path d={parcelPath} fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.4" />

      {/* setback envelope */}
      {env.valid && (
        <>
          <rect x={e1x} y={e1y} width={(env.x2 - env.x1) * scale} height={(env.y2 - env.y1) * scale}
            fill="#10B981" fillOpacity="0.06" stroke="#06B6D4" strokeWidth="1.5" strokeDasharray="7 4" />
          <text x={e1x + 6} y={e1y + 12} fontSize="8.5" fill="#0891B2" fontWeight="bold">BUILDABLE ENVELOPE — ORDINANCE SETBACKS</text>
        </>
      )}

      {/* fall zone */}
      <circle cx={tpx} cy={tpy} r={rPx} fill="#F59E0B" fillOpacity="0.12" clipPath="url(#ts-parcel-clip)" />
      {fallZone.spills && <circle cx={tpx} cy={tpy} r={rPx} fill="url(#ts-red-hatch)" fillOpacity="0.5" mask="url(#ts-outside)" />}
      <circle cx={tpx} cy={tpy} r={rPx} fill="none" stroke={fallZone.spills ? "#EF4444" : "#F59E0B"} strokeWidth="1.8" strokeDasharray="9 5" />
      <line x1={tpx} y1={tpy} x2={rx2} y2={ry2} stroke="#B45309" strokeWidth="1" />
      <text x={(tpx + rx2) / 2 + 5} y={(tpy + ry2) / 2 - 5} fontSize="9.5" fill="#B45309" fontWeight="bold">R = {Math.round(fallZone.radius)}′ FALL ZONE</text>

      {/* utility & access easement */}
      {easement && (
        <>
          <rect x={t(easement.x1, easement.y2)[0]} y={t(easement.x1, easement.y2)[1]}
            width={(easement.x2 - easement.x1) * scale} height={(easement.y2 - easement.y1) * scale}
            fill="url(#ts-esmt-hatch)" fillOpacity="0.6" stroke="#64748B" strokeWidth="1" strokeDasharray="4 3" />
          <text x={t(easement.x2, (easement.y1 + easement.y2) / 2)[0] + 5} y={t(easement.x2, (easement.y1 + easement.y2) / 2)[1]} fontSize="8.5" fill="#475569" fontWeight="bold">
            {easement.w}′ UTILITY &amp; ACCESS ESMT
          </text>
        </>
      )}

      {/* compound — landscaped buffer */}
      <rect x={c1x} y={c1y} width={compound.w * scale} height={compound.d * scale}
        fill="#DCFCE7" fillOpacity="0.9" stroke={compound.fits ? "#334155" : "#DC2626"} strokeWidth="1.6" />
      {shrubs.map(([sx, sy], i) => {
        const [px, py] = t(sx, sy);
        return <circle key={i} cx={px} cy={py} r={Math.max(2, fence.buffer * scale * 0.28)} fill="#22C55E" fillOpacity="0.8" stroke="#15803D" strokeWidth="0.8" />;
      })}
      <text x={c1x + (compound.w * scale) / 2} y={c1y + compound.d * scale + 12} fontSize="9.5" fill={compound.fits ? "#334155" : "#DC2626"} fontWeight="bold" textAnchor="middle">
        COMPOUND {compound.w}′ × {compound.d}′ · {fence.buffer}′ LANDSCAPED BUFFER
      </text>

      {/* fenced interior (chain-link) */}
      <rect x={f1x} y={f1y} width={fence.w * scale} height={fence.d * scale}
        fill="#E2E8F0" fillOpacity="0.95" stroke="#0F172A" strokeWidth="1.8" strokeDasharray="6 3" />
      {[[fence.x1, fence.y1], [fence.x2, fence.y1], [fence.x2, fence.y2], [fence.x1, fence.y2]].map(([fx, fy], i) => {
        const [px, py] = t(fx, fy);
        return <g key={i}><line x1={px - 3} y1={py - 3} x2={px + 3} y2={py + 3} stroke="#0F172A" strokeWidth="1.2" /><line x1={px - 3} y1={py + 3} x2={px + 3} y2={py - 3} stroke="#0F172A" strokeWidth="1.2" /></g>;
      })}
      <text x={f1x + (fence.w * scale) / 2} y={f1y + (fence.d * scale) / 2 + 16} fontSize="8.5" fill="#334155" fontWeight="bold" textAnchor="middle">
        {fence.w}′ × {fence.d}′ FENCED
      </text>

      {/* monopole */}
      <polygon points={`${tpx},${tpy - 12} ${tpx - 8},${tpy + 7} ${tpx + 8},${tpy + 7}`} fill="#111827" />
      <circle cx={tpx} cy={tpy} r="2.6" fill="#E11D48" />
      <text x={tpx} y={tpy - 17} fontSize="10.5" fill="#111827" fontWeight="bold" textAnchor="middle">{tower.heightFt}′ MONOPOLE</text>

      {/* power tie-in */}
      <circle cx={pwX} cy={pwY} r="6" fill="#FACC15" stroke="#A16207" strokeWidth="1.5" />
      <text x={pwX + 1} y={pwY + 3.5} fontSize="8" fontWeight="bold" fill="#713F12" textAnchor="middle">⚡</text>
      <text x={pwX - 8} y={pwY - 9} fontSize="8.5" fill="#A16207" fontWeight="bold" textAnchor="end">POWER TIE-IN — {powerLabel}{powerDist ? ` (${powerDist})` : ""}</text>

      {/* fiber tie-in */}
      <circle cx={fbX} cy={fbY} r="6" fill="#16A34A" stroke="#14532D" strokeWidth="1.5" />
      <circle cx={fbX} cy={fbY} r="2" fill="#fff" />
      <text x={fbX + 10} y={fbY + 3.5} fontSize="8.5" fill="#15803D" fontWeight="bold">FIBER TIE-IN — {fiberLabel}{fiberDist ? ` (${fiberDist})` : ""}</text>

      {/* parcel dimensions */}
      <line x1={bl[0]} y1={bl[1] + 16} x2={br[0]} y2={br[1] + 16} stroke="#475569" strokeWidth="1" />
      <line x1={bl[0]} y1={bl[1] + 11} x2={bl[0]} y2={bl[1] + 21} stroke="#475569" strokeWidth="1" />
      <line x1={br[0]} y1={br[1] + 11} x2={br[0]} y2={br[1] + 21} stroke="#475569" strokeWidth="1" />
      <text x={(bl[0] + br[0]) / 2} y={bl[1] + 28} fontSize="10" fill="#334155" textAnchor="middle" fontWeight="bold">{Math.round(parcel.width)}′</text>
      <line x1={bl[0] - 16} y1={bl[1]} x2={tl[0] - 16} y2={tl[1]} stroke="#475569" strokeWidth="1" />
      <text x={bl[0] - 24} y={(bl[1] + tl[1]) / 2} fontSize="10" fill="#334155" textAnchor="middle" fontWeight="bold"
        transform={`rotate(-90 ${bl[0] - 24} ${(bl[1] + tl[1]) / 2})`}>{Math.round(parcel.depth)}′</text>

      {/* north arrow */}
      <g transform={`translate(${W - 34}, 36)`}>
        <circle r="15" fill="white" stroke="#334155" strokeWidth="1.2" />
        <polygon points="0,-10 -5,6 0,2 5,6" fill="#E11D48" />
        <text y="-18" fontSize="9" fill="#334155" textAnchor="middle" fontWeight="bold">N</text>
      </g>

      {/* scale bar */}
      <g transform={`translate(18, ${H - 20})`}>
        <rect x="0" y="0" width={barUnit * scale} height="6" fill="#111827" />
        <rect x={barUnit * scale} y="0" width={barUnit * scale} height="6" fill="white" stroke="#111827" strokeWidth="1" />
        <text x="0" y="-4" fontSize="8" fill="#334155" textAnchor="middle">0</text>
        <text x={barUnit * scale} y="-4" fontSize="8" fill="#334155" textAnchor="middle">{barUnit}′</text>
        <text x={barUnit * scale * 2} y="-4" fontSize="8" fill="#334155" textAnchor="middle">{barUnit * 2}′</text>
        <text x={barUnit * scale * 2 + 8} y="6" fontSize="8" fill="#64748B">GRAPHIC SCALE (FEET)</text>
      </g>
    </svg>
  );
}