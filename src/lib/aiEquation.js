// AI Equation — Tower Placement Analyzer (HawkPerch).
// Structured ordinance rule engine + max-allowed-height equation + buildable-area
// overlay. All distances are geodesic (turf) returned in FEET — never computed
// from raw lat/lon degrees.
import * as turf from "@turf/turf";

const FT_TO_KM = 0.0003048;

// ── BRAND ───────────────────────────────────────────────────────────────────
export const TALONFIT_NAME = "TalonFit™";
export const TALONFIT_TAGLINE = "Patent Pending";
export const TALONFIT_DEFINITION =
  "TalonFit™ is SiteHawk's proprietary tower-placement feasibility engine. It converts local telecom ordinances into a structured rule set (height caps, fall-zone multipliers, property-line setbacks, tower and residential separation), then solves a geodesic max-allowed-height equation at any point on a parcel — Max Height = min(ordinance cap, setback-derived height, fall-zone-derived height, separation-derived height). The same equation screens every Target A/B/C candidate at selection and drives the live drag-to-place fit verdict in HawkFit.";

export const AI_EQUATION_NOTICE =
  "AI Equation provides preliminary site-acquisition feasibility analysis using available parcel, mapping, zoning, and ordinance information. It is not a boundary survey, legal opinion, zoning approval, FAA determination, or professional engineering certification. Final feasibility must be confirmed by the appropriate government authority, surveyor, engineer, carrier, and other required professionals.";

export const COLOR_HEX = { green: "#10B981", yellow: "#F59E0B", red: "#EF4444" };

