// functions/towerSiteMath.js
//
// Industry rule-of-thumb derivations for tower siting feasibility math.
// All inputs in feet, outputs in feet or square feet.
//
// Sources/defaults reflect typical AHJ requirements; per-jurisdiction
// ordinances will override these in the field. We're targeting >90% accuracy
// vs. binary truth — better than a site acq driving the street.

// Setback distance from compound fence to property line.
// Default heuristic: setback equals tower height (1:1).
// Many AHJs use 1:1; some require 1.1× or 1.5×. Tunable per call.
export function deriveSetbackFt(towerHeightFt, multiplier = 1.0) {
  return Math.ceil(towerHeightFt * multiplier);
}

// Fall zone radius — the circular area around the tower base that must be
// kept clear in case of structural failure. Industry default = tower height.
// Some jurisdictions allow 50% of height for engineered-collapse towers.
export function deriveFallZoneRadiusFt(towerHeightFt, multiplier = 1.0) {
  return Math.ceil(towerHeightFt * multiplier);
}

// Required parcel footprint = compound (with setbacks on all sides) UNION fall zone.
// We approximate the union as: max(compound-with-setback area, fall-zone area).
// This is conservative but defensible.
export function deriveRequiredParcelSqFt({
  towerHeightFt,
  compoundWidthFt,
  compoundDepthFt,
  setbackMultiplier = 1.0,
  fallZoneMultiplier = 1.0,
}) {
  const setback = deriveSetbackFt(towerHeightFt, setbackMultiplier);
  const fallZone = deriveFallZoneRadiusFt(towerHeightFt, fallZoneMultiplier);
  const compoundWithSetbackSqFt =
    (compoundWidthFt + 2 * setback) * (compoundDepthFt + 2 * setback);
  const fallZoneSqFt = Math.PI * fallZone * fallZone;
  return {
    setbackFt: setback,
    fallZoneRadiusFt: fallZone,
    compoundWithSetbackSqFt: Math.ceil(compoundWithSetbackSqFt),
    fallZoneSqFt: Math.ceil(fallZoneSqFt),
    requiredParcelSqFt: Math.ceil(Math.max(compoundWithSetbackSqFt, fallZoneSqFt)),
  };
}

export const SQFT_PER_ACRE = 43560;
export const sqFtToAcres = (sqFt) => Math.round((sqFt / SQFT_PER_ACRE) * 100) / 100;