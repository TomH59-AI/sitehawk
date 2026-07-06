/* SiteHawk SCIP — final page: TOWER SITER EXHIBIT. To-scale concept site plan
   plus the ordinance compliance table, colored legend and siting rationale. */
import { HAWK } from "../hawkScipBrand";
import HawkScipSection from "../HawkScipSection";
import TowerSiterDrawing from "./TowerSiterDrawing";
import { buildTowerSiterModel } from "@/lib/scipTowerSiter";
import { VERDICT_META } from "@/lib/towerFitExhibit";

const LEGEND = (fence) => [
  ["#1E293B", "Property line (parcel boundary)", "line"],
  ["#06B6D4", "Buildable envelope — ordinance setbacks", "dash"],
  ["#DCFCE7", `Landscaped buffer (${fence.buffer}′)`, "fill"],
  ["#E2E8F0", `Fenced equipment compound (${fence.w}′ × ${fence.d}′)`, "fill"],
  ["#F59E0B", "Fall-zone radius", "dash"],
  ["#64748B", "20′ utility & access easement", "hatch"],
  ["#FACC15", "Power tie-in point", "dot"],
  ["#16A34A", "Fiber tie-in point", "dot"],
];

function Swatch({ color, kind }) {
  const base = { display: "inline-block", width: 16, height: 10, marginRight: 6, flexShrink: 0 };
  if (kind === "dot") return <span style={{ ...base, width: 10, height: 10, borderRadius: 5, background: color, border: "1px solid #475569" }} />;
  if (kind === "dash") return <span style={{ ...base, height: 0, borderTop: `2.5px dashed ${color}`, marginTop: 4 }} />;
  if (kind === "line") return <span style={{ ...base, height: 0, borderTop: `2.5px solid ${color}`, marginTop: 4 }} />;
  return <span style={{ ...base, background: color, border: "1px solid #94A3B8" }} />;
}

function Row({ label, value }) {
  return (
    <tr>
      <td style={{ padding: "3px 8px", fontWeight: 700, color: HAWK.navy, borderBottom: `1px solid ${HAWK.line}`, width: "44%", fontSize: "7.6pt", verticalAlign: "top" }}>{label}</td>
      <td style={{ padding: "3px 8px", color: HAWK.ink, borderBottom: `1px solid ${HAWK.line}`, fontSize: "7.6pt" }}>{value || "—"}</td>
    </tr>
  );
}

export default function SiteHawkTowerSiterPage({ record, page }) {
  const r = record || {};
  const z = r.zoning || {};
  const { model, fence, peAllowed, rationale, setbackFt, setbackFromOrdinance } = buildTowerSiterModel(r);
  const meta = VERDICT_META[model.verdict];

  return (
    <HawkScipSection
      kicker="SCIP · Section 6 · Tower Siter"
      title="TOWER SITER EXHIBIT — CONCEPT SITE PLAN"
      right={`${r.tower_height_ft || 199}′ Monopole · ${r.compound_size || "100x100"} compound`}
      page={page}
      footerNote="CONCEPT EXHIBIT ONLY — drawn to scale from supplied dimensions and the telecom tower & antenna ordinance data collected by the SiteHawk zoning intelligence. NOT a boundary survey, engineering drawing, or zoning determination. Verify all dimensions, setbacks and fall-zone rules with a licensed surveyor and the local jurisdiction."
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
        {/* verdict strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: meta.color, color: "#fff", fontWeight: 800, fontSize: "8.5pt", padding: "3px 12px", borderRadius: 999, letterSpacing: 1, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            {meta.label}
          </span>
          <span style={{ fontSize: "8pt", color: HAWK.ink }}>{model.verdictReason}</span>
          {peAllowed && (
            <span style={{ marginLeft: "auto", fontSize: "7.5pt", fontWeight: 700, color: "#15803D", border: "1.5px solid #16A34A", borderRadius: 6, padding: "2px 8px" }}>
              ✓ PE LETTER PERMITTED
            </span>
          )}
        </div>

        {/* drawing */}
        <TowerSiterDrawing model={model} fence={fence} utilities={r.utilities} />

        {/* lower panel: ordinance table + legend/rationale */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1, minHeight: 0 }}>
          <div style={{ border: `1.5px solid ${HAWK.line}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ background: HAWK.navy, color: "#fff", fontWeight: 800, fontSize: "8pt", padding: "4px 10px", letterSpacing: 1.5, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
              ORDINANCE COMPLIANCE — {z.jurisdiction || "JURISDICTION"}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <Row label="Zoning District" value={z.district} />
                <Row label="Permit / Approval Path" value={z.process} />
                <Row label="Max Tower Height" value={z.max_height ? `${z.max_height} · proposed ${r.tower_height_ft}′` : `proposed ${r.tower_height_ft}′ — verify cap`} />
                <Row label="Property-Line Setback" value={`${setbackFt}′ ${setbackFromOrdinance ? "(per ordinance)" : "(assumed — verify)"}`} />
                <Row label="Fall-Zone Rule" value={z.fall_zone || "100% of tower height (assumed)"} />
                <Row label="Tower Separation" value={z.tower_separation} />
                <Row label="Residential Separation" value={z.residential_separation} />
                <Row label="Stealth Required" value={z.stealth} />
                <Row label="PE Letter" value={peAllowed ? "Permitted — engineered fall zone allowed" : "Not confirmed — verify with jurisdiction"} />
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            <div style={{ border: `1.5px solid ${HAWK.line}`, borderRadius: 8, padding: "6px 10px" }}>
              <div style={{ fontWeight: 800, fontSize: "8pt", color: HAWK.navy, letterSpacing: 1.5, marginBottom: 4 }}>LEGEND</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px" }}>
                {LEGEND(fence).map(([color, label, kind]) => (
                  <div key={label} style={{ display: "flex", alignItems: "flex-start", fontSize: "7.2pt", color: HAWK.ink }}>
                    <Swatch color={color} kind={kind} /><span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ border: `1.5px solid ${HAWK.line}`, borderRadius: 8, padding: "6px 10px", flex: 1, minHeight: 0, overflow: "hidden" }}>
              <div style={{ fontWeight: 800, fontSize: "8pt", color: HAWK.navy, letterSpacing: 1.5, marginBottom: 4 }}>SITING RATIONALE — WHY THIS LOCATION</div>
              <ul style={{ margin: 0, paddingLeft: 14, fontSize: "7.4pt", color: HAWK.ink, lineHeight: 1.45 }}>
                {rationale.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </HawkScipSection>
  );
}