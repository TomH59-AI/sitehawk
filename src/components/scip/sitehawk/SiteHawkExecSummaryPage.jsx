import { HAWK } from "../hawkScipBrand";
import HawkScipSection from "../HawkScipSection";
import SiteHawkInfoTable from "./SiteHawkInfoTable";

const EXACT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

function Narrative({ heading, text }) {
  if (!text) return null;
  return (
    <div className="mt-3">
      <div className="text-[9pt] font-bold uppercase tracking-[2px] mb-1" style={{ color: HAWK.blue }}>{heading}</div>
      <p className="text-[9.5pt] leading-relaxed" style={{ color: HAWK.ink, textAlign: "justify" }}>{text}</p>
    </div>
  );
}

/**
 * SiteHawkExecSummaryPage — SCIP skill Section 1: Decision Snapshot, locked
 * original Target A record, Executive Assessment and Candidate Rationale.
 */
export default function SiteHawkExecSummaryPage({ record, pro, page }) {
  const r = record || {};
  const a = r.targetA || {};
  const p = pro || {};
  const lat = Number.isFinite(Number(r.latitude)) ? Number(r.latitude).toFixed(6) : "";
  const lon = Number.isFinite(Number(r.longitude)) ? Number(r.longitude).toFixed(6) : "";

  return (
    <HawkScipSection
      kicker="SCIP · Executive Summary"
      title="EXECUTIVE SUMMARY & DECISION SNAPSHOT"
      right={a.label || "Target A"}
      page={page}
      footerNote="Narratives synthesized from verified pipeline data only. Original Target A record is locked and unaltered. Field verification recommended before submittal."
    >
      <SiteHawkInfoTable
        heading="Decision Snapshot"
        rows={[
          ["Recommended Candidate", `${a.label || "Target A"}${a.parcel_address ? ` — ${a.parcel_address}` : ""}`],
          ["Overall Feasibility", p.feasibility],
          ["Overall Weighted Score", p.overall_score != null ? `${p.overall_score} / 100` : ""],
          ["Primary Advantage", p.primary_advantage],
          ["Primary Constraint", p.primary_constraint],
          ["Next Action", p.next_action],
          ["Recommendation", p.recommendation],
        ]}
      />
      <div className="mt-3 rounded-lg p-3" style={{ border: `2px solid ${HAWK.navy}`, background: HAWK.bg, ...EXACT }}>
        <div className="text-[8.5pt] font-bold uppercase tracking-[2px] mb-1.5" style={{ color: HAWK.navy }}>
          🔒 Original Target A — Locked Source Record (Unaltered)
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-[9pt]" style={{ color: HAWK.ink }}>
          <div><b>Latitude:</b> {lat}</div>
          <div><b>Longitude:</b> {lon}</div>
          <div><b>Search Radius:</b> {r.radius_miles} mi</div>
          <div><b>Requested Height:</b> {r.tower_height_ft ? `${r.tower_height_ft} ft AGL` : "—"}</div>
          <div><b>County:</b> {r.county || "—"}</div>
          <div><b>State:</b> {(r.state || "—").toUpperCase()}</div>
        </div>
      </div>
      <Narrative heading="Executive Assessment" text={p.executive_assessment} />
      <Narrative heading="Candidate Rationale" text={p.candidate_rationale} />
    </HawkScipSection>
  );
}