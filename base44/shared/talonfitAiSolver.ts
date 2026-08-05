/**
 * TalonFit-AI-1.0 — canonical tower-feasibility solver.
 *
 * Implements the SiteHawk TalonFit AI solver contract EXACTLY:
 *   solver_version         = "TalonFit-AI-1.0"
 *   search ring max radius = 2 miles / 10560 ft
 *   tower minimum height   = 100 ft
 *   effective_multiplier   = IF(pe_reduction_allowed AND pe_letter_will_be_provided,
 *                               pe_multiplier, standard_multiplier)
 *   external_structures    = mapped_structures NOT intersecting the selected parcel
 *   maximum_height         = MAX(0, MIN(jurisdiction_max_height,
 *                              MIN over height rules of
 *                              ((available_distance_ft - fixed_distance_ft) / height_multiplier)))
 *
 * Decision: APPROVED (GREEN) / REJECTED (RED) / VERIFY (AMBER).
 * Nothing is fabricated — every missing, assumed or unconfirmed input forces
 * VERIFY and is named in missing_information. Heights stay in feet throughout;
 * no silent unit conversion or rounding of compliance math inputs.
 */

export const SOLVER_VERSION = "TalonFit-AI-1.0";
export const MAX_RING_RADIUS_MILES = 2;
export const MAX_RING_RADIUS_FEET = 10560;
export const MINIMUM_HEIGHT_FT = 100;
export const MAX_SAVED_CANDIDATES = 3;
export const CANDIDATE_SLOTS = ["D", "E", "F"] as const;

const FT_PER_DEG_LAT = 364000;
const FT_PER_MILE = 5280;

type Coord = { latitude: number; longitude: number };
type XY = { x: number; y: number };

// ── geometry (planar feet, anchored at the candidate latitude) ───────────────
function project(lat0: number, lon: number, lat: number): XY {
  const ftPerDegLon = FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return { x: lon * ftPerDegLon, y: lat * FT_PER_DEG_LAT };
}

function polygonRings(geometry: any): number[][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates || [];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).flat();
  return [];
}

