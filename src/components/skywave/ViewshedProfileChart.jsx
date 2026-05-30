import { SKYWAVE } from "@/lib/skywave";

// Compact terrain + line-of-sight profile chart for one direction.
// X = distance (mi), Y = elevation (ft AMSL). Ground area + LOS line + obstruction markers.
export default function ViewshedProfileChart({ direction, height = 130 }) {
  const profile = direction?.profile || [];
  if (!profile.length) return null;

  const W = 320, H = height, padL = 34, padR = 8, padT = 10, padB = 20;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const dists = profile.map((p) => p.dist_mi);
  const elevs = profile.flatMap((p) => [p.ground_ft, p.los_ft].filter((v) => v != null));
  const maxD = Math.max(...dists, 1);
  let minE = Math.min(...elevs), maxE = Math.max(...elevs);
  if (minE === maxE) { minE -= 10; maxE += 10; }
  const pad = (maxE - minE) * 0.12 || 5;
  minE -= pad; maxE += pad;

  const x = (d) => padL + (d / maxD) * innerW;
  const y = (e) => padT + innerH - ((e - minE) / (maxE - minE)) * innerH;

  // Ground area path (filled from bottom).
  const groundPts = profile.filter((p) => p.ground_ft != null);
  const areaPath =
    `M ${x(groundPts[0].dist_mi)},${padT + innerH} ` +
    groundPts.map((p) => `L ${x(p.dist_mi)},${y(p.ground_ft)}`).join(" ") +
    ` L ${x(groundPts[groundPts.length - 1].dist_mi)},${padT + innerH} Z`;

  // LOS line from apex (dist 0, first los) across.
  const losPts = profile.filter((p) => p.los_ft != null);
  const losPath = losPts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.dist_mi)},${y(p.los_ft)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {/* axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke={SKYWAVE.line} strokeWidth="1" />
      <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke={SKYWAVE.line} strokeWidth="1" />
      {/* y labels */}
      <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize="7" fill={SKYWAVE.muted}>{Math.round(maxE)}</text>
      <text x={padL - 4} y={padT + innerH} textAnchor="end" fontSize="7" fill={SKYWAVE.muted}>{Math.round(minE)} ft</text>
      {/* x labels */}
      <text x={padL} y={H - 6} textAnchor="start" fontSize="7" fill={SKYWAVE.muted}>0</text>
      <text x={W - padR} y={H - 6} textAnchor="end" fontSize="7" fill={SKYWAVE.muted}>{maxD} mi</text>

      {/* ground */}
      <path d={areaPath} fill={`${direction.color}22`} stroke="none" />
      <path
        d={groundPts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.dist_mi)},${y(p.ground_ft)}`).join(" ")}
        fill="none" stroke={direction.color} strokeWidth="1.5"
      />
      {/* line of sight */}
      <path d={losPath} fill="none" stroke={SKYWAVE.navy} strokeWidth="1.3" strokeDasharray="3 2" />
      {/* obstruction markers */}
      {profile.filter((p) => p.obstructed && p.ground_ft != null).map((p, i) => (
        <circle key={i} cx={x(p.dist_mi)} cy={y(p.ground_ft)} r="2.6" fill="#DC2626" />
      ))}
    </svg>
  );
}