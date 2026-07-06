/* Sidebar — verdict badge, site data table, legend, notes. SVG group. */
import { VERDICT_META, wrapText } from "@/lib/towerFitExhibit";

export default function ExhibitSidebar({ model, config, x, y, w }) {
  const meta = VERDICT_META[model.verdict];
  const { parcel, tower, compound, fallZone, setbacks, envelope } = model;

  const rows = [
    ["Parcel", `${Math.round(parcel.width)}′ × ${Math.round(parcel.depth)}′`],
    ["Area", `${Math.round(parcel.areaSf).toLocaleString()} sf · ${parcel.acres.toFixed(2)} ac`],
    ["Tower", `${tower.heightFt}′ ${tower.type}`],
    ["Fall zone", `${Math.round(fallZone.radius)}′ (${fallZone.rule === "custom" ? "custom" : fallZone.rule + "% of height"})`],
    ["Compound", `${compound.w}′ × ${compound.d}′`],
    ["Setbacks", `N ${setbacks.front}′ · S ${setbacks.rear}′ · W ${setbacks.left}′ · E ${setbacks.right}′`],
    ["Buildable", `${Math.round(envelope.areaSf).toLocaleString()} sf`],
  ];

  const legend = [
    { sw: "line", color: "#1E293B", label: "Property boundary" },
    { sw: "dash", color: "#06B6D4", label: "Setback / buildable envelope" },
    { sw: "dash", color: "#F59E0B", label: `Fall zone (R = ${Math.round(fallZone.radius)}′)` },
    { sw: "box", color: "#CBD5E1", label: "Equipment compound" },
    ...(model.easement ? [{ sw: "hatch", color: "#64748B", label: "Access easement" }] : []),
    ...(fallZone.spills ? [{ sw: "redhatch", color: "#EF4444", label: "Fall zone off-parcel" }] : []),
  ];

  const reasonLines = wrapText(model.verdictReason, 40);
  const noteLines = String(config.notes || "").split(/\n+/).filter(Boolean).slice(0, 5);

  let cy = y;
  const badgeH = 46 + reasonLines.length * 13;

  return (
    <g fontFamily="Helvetica, Arial, sans-serif">
      {/* verdict badge */}
      <rect x={x} y={cy} width={w} height={badgeH} rx="10" fill={meta.color} fillOpacity="0.12" stroke={meta.color} strokeWidth="2" />
      <text x={x + w / 2} y={cy + 28} fontSize="22" fill={meta.color} fontWeight="bold" textAnchor="middle" letterSpacing="1">{meta.label}</text>
      {reasonLines.map((line, i) => (
        <text key={i} x={x + w / 2} y={cy + 44 + i * 13} fontSize="9.5" fill="#334155" textAnchor="middle">{line}</text>
      ))}
      {(cy += badgeH + 16) && null}

      {/* site data table */}
      <text x={x} y={cy} fontSize="10" fill="#111827" fontWeight="bold" letterSpacing="1">SITE DATA</text>
      {(cy += 8) && null}
      {rows.map(([k, v], i) => (
        <g key={k}>
          <rect x={x} y={cy + i * 19} width={w} height={19} fill={i % 2 ? "#F1F5F9" : "white"} stroke="#E2E8F0" strokeWidth="0.6" />
          <text x={x + 6} y={cy + i * 19 + 13} fontSize="9" fill="#64748B" fontWeight="bold">{k}</text>
          <text x={x + w - 6} y={cy + i * 19 + 13} fontSize="9" fill="#111827" textAnchor="end">{v}</text>
        </g>
      ))}
      {(cy += rows.length * 19 + 20) && null}

      {/* legend */}
      <text x={x} y={cy} fontSize="10" fill="#111827" fontWeight="bold" letterSpacing="1">LEGEND</text>
      {(cy += 8) && null}
      {legend.map((it, i) => {
        const ly = cy + i * 16 + 8;
        return (
          <g key={it.label}>
            {it.sw === "line" && <line x1={x} y1={ly} x2={x + 22} y2={ly} stroke={it.color} strokeWidth="2.4" />}
            {it.sw === "dash" && <line x1={x} y1={ly} x2={x + 22} y2={ly} stroke={it.color} strokeWidth="2" strokeDasharray="5 3" />}
            {it.sw === "box" && <rect x={x} y={ly - 5} width={22} height={10} fill={it.color} stroke="#334155" strokeWidth="1" />}
            {it.sw === "hatch" && <rect x={x} y={ly - 5} width={22} height={10} fill="url(#tfe-esmt-hatch)" stroke={it.color} strokeWidth="1" />}
            {it.sw === "redhatch" && <rect x={x} y={ly - 5} width={22} height={10} fill="url(#tfe-red-hatch)" fillOpacity="0.6" stroke={it.color} strokeWidth="1" />}
            <text x={x + 30} y={ly + 3} fontSize="9" fill="#334155">{it.label}</text>
          </g>
        );
      })}
      {(cy += legend.length * 16 + 22) && null}

      {/* notes */}
      {noteLines.length > 0 && (
        <>
          <text x={x} y={cy} fontSize="10" fill="#111827" fontWeight="bold" letterSpacing="1">NOTES</text>
          {noteLines.map((n, i) =>
            wrapText("• " + n, 46).map((line, j) => (
              <text key={`${i}-${j}`} x={x} y={cy + 14 + (i * 2 + j) * 12} fontSize="8.5" fill="#475569">{line}</text>
            ))
          )}
        </>
      )}
    </g>
  );
}