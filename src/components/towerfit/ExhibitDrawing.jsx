/* Drawing panel — to-scale parcel/envelope/compound/fall-zone/tower/easement. SVG group. */

export default function ExhibitDrawing({ model, x, y, w, h }) {
  const { parcel, envelope: env, compound, fallZone, tower, easement } = model;
  const bbox = parcel.bbox;

  // drawing extent = parcel ∪ fall zone circle, padded
  const pad = Math.max(20, fallZone.radius * 0.08);
  const extMinX = Math.min(bbox.minX, tower.x - fallZone.radius) - pad;
  const extMaxX = Math.max(bbox.maxX, tower.x + fallZone.radius) + pad;
  const extMinY = Math.min(bbox.minY, tower.y - fallZone.radius) - pad;
  const extMaxY = Math.max(bbox.maxY, tower.y + fallZone.radius) + pad;
  const margin = 52;
  const scale = Math.min((w - margin * 2) / (extMaxX - extMinX), (h - margin * 2) / (extMaxY - extMinY));
  const ox = x + (w - (extMaxX - extMinX) * scale) / 2;
  const oy = y + (h + (extMaxY - extMinY) * scale) / 2;
  const t = (fx, fy) => [ox + (fx - extMinX) * scale, oy - (fy - extMinY) * scale];

  const parcelPts = parcel.vertices.map(([fx, fy]) => t(fx, fy).join(",")).join(" ");
  const parcelPath = "M" + parcel.vertices.map(([fx, fy]) => t(fx, fy).join(" ")).join(" L") + " Z";
  const [tpx, tpy] = t(tower.x, tower.y);
  const rPx = fallZone.radius * scale;

  // grid step: ~40px
  const gridStep = [10, 20, 25, 50, 100, 200, 500].find((g) => g * scale >= 34) || 500;
  const gridLines = [];
  for (let gx = Math.ceil(extMinX / gridStep) * gridStep; gx <= extMaxX; gx += gridStep)
    gridLines.push(<line key={"gx" + gx} x1={t(gx, extMinY)[0]} y1={y + 6} x2={t(gx, extMinY)[0]} y2={y + h - 6} stroke="#E2E8F0" strokeWidth="0.6" />);
  for (let gy = Math.ceil(extMinY / gridStep) * gridStep; gy <= extMaxY; gy += gridStep)
    gridLines.push(<line key={"gy" + gy} x1={x + 6} y1={t(extMinX, gy)[1]} x2={x + w - 6} y2={t(extMinX, gy)[1]} stroke="#E2E8F0" strokeWidth="0.6" />);

  // scale bar: pick round unit ≈ 60–160 px
  const barUnit = [10, 20, 25, 50, 100, 200, 400].find((u) => u * scale >= 60 && u * scale <= 170) || 50;
  const ftPerInch = Math.round(100 / scale); // sheet renders at ~100 px/in on letter

  const [e1x, e1y] = env.valid ? t(env.x1, env.y2) : [0, 0];
  const envW = env.valid ? (env.x2 - env.x1) * scale : 0;
  const envH = env.valid ? (env.y2 - env.y1) * scale : 0;

  const [c1x, c1y] = t(compound.x1, compound.y2);
  const compWpx = compound.w * scale;
  const compHpx = compound.d * scale;

  // rectangle dimension lines
  const [bl] = [t(bbox.minX, bbox.minY)];
  const [br] = [t(bbox.maxX, bbox.minY)];
  const [tl] = [t(bbox.minX, bbox.maxY)];

  // fall-zone radius dimension at 45°
  const rx2 = tpx + rPx * Math.SQRT1_2;
  const ry2 = tpy - rPx * Math.SQRT1_2;

  return (
    <g fontFamily="Helvetica, Arial, sans-serif">
      <defs>
        <clipPath id="tfe-parcel-clip"><path d={parcelPath} /></clipPath>
        <mask id="tfe-outside-parcel">
          <rect x={x} y={y} width={w} height={h} fill="white" />
          <path d={parcelPath} fill="black" />
        </mask>
        <pattern id="tfe-red-hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#EF4444" strokeWidth="2" />
        </pattern>
        <pattern id="tfe-esmt-hatch" width="7" height="7" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#64748B" strokeWidth="1.4" />
        </pattern>
      </defs>

      {/* panel paper */}
      <rect x={x} y={y} width={w} height={h} rx="8" fill="#F8FAFC" stroke="#CBD5E1" />
      {gridLines}

      {/* parcel */}
      <polygon points={parcelPts} fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.4" />

      {/* setback envelope */}
      {env.valid && (
        <>
          <rect x={e1x} y={e1y} width={envW} height={envH} fill="#10B981" fillOpacity="0.08" stroke="#06B6D4" strokeWidth="1.6" strokeDasharray="7 4" />
          <text x={e1x + 6} y={e1y + 13} fontSize="9" fill="#0891B2" fontWeight="bold">BUILDABLE ENVELOPE (SETBACKS)</text>
        </>
      )}

      {/* fall zone — on-parcel amber, off-parcel red hatch */}
      <circle cx={tpx} cy={tpy} r={rPx} fill="#F59E0B" fillOpacity="0.14" clipPath="url(#tfe-parcel-clip)" />
      {fallZone.spills && (
        <circle cx={tpx} cy={tpy} r={rPx} fill="url(#tfe-red-hatch)" fillOpacity="0.55" mask="url(#tfe-outside-parcel)" />
      )}
      <circle cx={tpx} cy={tpy} r={rPx} fill="none" stroke={fallZone.spills ? "#EF4444" : "#F59E0B"} strokeWidth="1.8" strokeDasharray="9 5" />

      {/* radius dimension */}
      <line x1={tpx} y1={tpy} x2={rx2} y2={ry2} stroke="#B45309" strokeWidth="1" />
      <text x={(tpx + rx2) / 2 + 5} y={(tpy + ry2) / 2 - 5} fontSize="10.5" fill="#B45309" fontWeight="bold">
        R = {Math.round(fallZone.radius)}′ FALL ZONE
      </text>

      {/* access easement */}
      {easement && (
        <>
          <rect
            x={t(easement.x1, easement.y2)[0]} y={t(easement.x1, easement.y2)[1]}
            width={(easement.x2 - easement.x1) * scale} height={(easement.y2 - easement.y1) * scale}
            fill="url(#tfe-esmt-hatch)" fillOpacity="0.6" stroke="#64748B" strokeWidth="1" strokeDasharray="4 3"
          />
          <text x={t(easement.x1, easement.y1)[0] + 3} y={t(easement.x1, easement.y1)[1] - 4} fontSize="8.5" fill="#475569" fontWeight="bold">
            {easement.w}′ ACCESS ESMT
          </text>
        </>
      )}

      {/* compound */}
      <rect x={c1x} y={c1y} width={compWpx} height={compHpx} fill={compound.fits ? "#CBD5E1" : "#FCA5A5"} fillOpacity="0.85" stroke={compound.fits ? "#334155" : "#DC2626"} strokeWidth="1.8" />
      <text x={c1x + compWpx / 2} y={c1y + compHpx + 12} fontSize="9.5" fill={compound.fits ? "#334155" : "#DC2626"} fontWeight="bold" textAnchor="middle">
        COMPOUND {compound.w}′ × {compound.d}′
      </text>

      {/* tower */}
      <polygon points={`${tpx},${tpy - 11} ${tpx - 8},${tpy + 7} ${tpx + 8},${tpy + 7}`} fill="#111827" />
      <circle cx={tpx} cy={tpy} r="2.6" fill="#E11D48" />
      <text x={tpx} y={tpy - 16} fontSize="10.5" fill="#111827" fontWeight="bold" textAnchor="middle">
        {tower.heightFt}′ {tower.type.toUpperCase()}
      </text>

      {/* rectangle side dimensions */}
      {parcel.isRect && (
        <>
          <line x1={bl[0]} y1={bl[1] + 16} x2={br[0]} y2={br[1] + 16} stroke="#475569" strokeWidth="1" />
          <line x1={bl[0]} y1={bl[1] + 11} x2={bl[0]} y2={bl[1] + 21} stroke="#475569" strokeWidth="1" />
          <line x1={br[0]} y1={br[1] + 11} x2={br[0]} y2={br[1] + 21} stroke="#475569" strokeWidth="1" />
          <text x={(bl[0] + br[0]) / 2} y={bl[1] + 29} fontSize="10.5" fill="#334155" textAnchor="middle" fontWeight="bold">{Math.round(parcel.width)}′</text>
          <line x1={bl[0] - 16} y1={bl[1]} x2={tl[0] - 16} y2={tl[1]} stroke="#475569" strokeWidth="1" />
          <line x1={bl[0] - 11} y1={bl[1]} x2={bl[0] - 21} y2={bl[1]} stroke="#475569" strokeWidth="1" />
          <line x1={tl[0] - 11} y1={tl[1]} x2={tl[0] - 21} y2={tl[1]} stroke="#475569" strokeWidth="1" />
          <text x={bl[0] - 24} y={(bl[1] + tl[1]) / 2} fontSize="10.5" fill="#334155" textAnchor="middle" fontWeight="bold"
            transform={`rotate(-90 ${bl[0] - 24} ${(bl[1] + tl[1]) / 2})`}>{Math.round(parcel.depth)}′</text>
        </>
      )}

      {/* north arrow */}
      <g transform={`translate(${x + w - 34}, ${y + 36})`}>
        <circle r="16" fill="white" stroke="#334155" strokeWidth="1.2" />
        <polygon points="0,-11 -5,6 0,2 5,6" fill="#E11D48" />
        <text y="-19" fontSize="10" fill="#334155" textAnchor="middle" fontWeight="bold">N</text>
      </g>

      {/* graphic scale bar (authoritative) */}
      <g transform={`translate(${x + 18}, ${y + h - 24})`}>
        <rect x="0" y="0" width={barUnit * scale} height="6" fill="#111827" />
        <rect x={barUnit * scale} y="0" width={barUnit * scale} height="6" fill="white" stroke="#111827" strokeWidth="1" />
        <text x="0" y="-4" fontSize="8.5" fill="#334155" textAnchor="middle">0</text>
        <text x={barUnit * scale} y="-4" fontSize="8.5" fill="#334155" textAnchor="middle">{barUnit}′</text>
        <text x={barUnit * scale * 2} y="-4" fontSize="8.5" fill="#334155" textAnchor="middle">{barUnit * 2}′</text>
        <text x={barUnit * scale * 2 + 10} y="6" fontSize="8.5" fill="#64748B">1 in ≈ {ftPerInch}′ at full print</text>
      </g>
    </g>
  );
}