// Extract the first positive number from ordinance text ("150 ft", "1,000 feet").
const num = (v) => {
  if (v == null) return null;
  const m = String(v).match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Pull the telecom-requirements block out of whatever shape the Section 2
// zoning result carries (jurisdiction cache, report panel, or flat fields).
function pickTelecom(zoningResult) {
  const z = zoningResult || {};
  return (
    z.telecom_requirements ||
    z.zoning?.telecom_requirements ||
    z.report?.tower_specifics ||
    z.zoning?.tower_specifics ||
    z.tower_specifics ||
    {}
  );
}

function pickSourceUrl(zoningResult) {
  const z = zoningResult || {};
  return z.ordinance_source_url || z.source_url || z.zoning?.source_url || z.zoning?.ordinance_source_url || null;
}

// ── ORDINANCE RULE ENGINE ───────────────────────────────────────────────────
// Convert the pipeline's zoning result into structured rules. Rules the
// ordinance did not state get confidence "assumed" (safe default) or "missing"
// — those can never produce a green result on their own.
export function buildOrdinanceRules(zoningResult) {
  const t = pickTelecom(zoningResult);
  const sourceUrl = pickSourceUrl(zoningResult);
  const rules = [];

  // 1. Ordinance maximum height
  const maxH = num(t.max_tower_height ?? t.maximum_tower_height ?? t.max_height);
  rules.push({
    name: "Ordinance maximum tower height",
    category: "height",
    maxHeightFt: maxH,
    citation: t.max_height_citation || t.telecom_code_section || null,
    sourceUrl,
    confidence: maxH ? "medium" : "missing",
    verified: false,
  });

  // 2. Property-line setback / fall zone (height-based)
  const fzText = String(t.fall_zone_requirements ?? t.fall_zone_requirement ?? "");
  const pct = fzText.match(/(\d+(?:\.\d+)?)\s*%/);
  const times = fzText.match(/(\d+(?:\.\d+)?)\s*(?:x|times)/i);
  const multiplier = pct ? Number(pct[1]) / 100 : times ? Number(times[1]) : null;
  const fixedSetback = num(t.setback_rules ?? t.setbacks ?? t.property_line_setback);
  const stated = multiplier != null || fixedSetback != null;
  rules.push({
    name: "Property-line setback / fall zone",
    category: "setback",
    measuredFrom: "property line",
    fixedSetbackFt: fixedSetback || 0,
    heightMultiplier: multiplier != null ? multiplier : 1, // safe default: 100% of height
    peReductionAllowed: /\bPE\b|engineer/i.test(fzText),
    peMultiplier: 0.5,
    citation: t.fall_zone_citation || t.telecom_code_section || null,
    sourceUrl,
    confidence: stated ? "medium" : "assumed",
    verified: false,
  });

  // 3. Residential separation
  const res = num(t.residential_separation);
  rules.push({
    name: "Residential separation",
    category: "separation",
    measuredFrom: "residential structure / zone",
    fixedSetbackFt: res,
    citation: t.residential_citation || t.telecom_code_section || null,
    sourceUrl,
    confidence: res ? "medium" : "missing",
    verified: false,
  });

  // 4. Tower separation
  const sep = num(t.tower_separation);
  rules.push({
    name: "Existing-tower separation",
    category: "separation",
    measuredFrom: "existing tower",
    fixedSetbackFt: sep,
    citation: t.separation_citation || t.telecom_code_section || null,
    sourceUrl,
    confidence: sep ? "medium" : "missing",
    verified: false,
  });

  // 5. Approval path
  const approval = t.approval_path || t.approval_process || null;
  rules.push({
    name: "Approval type",
    category: "approval",
    approvalType: approval || "Unknown — manual ordinance review required",
    citation: t.approval_citation || t.telecom_code_section || null,
    sourceUrl,
    confidence: approval ? "medium" : "missing",
    verified: false,
  });

  return rules;
}

const distFt = (a, b) => turf.distance(turf.point(a), turf.point(b), { units: "kilometers" }) / FT_TO_KM;

function boundaryDistanceFt(point, parcelFeature) {
  let minKm = Infinity;
  try {
    const lines = turf.polygonToLine(parcelFeature);
    turf.flattenEach(lines, (line) => {
      const km = turf.pointToLineDistance(point, line, { units: "kilometers" });
      if (km < minKm) minKm = km;
    });
  } catch { return 0; }
  return Number.isFinite(minKm) ? minKm / FT_TO_KM : 0;
}

function onWater(lngLat, waterFeatures) {
  const features = waterFeatures?.features || [];
  if (!features.length) return false;
  const pt = turf.point(lngLat);
  return features.some((w) => {
    try { return w?.geometry && turf.booleanPointInPolygon(pt, w); } catch { return false; }
  });
}

// ── PRIMARY EQUATION ────────────────────────────────────────────────────────
// Maximum Allowed Height at P = min(ordinance max, setback-derived heights,
// fall-zone-derived height, tower-separation-derived height).
// Returns the full pass/fail/conditional/missing breakdown for the panel.
export function evaluatePoint({
  parcelGeometry, towerLngLat, requestedHeightFt, rules,
  waterFeatures, nearbyTowers = [], carrierCenter, targetA,
}) {
  const now = new Date();
  const passing = [], failing = [], conditional = [], missing = [];
  const base = {
    calculatedAt: now, requestedHeightFt,
    distFromCarrierFt: carrierCenter && towerLngLat ? distFt(towerLngLat, [carrierCenter.lon, carrierCenter.lat]) : null,
    distFromTargetAFt: targetA && towerLngLat && Number.isFinite(targetA.longitude) ? distFt(towerLngLat, [targetA.longitude, targetA.latitude]) : null,
  };

  if (!towerLngLat) return { ...base, color: "yellow", maxAllowedHeightFt: null, passing, failing, conditional, missing: ["No tower position set."], peScenario: null };

  if (!parcelGeometry) {
    missing.push("Parcel boundary geometry — containment and setbacks cannot be verified. Manual ordinance review required.");
    return { ...base, color: "yellow", maxAllowedHeightFt: null, edgeDistanceFt: null, passing, failing, conditional, missing, peScenario: null };
  }

  const parcelFeature = { type: "Feature", properties: {}, geometry: parcelGeometry };
  const pt = turf.point(towerLngLat);
  const inside = turf.booleanPointInPolygon(pt, parcelFeature);
  const edgeFt = inside ? boundaryDistanceFt(pt, parcelFeature) : 0;

  if (!inside) {
    failing.push("Proposed base is outside the parcel boundary.");
    return { ...base, color: "red", maxAllowedHeightFt: 0, edgeDistanceFt: 0, passing, failing, conditional, missing, peScenario: null };
  }
  if (onWater(towerLngLat, waterFeatures)) {
    failing.push("Proposed base sits on a mapped water body.");
  }

  // Evaluate each rule → derived max height + verdict
  const heights = []; // candidate ceilings for the min() equation
  let hardFail = failing.length > 0;
  let softFlag = false;
  let peScenario = null;
  let approvalType = null;
  const citations = [];

  for (const r of rules || []) {
    if (r.citation || r.sourceUrl) citations.push({ rule: r.name, citation: r.citation, url: r.sourceUrl });

    if (r.category === "height") {
      if (r.maxHeightFt) {
        heights.push(r.maxHeightFt);
        if (requestedHeightFt > r.maxHeightFt) {
          hardFail = true;
          failing.push(`Requested ${Math.round(requestedHeightFt)} ft exceeds the ordinance maximum of ${Math.round(r.maxHeightFt)} ft${r.citation ? ` (${r.citation})` : ""}.`);
        } else {
          passing.push(`Ordinance height limit: ${Math.round(r.maxHeightFt)} ft — requested ${Math.round(requestedHeightFt)} ft is within it.`);
        }
      } else {
        softFlag = true;
        missing.push("Ordinance maximum tower height not found. Manual ordinance review required.");
      }
    }

    if (r.category === "setback") {
      const fixed = r.fixedSetbackFt || 0;
      const mult = r.heightMultiplier ?? 1;
      const requiredFt = fixed + requestedHeightFt * mult;
      const derivedMax = mult > 0 ? Math.max(0, (edgeFt - fixed) / mult) : (edgeFt >= fixed ? Infinity : 0);
      heights.push(derivedMax);
      if (edgeFt >= requiredFt) {
        passing.push(`${r.name}: ${Math.round(edgeFt)} ft to the nearest property line; ${Math.round(requiredFt)} ft required (${fixed ? `${fixed} ft + ` : ""}${Math.round(mult * 100)}% of height).`);
      } else {
        const shortBy = Math.round(requiredFt - edgeFt);
        const msg = `${r.name}: requested height ${Math.round(requestedHeightFt)} ft. Maximum calculated height at this location: ${Math.round(derivedMax)} ft. The proposed base is ${Math.round(edgeFt)} ft from the nearest property line; ${r.citation ? `${r.citation} requires` : "the ordinance rule requires"} ${Math.round(requiredFt)} ft. This location fails by ${shortBy} ft.`;
        if (r.confidence === "assumed") { softFlag = true; conditional.push(`${msg} (Default rule — ordinance language not confirmed. Manual ordinance review required.)`); }
        else { hardFail = true; failing.push(msg); }
      }
      // PE scenario — only when the ordinance authorizes it
      if (r.peReductionAllowed) {
        const peMult = r.peMultiplier ?? 0.5;
        const peRequired = fixed + requestedHeightFt * peMult;
        peScenario = {
          allowed: true,
          multiplier: peMult,
          result: edgeFt >= peRequired ? "pass" : "fail",
          detail: `With a PE-certified fall-zone reduction (${Math.round(peMult * 100)}% of height): ${Math.round(peRequired)} ft required vs ${Math.round(edgeFt)} ft available.`,
        };
      }
    }

    if (r.category === "separation" && r.measuredFrom === "existing tower") {
      if (!r.fixedSetbackFt) {
        missing.push("Tower-separation distance not stated in the ordinance data.");
        softFlag = true;
      } else if (!nearbyTowers.length) {
        conditional.push(`Tower separation of ${Math.round(r.fixedSetbackFt)} ft required — no nearby-tower data loaded; verify separately.`);
        softFlag = true;
      } else {
        let minFt = Infinity;
        for (const t of nearbyTowers) {
          const lon = t.lon ?? t.longitude, lat = t.lat ?? t.latitude;
          if (Number.isFinite(lon) && Number.isFinite(lat)) minFt = Math.min(minFt, distFt(towerLngLat, [lon, lat]));
        }
        if (minFt >= r.fixedSetbackFt) passing.push(`Tower separation: nearest existing tower ${Math.round(minFt)} ft away; ${Math.round(r.fixedSetbackFt)} ft required.`);
        else { hardFail = true; failing.push(`Tower separation: nearest existing tower is ${Math.round(minFt)} ft away; ${Math.round(r.fixedSetbackFt)} ft required${r.citation ? ` (${r.citation})` : ""}.`); }
      }
    }

    if (r.category === "separation" && r.measuredFrom !== "existing tower") {
      if (r.fixedSetbackFt) { conditional.push(`${r.name}: ${Math.round(r.fixedSetbackFt)} ft required — residential boundary data not loaded; verify separately.`); softFlag = true; }
      else { missing.push(`${r.name} distance not stated in the ordinance data.`); softFlag = true; }
    }

    if (r.category === "approval") {
      approvalType = r.approvalType;
      if (r.confidence === "missing") softFlag = true;
    }
  }

  const maxAllowedHeightFt = Math.max(0, Math.min(...heights.filter((h) => Number.isFinite(h)), Infinity) === Infinity ? 0 : Math.min(...heights.filter((h) => Number.isFinite(h))));

  if (requestedHeightFt < 100) {
    hardFail = true;
    failing.push(`Requested height ${Math.round(requestedHeightFt)} ft is below the 100 ft minimum.`);
  }

  const color = hardFail ? "red" : softFlag ? "yellow" : "green";
  return {
    ...base, color, maxAllowedHeightFt, edgeDistanceFt: edgeFt,
    passing, failing, conditional, missing, peScenario, approvalType, citations,
  };
}

// ── BUILDABLE-AREA OVERLAY ──────────────────────────────────────────────────
// Grid-sample the parcel and color each cell green / yellow / red for the
// requested height. Uses the same setback math as evaluatePoint (fast path).
export function buildBuildableOverlay({ parcelGeometry, requestedHeightFt, rules, waterFeatures }) {
  if (!parcelGeometry) return null;
  const parcelFeature = { type: "Feature", properties: {}, geometry: parcelGeometry };
  let bbox, lines;
  try { bbox = turf.bbox(parcelFeature); lines = turf.polygonToLine(parcelFeature); } catch { return null; }

  const setbackRule = (rules || []).find((r) => r.category === "setback") || { fixedSetbackFt: 0, heightMultiplier: 1, confidence: "assumed" };
  const heightRule = (rules || []).find((r) => r.category === "height");
  const ordMax = heightRule?.maxHeightFt || Infinity;
  const anyMissing = (rules || []).some((r) => r.confidence === "missing" || r.confidence === "assumed");

  const widthKm = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[1]], { units: "kilometers" });
  const heightKm = turf.distance([bbox[0], bbox[1]], [bbox[0], bbox[3]], { units: "kilometers" });
  const cellKm = Math.max(Math.max(widthKm, heightKm) / 30, 0.004); // ≥ ~13 ft cells, ≤ 30×30 grid
  let grid;
  try { grid = turf.squareGrid(bbox, cellKm, { units: "kilometers" }); } catch { return null; }

  const cells = [];
  let greenArea = 0, best = null;
  const edgeFtOf = (pt) => {
    let minKm = Infinity;
    turf.flattenEach(lines, (line) => {
      const km = turf.pointToLineDistance(pt, line, { units: "kilometers" });
      if (km < minKm) minKm = km;
    });
    return minKm / FT_TO_KM;
  };

  for (const cell of grid.features) {
    const center = turf.centroid(cell);
    if (!turf.booleanPointInPolygon(center, parcelFeature)) continue;
    const lngLat = center.geometry.coordinates;
    const edgeFt = edgeFtOf(center);
    const fixed = setbackRule.fixedSetbackFt || 0;
    const mult = setbackRule.heightMultiplier ?? 1;
    const derivedMax = mult > 0 ? Math.max(0, (edgeFt - fixed) / mult) : edgeFt >= fixed ? ordMax : 0;
    const maxH = Math.min(ordMax, derivedMax);
    let color;
    if (onWater(lngLat, waterFeatures) || maxH < requestedHeightFt || requestedHeightFt > ordMax) color = "red";
    else if (anyMissing) color = "yellow";
    else color = "green";
    cell.properties = { fill: COLOR_HEX[color], color, maxH: Math.round(maxH) };
    cells.push(cell);
    const cellArea = turf.area(cell);
    if (color !== "red") {
      greenArea += cellArea;
      if (!best || maxH > best.maxH) best = { lngLat, maxH, edgeFt };
    }
  }

  const parcelArea = turf.area(parcelFeature); // m²
  const M2_TO_ACRES = 0.000247105;
  return {
    fc: { type: "FeatureCollection", features: cells },
    stats: {
      parcelAcres: parcelArea * M2_TO_ACRES,
      buildableAcres: greenArea * M2_TO_ACRES,
      buildablePct: parcelArea > 0 ? Math.min(100, (greenArea / parcelArea) * 100) : 0,
      bestPoint: best ? { lat: best.lngLat[1], lon: best.lngLat[0], maxHeightFt: Math.round(best.maxH), edgeDistanceFt: Math.round(best.edgeFt) } : null,
      conditional: anyMissing,
    },
  };
}

