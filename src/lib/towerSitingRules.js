/**
 * towerSitingRules — live drag-time siting evaluator (Tower Siter patch).
 *
 * Pure geometry: takes the engine's recompute() result (which already moved
 * the fall zone + compound with the dragged tower) and produces a plain-English
 * verdict: feasible ("May work") or not ("Will not work here") plus reasons.
 *
 * RULE-DRIVEN ONLY — every threshold (setback, fall zone, separations, height
 * cap) comes from the resolved jurisdiction rules / engine result. Nothing is
 * hardcoded per city.
 */
import * as turf from "@turf/turf";

// Live distance (ft) from the tower point to the nearest parcel boundary edge.
export function propertyLineClearanceFt(parcel, towerLonLat) {
  const lines = turf.polygonToLine(parcel);
  const feats = lines.type === "FeatureCollection" ? lines.features : [lines];
  let min = Infinity;
  for (const f of feats) {
    const d = turf.pointToLineDistance(turf.point(towerLonLat), f, { units: "feet" });
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? Math.round(min) : null;
}

/**
 * computeLiveSiting — evaluate the current (possibly mid-drag) placement.
 * @returns {null | {
 *   feasible, verdict, clearanceFt, requiredFt, fallRadiusFt,
 *   compoundW, compoundD, reasons: string[]
 * }}
 */
export function computeLiveSiting({ result, rules, compoundW, compoundD, separationCheck, residential, peAvailable = null, peApplied = false, unverified = false }) {
  if (!result || result.collapsed) return null;

  const reasons = [];
  const requiredFt = result.setback != null ? Math.round(result.setback) : null;

  let clearanceFt = null;
  try {
    clearanceFt = propertyLineClearanceFt(result.parcel, result.towerLonLat);
  } catch {
    clearanceFt = result.clearanceFt != null ? Math.round(result.clearanceFt) : null;
  }

  const c = result.checks || {};

  if (c.height?.status === "fail") {
    reasons.push(`Tower height exceeds the jurisdiction cap of ${rules?.height_limit_ft} ft.`);
  }
  if (c.setback?.status === "fail") {
    if (clearanceFt != null && requiredFt != null) {
      reasons.push(`Needs ${requiredFt} ft from property line; current clearance is ${clearanceFt} ft.`);
    } else {
      reasons.push("Tower is outside the property-line setback envelope.");
    }
  }
  if (c.fallZone?.status === "fail") {
    reasons.push("Fall zone crosses parcel boundary.");
  }
  if (c.compound?.status === "fail") {
    reasons.push(`${compoundW} ft × ${compoundD} ft compound crosses the parcel boundary here.`);
  }
  if (c.structures?.status === "fail") {
    reasons.push("Tower or compound overlaps a mapped building footprint.");
  }
  if (separationCheck?.status === "fail") {
    reasons.push(
      rules?.tower_separation_ft
        ? `Tower too close to existing tower — needs ${Math.round(rules.tower_separation_ft)} ft separation.`
        : "Tower too close to existing tower."
    );
  }
  if (residential?.result?.status === "fail") {
    reasons.push(
      rules?.residential_separation_ft
        ? `Inside residential separation buffer (${Math.round(rules.residential_separation_ft)} ft).`
        : "Inside residential/structure separation buffer."
    );
  }

  const feasible = reasons.length === 0;

  // ── Tri-state tier for the live map (green / yellow / red) ────────────────
  // GO      — every check passes clean, rules verified, no PE dependency.
  // CAUTION — conditionally buildable: fall zone fixable via a PE-certified
  //           engineered fall radius, placement passes only because a PE
  //           radius is applied, or the ordinance rules are unverified.
  // NO      — a hard check fails (setback, height cap, compound fit,
  //           separations, or fall zone with no PE path).
  // RULE-DRIVEN ONLY — no thresholds are invented here.
  const hardFail =
    c.height?.status === "fail" ||
    c.setback?.status === "fail" ||
    c.compound?.status === "fail" ||
    c.structures?.status === "fail" ||
    separationCheck?.status === "fail" ||
    residential?.result?.status === "fail";
  const fallFail = c.fallZone?.status === "fail";
  const pePossible = peAvailable !== false; // null/unknown → conservatively "possibly"

  const conditions = [];
  let tier;
  if (hardFail) {
    tier = "no";
  } else if (fallFail) {
    tier = pePossible ? "caution" : "no";
    if (pePossible) conditions.push("A PE-certified engineered fall radius could permit this placement — enable the PE toggle.");
  } else if (peApplied) {
    tier = "caution";
    conditions.push("Placement relies on a PE-certified engineered fall radius.");
  } else if (unverified) {
    tier = "caution";
    conditions.push("Ordinance rules are unverified for this jurisdiction — confirm before committing.");
  } else {
    tier = "go";
  }

  const TIER_LABEL = { go: "Buildable here", caution: "Possibly buildable", no: "Cannot build here" };

  return {
    feasible,
    verdict: feasible ? "May work" : "Will not work here",
    tier,
    tierLabel: TIER_LABEL[tier],
    conditions,
    clearanceFt,
    requiredFt,
    fallRadiusFt: result.fallRadius != null ? Math.round(result.fallRadius) : null,
    compoundW,
    compoundD,
    reasons,
  };
}

// Property-line setback band (parcel minus buildable envelope) for persistence.
export function setbackBandGeometry(parcel, envelope) {
  try {
    if (!parcel || !envelope) return null;
    const band = turf.difference(parcel, envelope);
    return band?.geometry || null;
  } catch {
    return null;
  }
}