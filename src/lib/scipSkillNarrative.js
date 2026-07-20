import { base44 } from "@/api/base44Client";

// SCIP skill — 7 weighted scorecard categories (weights sum to 100).
export const SCORECARD_CATEGORIES = [
  ["Parcel Fit & Constructability", 20],
  ["Zoning & Entitlement", 20],
  ["Access & ROW", 10],
  ["Power & Backhaul", 15],
  ["Environmental & FAA", 15],
  ["Acquisition & Owner", 10],
  ["Target Fit (Ring Compliance)", 10],
];

/**
 * buildScipNarrative — synthesizes the SCIP skill's AI-generated narrative
 * sections (Executive Assessment, Candidate Rationale, Infrastructure
 * Assessment, Recommendation) and the 7-category weighted scorecard, STRICTLY
 * from the verified facts already assembled into the SCIP record. Facts are
 * never invented; unknowns are acknowledged as unverified.
 */
export async function buildScipNarrative(rec) {
  const a = rec.targetA || {};
  const z = rec.zoning || {};
  const c = rec.conditions || {};
  const u = rec.utilities || {};

  const facts = {
    search_ring: {
      site_name: rec.site_name,
      center: { lat: rec.latitude, lon: rec.longitude },
      radius_miles: rec.radius_miles,
      requested_tower_height_ft: rec.tower_height_ft,
      compound_size: rec.compound_size,
      county: rec.county,
      state: rec.state,
    },
    candidate: {
      label: a.label,
      latitude: a.latitude,
      longitude: a.longitude,
      apn: a.apn,
      parcel_address: a.parcel_address,
      acreage: a.acreage,
      boundaries: a.boundaries,
      owner_name: a.owner_name,
      mailing_address: a.mailing_address,
      zoning_classification: a.zoning_classification,
      land_use: a.land_use,
      ground_elevation_ft: a.ground_elevation_ft,
      taxes_paid: a.taxes_paid,
      conforming_size: a.conforming_size,
      score: a.score,
      score_reasons: a.score_reasons,
    },
    zoning: z,
    existing_conditions: c,
    utilities: u,
    deed: rec.deed
      ? { deed_type: rec.deed.deed_type, last_sale_date: rec.deed.last_sale_date, ownership_start: rec.deed.ownership_start }
      : null,
  };

  const categories = SCORECARD_CATEGORIES.map(([name]) => name);

  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You are a senior telecommunications site-acquisition analyst preparing a client-ready Site Candidate Information Package (SCIP). Using ONLY the verified facts below, write the professional narrative sections and score the candidate. Rules:
- NEVER invent facts. If a fact is missing, state that it is pending field verification — do not guess.
- Professional, confident, concise carrier-submittal tone. No marketing fluff, no first person.
- Executive Assessment: 3-5 sentences summarizing verified findings and overall feasibility.
- Candidate Rationale: 3-5 sentences on why this parcel was selected (fit, proximity to the search ring center, access, constructability).
- Infrastructure Assessment: 2-4 sentences synthesizing the power, fiber/backhaul and telco proximity implications for build cost and timeline.
- Recommendation text: 2-4 sentences supporting one of: Proceed, Proceed with Conditions, Hold, Reject — grounded in the scorecard and findings.
- Scorecard: score EACH of these 7 categories from 1 (poor) to 5 (excellent), each with one short evidence sentence citing the facts: ${categories.join("; ")}. Use 3 when data is insufficient and say so in the evidence.

VERIFIED FACTS (JSON):
${JSON.stringify(facts, null, 1)}`,
    response_json_schema: {
      type: "object",
      properties: {
        executive_assessment: { type: "string" },
        candidate_rationale: { type: "string" },
        infrastructure_assessment: { type: "string" },
        recommendation_text: { type: "string" },
        recommendation: { type: "string", enum: ["Proceed", "Proceed with Conditions", "Hold", "Reject"] },
        feasibility: { type: "string", enum: ["High", "Moderate", "Low", "Hold"] },
        primary_advantage: { type: "string" },
        primary_constraint: { type: "string" },
        next_action: { type: "string" },
        scorecard: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              score: { type: "number" },
              evidence: { type: "string" },
            },
          },
        },
      },
      required: ["executive_assessment", "candidate_rationale", "recommendation", "feasibility", "scorecard"],
    },
  });

  // Deterministic weighted scoring — align LLM rows to the fixed category order.
  const rows = SCORECARD_CATEGORIES.map(([name, weight]) => {
    const m = (res.scorecard || []).find(
      (s) => s.category && name.toLowerCase().startsWith(String(s.category).toLowerCase().slice(0, 6))
    ) || (res.scorecard || [])[SCORECARD_CATEGORIES.findIndex(([n]) => n === name)];
    const score = Math.min(5, Math.max(1, Number(m?.score) || 3));
    return {
      category: name,
      weight,
      score,
      weighted: Math.round((score / 5) * weight * 10) / 10,
      evidence: m?.evidence || "Insufficient data — pending field verification.",
    };
  });
  const overall = Math.round(rows.reduce((s, r) => s + r.weighted, 0));

  return {
    executive_assessment: res.executive_assessment || "",
    candidate_rationale: res.candidate_rationale || "",
    infrastructure_assessment: res.infrastructure_assessment || "",
    recommendation_text: res.recommendation_text || "",
    recommendation: res.recommendation || "Proceed with Conditions",
    feasibility: res.feasibility || "Moderate",
    primary_advantage: res.primary_advantage || "",
    primary_constraint: res.primary_constraint || "",
    next_action: res.next_action || "",
    scorecard: rows,
    overall_score: overall,
  };
}