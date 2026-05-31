/**
 * ViewshedCompassRose — 40px monochrome compass rose; the active direction's
 * arrow glows in the cone color (Section 5 only).
 */

export default function ViewshedCompassRose({ activeDir, color = "#00BFFF", size = 40 }) {
  const c = size / 2;
  const arrows = [
    { d: "N", x: c, y: 5, tx: c, ty: 9 },
    { d: "S", x: c, y: size - 5, tx: c, ty: size - 6 },
    { d: "E", x: size - 5, y: c, tx: size - 7, ty: c + 3 },
    { d: "W", x: 5, y: c, tx: 8, ty: c + 3 },
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow">
      <circle cx={c} cy={c} r={c - 2} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      {arrows.map((a) => {
        const on = a.d === activeDir;
        return (
          <g key={a.d}>
            <line
              x1={c} y1={c} x2={a.x} y2={a.y}
              stroke={on ? color : "rgba(255,255,255,0.4)"}
              strokeWidth={on ? 2 : 1}
              style={on ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined}
            />
            <text
              x={a.tx} y={a.ty} textAnchor="middle" dominantBaseline="middle"
              fontSize="8" fontFamily="monospace" fontWeight="bold"
              fill={on ? color : "rgba(255,255,255,0.55)"}
            >
              {a.d}
            </text>
          </g>
        );
      })}
      <circle cx={c} cy={c} r="2" fill="#fff" />
    </svg>
  );
}