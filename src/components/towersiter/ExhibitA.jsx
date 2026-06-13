import { forwardRef } from "react";
import { synthesizeCalls, NOT_A_SURVEY } from "@/lib/towerSiterExports";
import PlatStamp from "./PlatStamp";

const W = 1100, H = 850, M = 70, TITLE_H = 110;
const MONO = "'IBM Plex Mono', monospace";
const PAPER = "#f1eee2";
const INK = "#2b2a24";

const outerRings = (feat) => {
  if (!feat) return [];
  const g = feat.geometry ?? feat;
  if (g.type === "Polygon") return [g.coordinates[0]];
  if (g.type === "MultiPolygon") return g.coordinates.map((p) => p[0]);
  return [];
};

// Exhibit A — survey-plat style plan sheet rendered as SVG (exported via
// canvas 2x → PNG). All geometry comes from the engine's feet frame.
// NOT A SURVEY disclaimer is non-negotiable.
const ExhibitA = forwardRef(function ExhibitA({ result, controls, meta, watermark }, ref) {
  if (!result || result.collapsed) return null;

  const parcelRing = outerRings(result.parcelFt)[0] || [];
  if (parcelRing.length < 4) return null;

  // fit feet frame → sheet
  const xs = parcelRing.map((p) => p[0]), ys = parcelRing.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const drawW = W - 2 * M, drawH = H - TITLE_H - 2 * M;
  const s = Math.min(drawW / (maxX - minX || 1), drawH / (maxY - minY || 1));
  const ox = M + (drawW - (maxX - minX) * s) / 2;
  const oy = M + (drawH - (maxY - minY) * s) / 2;
  const T = ([x, y]) => [ox + (x - minX) * s, oy + (maxY - y) * s]; // y-flip: north up

  const path = (ring) => ring.map((p, i) => `${i ? "L" : "M"}${T(p)[0].toFixed(1)},${T(p)[1].toFixed(1)}`).join(" ") + " Z";

  const envRings = outerRings(result.envelopeFt);
  const [tx, ty] = T(result.towerFt);
  const fallR = result.fallRadius * s;

  const rect = (wFt, dFt) => {
    const [cx, cy] = result.towerFt;
    return [[cx - wFt / 2, cy - dFt / 2], [cx + wFt / 2, cy - dFt / 2], [cx + wFt / 2, cy + dFt / 2], [cx - wFt / 2, cy + dFt / 2], [cx - wFt / 2, cy - dFt / 2]];
  };

  // boundary calls — real Tier 2 calls when edge counts line up, else synthesized
  const synth = synthesizeCalls(parcelRing);
  const realCalls = meta?.calls?.length === synth.length ? meta.calls : null;
  const labels = synth.map((c, i) => ({
    ...c,
    text: `${realCalls ? realCalls[i].bearing : c.bearing}  ${(realCalls ? realCalls[i].distance_ft : c.distance_ft).toFixed(1)}′`,
  }));

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto", background: PAPER, borderRadius: 12 }}>
      <defs>
        <pattern id="ts-hatch" patternUnits="userSpaceOnUse" width="8" height="8">
          <path d="M0,8 L8,0" stroke="#9a937e" strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={W} height={H} fill={PAPER} />
      <rect x="14" y="14" width={W - 28} height={H - 28} fill="none" stroke={INK} strokeWidth="2" />
      <rect x="20" y="20" width={W - 40} height={H - 40} fill="none" stroke={INK} strokeWidth="0.75" />

      {/* setback band: parcel minus envelope, hatched */}
      <path d={[path(parcelRing), ...envRings.map(path)].join(" ")} fillRule="evenodd" fill="url(#ts-hatch)" opacity="0.55" />

      {/* parcel boundary */}
      <path d={path(parcelRing)} fill="none" stroke={INK} strokeWidth="2.4" />

      {/* envelope — dashed teal */}
      {envRings.map((r, i) => (
        <path key={i} d={path(r)} fill="none" stroke="#0d9488" strokeWidth="1.8" strokeDasharray="7 5" />
      ))}

      {/* fall circle — teal pass / orange fail */}
      <circle cx={tx} cy={ty} r={fallR} fill="none"
        stroke={result.checks?.fallZone?.status === "pass" ? "#0d9488" : "#ea580c"}
        strokeWidth="1.8" strokeDasharray="3 3" />

      {/* lease + compound rectangles */}
      <path d={path(rect(Number(controls.leaseW) || 100, Number(controls.leaseD) || 100))} fill="none" stroke="#b45309" strokeWidth="1.2" strokeDasharray="5 3" />
      <path d={path(rect(Number(controls.compoundW) || 75, Number(controls.compoundD) || 75))} fill="#f59e0b" fillOpacity="0.25" stroke="#b45309" strokeWidth="1.6" />

      {/* tower ⊕ */}
      <circle cx={tx} cy={ty} r="9" fill="none" stroke={INK} strokeWidth="1.8" />
      <line x1={tx - 13} y1={ty} x2={tx + 13} y2={ty} stroke={INK} strokeWidth="1.4" />
      <line x1={tx} y1={ty - 13} x2={tx} y2={ty + 13} stroke={INK} strokeWidth="1.4" />
      <text x={tx + 16} y={ty - 12} fontFamily={MONO} fontSize="12" fill={INK}>PROPOSED TOWER</text>

      {/* bearing-style boundary calls */}
      {labels.map((c, i) => {
        const [mx, my] = T(c.mid);
        const rot = c.angle <= 180 ? 90 - c.angle : 270 - c.angle;
        return (
          <text key={i} x={mx} y={my - 5} fontFamily={MONO} fontSize="11.5" fill={INK}
            textAnchor="middle" transform={`rotate(${rot} ${mx} ${my})`}>
            {c.text}
          </text>
        );
      })}

      {/* north arrow */}
      <g transform={`translate(${W - 80}, 90)`}>
        <line x1="0" y1="28" x2="0" y2="-22" stroke={INK} strokeWidth="2" />
        <path d="M0,-30 L-8,-12 L0,-17 L8,-12 Z" fill={INK} />
        <text x="0" y="46" fontFamily={MONO} fontSize="14" fill={INK} textAnchor="middle" fontWeight="bold">N</text>
      </g>

      {/* legend */}
      <g transform={`translate(${M - 30}, 64)`} fontFamily={MONO} fontSize="11" fill={INK}>
        <text y="0">SETBACK: {result.setback}′ {result.peApplied ? "(PE ENGINEERED)" : result.unverified ? "(1:1 — UNVERIFIED)" : ""}</text>
        <text y="16">FALL RADIUS: {Math.round(result.fallRadius)}′ · TOWER HT: {controls.heightFt}′</text>
      </g>

      {/* watermark */}
      {watermark && (
        <text x={W / 2} y={H / 2} fontFamily={MONO} fontSize="64" fill={INK} opacity="0.13"
          textAnchor="middle" fontWeight="bold" transform={`rotate(-28 ${W / 2} ${H / 2})`}>
          PRELIMINARY — SITEHAWK
        </text>
      )}

      {/* plat-review stamp */}
      <PlatStamp x={W - 130} y={H - TITLE_H - 100} date={today.toUpperCase()} />

      {/* title block */}
      <g transform={`translate(0, ${H - TITLE_H})`}>
        <line x1="14" y1="0" x2={W - 14} y2="0" stroke={INK} strokeWidth="2" />
        <text x="30" y="28" fontFamily={MONO} fontSize="16" fontWeight="bold" fill={INK}>
          SITEHAWK TOWER SITER · EXHIBIT A · {(meta?.jurisdiction || "—").toUpperCase()} · {today.toUpperCase()}
        </text>
        <text x="30" y="50" fontFamily={MONO} fontSize="11.5" fill={INK}>
          APN {meta?.apn || "—"} · OWNER {meta?.ownerName || "—"} · {meta?.acres ? `${meta.acres} AC` : "—"} · COMPOUND {controls.compoundW}′×{controls.compoundD}′
        </text>
        {meta?.sourceLabel && (
          <text x="30" y="68" fontFamily={MONO} fontSize="11.5" fill="#b45309" fontWeight="bold">{meta.sourceLabel}</text>
        )}
        <text x="30" y={meta?.sourceLabel ? 90 : 78} fontFamily={MONO} fontSize="14" fontWeight="bold" fill="#b91c1c">
          {NOT_A_SURVEY}
        </text>
        <text x={W - 30} y={meta?.sourceLabel ? 90 : 78} fontFamily={MONO} fontSize="9" fill={INK} textAnchor="end" letterSpacing="0.5">
          FOR DISCUSSION PURPOSES ONLY
        </text>
      </g>
    </svg>
  );
});

export default ExhibitA;