function pointInRing(p: XY, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Point-in-polygon + distance (ft) to the nearest polygon edge. */
export function polygonCheck(geometry: any, point: Coord) {
  const rings = polygonRings(geometry);
  if (!rings.length) return null;
  const lat0 = point.latitude;
  const p = project(lat0, point.longitude, point.latitude);
  let inside = false;
  let edge = Infinity;
  rings.forEach((ring, idx) => {
    const pts = ring.map(([lon, lat]: number[]) => project(lat0, lon, lat));
    if (idx === 0 && pointInRing(p, pts)) inside = true;
    for (let i = 0; i < pts.length - 1; i++) edge = Math.min(edge, distToSegment(p, pts[i], pts[i + 1]));
  });
  return { inside, edge_distance_ft: Number.isFinite(edge) ? edge : null };
}

function haversineFeet(a: Coord, b: Coord): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R_FT = 20902231; // mean Earth radius in feet
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return R_FT * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Do two polygons overlap? Edge-distance/containment test, no external deps. */
function polygonsIntersect(a: any, b: any): boolean {
  const ringsA = polygonRings(a), ringsB = polygonRings(b);
  if (!ringsA.length || !ringsB.length) return false;
  const lat0 = ringsA[0]?.[0]?.[1] ?? 0;
  const toPts = (ring: number[][]) => ring.map(([lon, lat]) => project(lat0, lon, lat));
  for (const rb of ringsB) {
    const ptsB = toPts(rb);
    for (const ra of ringsA) {
      const ptsA = toPts(ra);
      if (ptsB.some((p) => pointInRing(p, ptsA))) return true;
      if (ptsA.some((p) => pointInRing(p, ptsB))) return true;
      for (let i = 0; i < ptsA.length - 1; i++) {
        for (let j = 0; j < ptsB.length - 1; j++) {
          // Shared/near-touching edges count as intersecting.
          if (distToSegment(ptsA[i], ptsB[j], ptsB[j + 1]) < 1) return true;
        }
      }
    }
  }
  return false;
}

const UNCONFIRMED = new Set(["assumed", "missing"]);

/**
 * Solve one candidate point against the TalonFit-AI-1.0 contract.
 * `input` is the schema object (candidate_point, search_ring, parcel,
 * tower_proposal, ordinance_rules, spatial_constraints).
 */
export function solveTalonFit(input: any) {
  const point: Coord = input.candidate_point;
  const parcel = input.parcel || {};
  const proposal = input.tower_proposal || {};
  const rules = input.ordinance_rules || {};
  const spatial = input.spatial_constraints || {};

  const reasons: string[] = [];
  const missing: string[] = [];

  // ── measurements ──────────────────────────────────────────────────────────
  const geo = polygonCheck(parcel.geometry, point);
  const insideParcel = geo?.inside ?? null;
  const distToLine = geo?.edge_distance_ft ?? null;
  if (!geo) missing.push("parcel geometry");

  const ringCenter: Coord | null = input.search_ring?.center || null;
  const ringFeet = ringCenter ? haversineFeet(ringCenter, point) : null;
  const ringMiles = ringFeet == null ? null : ringFeet / FT_PER_MILE;

  const wet = (spatial.water_features?.features || []).some(
    (f: any) => polygonCheck(f.geometry, point)?.inside
  );

  const towers = spatial.existing_towers || [];
  let nearestTowerFt: number | null = null;
  for (const t of towers) {
    if (!Number.isFinite(t?.latitude) || !Number.isFinite(t?.longitude)) continue;
    const d = haversineFeet({ latitude: t.latitude, longitude: t.longitude }, point);
    if (nearestTowerFt == null || d < nearestTowerFt) nearestTowerFt = d;
  }

  // external_structures = mapped_structures that do NOT intersect the selected parcel
  const externalStructures = (spatial.mapped_structures || []).filter((s: any) => {
    const flagged = typeof s?.intersects_selected_parcel === "boolean"
      ? s.intersects_selected_parcel
      : parcel.geometry ? polygonsIntersect(s.geometry, parcel.geometry) : false;
    return !flagged;
  });
  let nearestStructureFt: number | null = null;
  for (const s of externalStructures) {
    const c = polygonCheck(s.geometry, point);
    if (c?.edge_distance_ft == null) continue;
    const d = c.inside ? 0 : c.edge_distance_ft;
    if (nearestStructureFt == null || d < nearestStructureFt) nearestStructureFt = d;
  }

  // ── effective fall-zone multiplier ────────────────────────────────────────
  const pe = rules.pe_policy || {};
  const standardMultiplier = pe.standard_multiplier ?? 1;
  const peMultiplier = pe.pe_multiplier ?? 0.5;
  const peRequested = proposal.pe_letter_will_be_provided === true;
  const peAllowed = pe.reduction_allowed === true;
  const peUsed = peAllowed && peRequested;
  const effectiveMultiplier = peUsed ? peMultiplier : standardMultiplier;
  const peLetterRequired = peUsed ? (pe.pe_letter_required ?? true) : false;
  // Asking for a PE reduction the ordinance does not authorize is not approvable.
  const peUnauthorized = peRequested && pe.reduction_allowed === false;
  if (peRequested && pe.reduction_allowed == null) missing.push("PE fall-zone reduction policy");

  // ── maximum buildable height ──────────────────────────────────────────────
  const heightRules = [rules.property_line_rule, ...(rules.additional_height_dependent_rules || [])]
    .filter(Boolean);
  const jurisdictionCap = rules.maximum_tower_height_ft ?? null;
  if (jurisdictionCap == null) missing.push("jurisdiction maximum tower height");

  const availableFor = (rule: any): number | null => {
    const from = String(rule?.measured_from || "property line").toLowerCase();
    if (from.includes("structure")) return nearestStructureFt;
    if (from.includes("tower")) return nearestTowerFt;
    return distToLine;
  };

  let maxHeight: number | null = null;
  let binding: string | null = null;
  const caps: { label: string; value: number }[] = [];
  if (jurisdictionCap != null) caps.push({ label: "Jurisdiction maximum tower height", value: jurisdictionCap });
  for (const rule of heightRules) {
    if (UNCONFIRMED.has(rule.data_status)) missing.push(`${rule.rule_name} (${rule.data_status})`);
    const available = availableFor(rule);
    if (available == null) { missing.push(`measured distance for ${rule.rule_name}`); continue; }
    const multiplier = (rule.height_multiplier || 1) * (rule === rules.property_line_rule ? effectiveMultiplier : 1);
    caps.push({
      label: rule.rule_name,
      value: (available - (rule.fixed_distance_ft || 0)) / (multiplier || 1),
    });
  }
  if (caps.length) {
    const lowest = caps.reduce((a, b) => (b.value < a.value ? b : a));
    maxHeight = Math.max(0, lowest.value);
    binding = lowest.label;
  }

  // ── constraint evaluation, in binding order ───────────────────────────────
  const requestedHeight = proposal.requested_height_ft;
  const minHeight = proposal.minimum_height_ft ?? MINIMUM_HEIGHT_FT;
  const halfDiagonal = Math.hypot((proposal.compound_width_ft || 0) / 2, (proposal.compound_depth_ft || 0) / 2);

  const towerSep = rules.tower_separation || {};
  const structureSep = rules.structure_separation || {};
  if (UNCONFIRMED.has(towerSep.data_status)) missing.push(`tower separation (${towerSep.data_status})`);
  if (UNCONFIRMED.has(structureSep.data_status)) missing.push(`structure separation (${structureSep.data_status})`);
  if (spatial.tower_data_available === false) missing.push("existing tower data");
  if (spatial.structure_data_available === false) missing.push("mapped structure data");
  if (rules.ordinance_data_verified === false) missing.push("verified ordinance language");

  const failures: string[] = [];
  if (insideParcel === false) failures.push("Candidate point falls outside the selected parcel boundary.");
  if (ringFeet != null && ringFeet > MAX_RING_RADIUS_FEET) {
    failures.push(`Candidate is ${Math.round(ringFeet)} ft from the ring center — beyond the ${MAX_RING_RADIUS_FEET} ft (${MAX_RING_RADIUS_MILES} mile) search ring.`);
  }
  if (wet) failures.push("Candidate point falls on a mapped water feature — the point must be dry.");
  if (distToLine != null && halfDiagonal > distToLine) {
    failures.push(`The ${proposal.compound_width_ft}×${proposal.compound_depth_ft} ft compound does not fit — only ${Math.round(distToLine)} ft to the nearest property line.`);
  }
  if (peUnauthorized) failures.push("A PE fall-zone reduction was requested but the ordinance does not authorize one.");
  if (maxHeight != null && requestedHeight != null) {
    if (requestedHeight < minHeight) {
      failures.push(`Requested height ${requestedHeight} ft is below the ${minHeight} ft minimum.`);
    } else if (requestedHeight > maxHeight) {
      failures.push(`Requested height ${requestedHeight} ft exceeds the ${Math.round(maxHeight)} ft maximum buildable height (${binding}).`);
    }
  }
  if (maxHeight != null && maxHeight < minHeight) {
    failures.push(`Maximum buildable height is ${Math.round(maxHeight)} ft — below the ${minHeight} ft minimum tower height (${binding}).`);
  }
  if (towerSep.required_distance_ft != null && nearestTowerFt != null && nearestTowerFt < towerSep.required_distance_ft) {
    failures.push(`Nearest existing tower is ${Math.round(nearestTowerFt)} ft away — inside the ${towerSep.required_distance_ft} ft required separation.`);
  }
  if (structureSep.required_distance_ft != null && nearestStructureFt != null && nearestStructureFt < structureSep.required_distance_ft) {
    failures.push(`Nearest off-parcel structure is ${Math.round(nearestStructureFt)} ft away — inside the ${structureSep.required_distance_ft} ft required separation.`);
  }

  if (insideParcel == null) missing.push("point-in-parcel confirmation");
  if (maxHeight == null) missing.push("maximum buildable height inputs");

  // REJECTED when a verified requirement fails; VERIFY when inputs are unconfirmed.
  let decision: "APPROVED" | "REJECTED" | "VERIFY";
  let mapColor: "GREEN" | "RED" | "AMBER";
  if (failures.length) {
    decision = "REJECTED";
    mapColor = "RED";
    reasons.push(failures[0]);
    binding = binding || "Verified requirement failure";
  } else if (missing.length) {
    decision = "VERIFY";
    mapColor = "AMBER";
    reasons.push("Required input is missing, assumed or unconfirmed — verify before relying on this point.");
  } else {
    decision = "APPROVED";
    mapColor = "GREEN";
    reasons.push(`Approved — ${Math.round(maxHeight as number)} ft maximum buildable height, bound by ${binding}.`);
  }

  return {
    decision,
    map_color: mapColor,
    maximum_buildable_height_ft: maxHeight == null ? null : Math.max(0, Math.round(maxHeight)),
    effective_fall_zone_multiplier: effectiveMultiplier,
    pe_letter_required: peLetterRequired,
    distance_to_property_line_ft: distToLine == null ? null : Math.round(distToLine),
    distance_to_nearest_existing_tower_ft: nearestTowerFt == null ? null : Math.round(nearestTowerFt),
    distance_to_nearest_external_structure_ft: nearestStructureFt == null ? null : Math.round(nearestStructureFt),
    distance_from_ring_center_miles: ringMiles == null ? null : Math.round(ringMiles * 1000) / 1000,
    binding_constraint: binding,
    reasons,
    missing_information: [...new Set(missing)],
  };
}

/** Candidate save gate — GREEN APPROVED only, double-click, D/E/F, max three. */
export function buildCandidateSave(result: any, savedCount: number, point: Coord) {
  const slot = CANDIDATE_SLOTS[Math.min(savedCount, CANDIDATE_SLOTS.length - 1)];
  return {
    slot,
    save_allowed: result.decision === "APPROVED" && result.map_color === "GREEN" && savedCount < MAX_SAVED_CANDIDATES,
    double_click_required: true,
    maximum_saved_candidates: MAX_SAVED_CANDIDATES,
    coordinates: point,
    maximum_buildable_height_ft: result.maximum_buildable_height_ft,
    pe_letter_required: result.pe_letter_required,
    binding_constraint: result.binding_constraint,
  };
}