// ── TARGET PRE-SCREEN ───────────────────────────────────────────────────────
// Run the same AI Equation over a whole parcel to answer: "will the requested
// tower height work ANYWHERE good on this parcel?" Used by Section 3 to vet
// Target A/B/C candidates at selection time.
export function screenParcel({ parcelGeometry, requestedHeightFt, rules }) {
  if (!parcelGeometry) {
    return { color: "yellow", maxHeightFt: null, bestPoint: null, reasons: ["No parcel boundary geometry — AI Equation cannot verify tower fit. Manual review required."] };
  }
  const overlay = buildBuildableOverlay({ parcelGeometry, requestedHeightFt, rules, waterFeatures: null });
  if (!overlay) {
    return { color: "yellow", maxHeightFt: null, bestPoint: null, reasons: ["Parcel geometry could not be analyzed. Manual review required."] };
  }
  let { bestPoint, conditional, buildableAcres, buildablePct } = overlay.stats;
  if (!bestPoint) {
    // Nothing supports the requested height — find the parcel's TRUE max height
    // so the failure message says exactly how tall a tower could go.
    const probe = buildBuildableOverlay({ parcelGeometry, requestedHeightFt: 0, rules, waterFeatures: null });
    const trueMax = probe?.stats?.bestPoint?.maxHeightFt ?? 0;
    return {
      color: "red", maxHeightFt: trueMax, bestPoint: probe?.stats?.bestPoint || null,
      reasons: [`Requested ${Math.round(requestedHeightFt)} ft — the best position on this parcel supports only ${Math.round(trueMax)} ft under the connected ordinance rules.`],
    };
  }
  if (requestedHeightFt < 100) {
    return { color: "red", maxHeightFt: bestPoint.maxHeightFt, bestPoint, reasons: [`Requested height ${Math.round(requestedHeightFt)} ft is below the 100 ft minimum.`] };
  }
  const reasons = [
    `Best base point supports ${bestPoint.maxHeightFt} ft (${bestPoint.edgeDistanceFt} ft to nearest boundary).`,
    `Buildable: ${buildableAcres.toFixed(2)} ac (${buildablePct.toFixed(0)}% of parcel).`,
  ];
  if (conditional) reasons.push("Ordinance data incomplete or assumed — manual ordinance review required before relying on this result.");
  return { color: conditional ? "yellow" : "green", maxHeightFt: bestPoint.maxHeightFt, bestPoint, buildableAcres, buildablePct, reasons };
}

export const ftToMiles = (ft) => (ft == null ? null : ft / 5280);