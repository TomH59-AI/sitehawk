import { HAWK } from "../hawkScipBrand";
import HawkScipSection from "../HawkScipSection";

const EXACT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

const recColor = (rec) => {
  const v = String(rec || "").toLowerCase();
  if (v === "proceed") return "#15803d";
  if (v.startsWith("proceed")) return "#b45309";
  if (v === "hold") return "#6b7280";
  return "#b91c1c";
};

/**
 * SiteHawkScorecardPage — SCIP skill Section 6: the 7-category weighted
 * candidate scorecard, infrastructure assessment and final recommendation.
 */
export default function SiteHawkScorecardPage({ record, pro, page }) {
  const a = record?.targetA || {};
  const p = pro || {};
  const rows = p.scorecard || [];

  return (
    <HawkScipSection
      kicker="SCIP · Review & Publication"
      title="CANDIDATE SCORECARD & RECOMMENDATION"
      right={a.label || "Target A"}
      page={page}
      footerNote="Weighted 7-category scorecard per the SiteHawk SCIP standard. Scores synthesized from verified pipeline findings; ratings subject to analyst review."
    >
      <table className="w-full border-collapse text-[9pt]" style={{ color: HAWK.ink }}>
        <thead>
          <tr style={{ background: HAWK.dark, ...EXACT }}>
            {["Category", "Weight", "Score (1–5)", "Weighted", "Key Evidence"].map((h) => (
              <th key={h} className="text-left px-2 py-1.5 text-[8pt] font-bold uppercase tracking-wide" style={{ color: HAWK.gold }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.category} style={{ background: i % 2 ? HAWK.bg : "#fff", ...EXACT }}>
              <td className="px-2 py-1.5 font-semibold" style={{ borderBottom: `1px solid ${HAWK.blue}33` }}>{s.category}</td>
              <td className="px-2 py-1.5" style={{ borderBottom: `1px solid ${HAWK.blue}33` }}>{s.weight}</td>
              <td className="px-2 py-1.5 font-bold" style={{ borderBottom: `1px solid ${HAWK.blue}33` }}>{s.score}</td>
              <td className="px-2 py-1.5" style={{ borderBottom: `1px solid ${HAWK.blue}33` }}>{s.weighted}</td>
              <td className="px-2 py-1.5 text-[8.5pt]" style={{ borderBottom: `1px solid ${HAWK.blue}33` }}>{s.evidence}</td>
            </tr>
          ))}
          <tr style={{ background: HAWK.dark, ...EXACT }}>
            <td className="px-2 py-1.5 font-bold" style={{ color: HAWK.gold }}>OVERALL FEASIBILITY SCORE</td>
            <td className="px-2 py-1.5 font-bold" style={{ color: HAWK.gold }}>100</td>
            <td className="px-2 py-1.5" />
            <td className="px-2 py-1.5 font-bold" style={{ color: HAWK.gold }}>{p.overall_score != null ? `${p.overall_score} / 100` : "—"}</td>
            <td className="px-2 py-1.5 font-bold" style={{ color: HAWK.gold }}>{p.feasibility || ""}</td>
          </tr>
        </tbody>
      </table>

      {p.infrastructure_assessment && (
        <div className="mt-4">
          <div className="text-[9pt] font-bold uppercase tracking-[2px] mb-1" style={{ color: HAWK.blue }}>Infrastructure Assessment</div>
          <p className="text-[9.5pt] leading-relaxed" style={{ textAlign: "justify", color: HAWK.ink }}>{p.infrastructure_assessment}</p>
        </div>
      )}

      <div className="mt-4 rounded-lg p-4" style={{ border: `2px solid ${recColor(p.recommendation)}`, ...EXACT }}>
        <div className="text-[10pt] font-bold uppercase tracking-[2px] mb-1" style={{ color: recColor(p.recommendation) }}>
          Recommendation: {p.recommendation || "Pending Analyst Review"}
        </div>
        {p.recommendation_text && (
          <p className="text-[9.5pt] leading-relaxed" style={{ textAlign: "justify", color: HAWK.ink }}>{p.recommendation_text}</p>
        )}
      </div>
    </HawkScipSection>
  );
}