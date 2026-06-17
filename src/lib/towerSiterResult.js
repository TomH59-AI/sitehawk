/**
 * TowerSiter — Result classifier & ordinance unit normalizer
 *
 * classifyResult(checks, warnings) → result_class string
 * normalizeOrdinanceRules(raw, towerHeightFt) → rules object with all distances in feet
 */

// ── Ordinance unit normalization ─────────────────────────────────────────────
// Supports: ft (raw number), pct (percent of tower height), multiple (multiplier of height)
export function normalizeRuleValue(value, unit, towerHeightFt) {
  if (value == null) return null;
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return null;
  if (!unit || unit === "ft") return v;
  if (unit === "pct") return Math.ceil((v / 100) * towerHeightFt);
  if (unit === "multiple") return Math.ceil(v * towerHeightFt);
  return v; // unknown unit — pass through
}

/**
 * Normalize a raw ordinance row from telecom_ordinances / JurisdictionZoningCache
 * into a flat rules object with all distances expressed in feet.
 *
 * Input columns use the telecom_ordinances schema:
 *   height_limit_ft, setback_ft, fall_zone_ft, tower_separation_ft,
 *   residential_separation_ft, setback_unit, fall_zone_unit,
 *   tower_separation_unit, residential_separation_unit
 *
 * Also accepts JurisdictionZoningCache.telecom_requirements flat keys.
 */
export function normalizeOrdinanceRules(raw, towerHeightFt = 199) {
  if (!raw) return null;

  // Support JurisdictionZoningCache.telecom_requirements shape
  const src = raw.telecom_requirements || raw;

  const h = (key) => Number.isFinite(parseFloat(src[key])) ? parseFloat(src[key]) : null;

  const setback = normalizeRuleValue(
    src.setback_ft ?? src.property_setback_ft,
    src.setback_unit,
    towerHeightFt
  );
  const fallZone = normalizeRuleValue(
    src.fall_zone_ft,
    src.fall_zone_unit,
    towerHeightFt
  );
  const towerSep = normalizeRuleValue(
    src.tower_separation_ft ?? src.tower_separation,
    src.tower_separation_unit,
    towerHeightFt
  );
  const resSep = normalizeRuleValue(
    src.residential_separation_ft ?? src.residential_separation,
    src.residential_separation_unit,
    towerHeightFt
  );

  return {
    // passthrough fields
    height_limit_ft: h("height_limit_ft") ?? h("max_tower_height_ft") ?? h("max_tower_height"),
    setback_rule: src.setback_rule || null,
    setback_ft: setback,
    fall_zone_ft: fallZone,
    tower_separation_ft: towerSep,
    residential_separation_ft: resSep,
    pe_fall_zone_allowed: src.pe_fall_zone_allowed ?? src.pe_letter ?? null,
    permit_type: src.permit_type ?? src.approval_path ?? null,
    stealth_required: src.stealth_required ?? null,
    collocation_required: src.collocation_required ?? src.required_collocations ?? null,
    section_ref: src.section_ref ?? null,
    source_url: src.source_url ?? src.ordinance_source_url ?? null,
    measured_from: src.measured_from ?? "base",
    // raw source preserved
    _raw: src,
  };
}

// ── Result classifier ────────────────────────────────────────────────────────
/**
 * Classify the final result from the checks object.
 *
 * checks shape (from towerSiterEngine.runChecks):
 *   height:  { status: "pass"|"fail"|"skip" }
 *   setback: { status }
 *   fallZone:{ status }
 *   compound:{ status }
 *   towerSeparation: { status } (new)
 *
 * warnings: string[]
 * structuresAvailable: boolean
 *
 * Returns one of:
 *   clean_pass | pass_with_unverified_items | pe_relief_possible |
 *   fail_height_cap | fail_no_candidate_area | fail_fall_zone |
 *   fail_compound_fit | fail_tower_separation | needs_manual_review
 */
export function classifyResult(checks = {}, warnings = [], structuresAvailable = false, collapsed = false) {
  const c = checks;

  // Hard failures first
  if (c.height?.status === "fail") return "fail_height_cap";
  if (collapsed) return "fail_no_candidate_area";
  if (c.setback?.status === "fail" && c.fallZone?.status === "fail") return "fail_no_candidate_area";
  if (c.fallZone?.status === "fail") return "fail_fall_zone";
  if (c.compound?.status === "fail") return "fail_compound_fit";
  if (c.towerSeparation?.status === "fail") return "fail_tower_separation";

  // Soft pass variants
  const anyFail = Object.values(c).some((v) => v?.status === "fail");
  if (anyFail) return "needs_manual_review";

  // Check whether PE relief is the only thing that could fix a fall-zone issue
  // (i.e. fallZone failed but we're in unverified/no-rule mode)
  if (c.fallZone?.status === "unverified") return "pe_relief_possible";

  // All checks pass — but missing structures?
  if (!structuresAvailable) return "pass_with_unverified_items";

  return "clean_pass";
}

// ── Result label / color helper ──────────────────────────────────────────────
export const RESULT_META = {
  clean_pass:               { label: "Clean Pass",                color: "emerald", feasible: true  },
  pass_with_unverified_items:{ label: "Pass — Unverified Items",  color: "yellow",  feasible: true  },
  pe_relief_possible:       { label: "PE Relief Possible",        color: "cyan",    feasible: true  },
  fail_height_cap:          { label: "Height Cap Exceeded",        color: "red",     feasible: false },
  fail_no_candidate_area:   { label: "No Buildable Area",          color: "red",     feasible: false },
  fail_fall_zone:           { label: "Fall Zone Exceeds Parcel",   color: "orange",  feasible: false },
  fail_compound_fit:        { label: "Compound Does Not Fit",      color: "orange",  feasible: false },
  fail_tower_separation:    { label: "Tower Separation Conflict",  color: "orange",  feasible: false },
  needs_manual_review:      { label: "Needs Manual Review",        color: "amber",   feasible: null  },
};

export function getResultMeta(resultClass) {
  return RESULT_META[resultClass] ?? { label: resultClass, color: "slate", feasible: null };
}