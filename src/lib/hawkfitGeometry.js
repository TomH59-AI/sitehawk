// HawkFit Map — shared geometry + feasibility logic (turf.js).
// Fall-zone radius = tower height. Compound is a rectangle centered on the tower.
import * as turf from "@turf/turf";

const FT_TO_KM = 0.0003048;

// Default zoning setback (ft) applied off the parcel line when the ordinance
// setback is unknown. Towers must sit at least this far inside the boundary.
const DEFAULT_SETBACK_FT = 25;

// The interior clearance a tower needs from the parcel line so BOTH the fall
// zone (radius = height) and half the compound diagonal stay inside, plus the
// zoning setback. This is the inward buffer distance for auto-placement.
export function requiredClearanceFt({ heightFt, widthFt, depthFt, setbackFt, fallZoneMultiplier = 1 }) {
  const compoundHalfDiag = Math.sqrt(widthFt * widthFt + depthFt * depthFt) / 2;
  return Math.max(heightFt * fallZoneMultiplier, compoundHalfDiag, setbackFt || 0);
}

// Auto-place the tower at the best interior point of the parcel for the given
// settings: inward-buffer the parcel by the required clearance, then take the
// "pole of inaccessibility" (the point furthest from any edge) of what remains.
// Returns { lngLat, fits } — fits=false means no point can satisfy the settings
// (parcel too small for this height/compound), and lngLat falls back to the
// parcel's overall center so the tower stays visible.
export function autoPlaceTower({ parcelGeometry, heightFt, widthFt, depthFt, zoning, waterFeatures, frontSetbackFt, sideSetbackFt, rearSetbackFt, hasPELetter = false, fallZoneMultiplier = 0.5 }) {
  if (!parcelGeometry) return { lngLat: null, fits: false };
  const parcelFeature = { type: "Feature", properties: {}, geometry: parcelGeometry };
  const setbackFt = Math.max(frontSetbackFt || 0, sideSetbackFt || 0, rearSetbackFt || 0, setbackFromZoning(zoning));
  const multiplier = hasPELetter ? Math.min(0.9, Math.max(0.1, fallZoneMultiplier)) : 1;
  const clearanceKm = requiredClearanceFt({ heightFt, widthFt, depthFt, setbackFt, fallZoneMultiplier: multiplier }) * FT_TO_KM;

  let interior = null;
  try {
    interior = turf.buffer(parcelFeature, -clearanceKm, { units: "kilometers" });
  } catch { /* buffer can fail on odd geometries */ }

  // Carve any water bodies out of the buildable interior so the placer can
  // never drop the tower in a lake/pond/river.
  interior = subtractWater(interior, waterFeatures);

  const hasArea = (f) => {
    if (!f || !f.geometry) return false;
    try { return turf.area(f) > 1; } catch { return false; }
  };

  if (hasArea(interior)) {
    const center = poleOfInaccessibility(interior);
    if (center) return { lngLat: center, fits: true };
  }
  // Parcel too small for these settings — fall back to the parcel center.
  const center = poleOfInaccessibility(parcelFeature) || turf.centroid(parcelFeature).geometry.coordinates;
  return { lngLat: center, fits: false };
}

// Furthest-from-edge interior point. Works on Polygon or MultiPolygon (picks the
// largest ring). Uses a coarse grid search — no extra deps needed.
function poleOfInaccessibility(feature) {
  let bbox;
  try { bbox = turf.bbox(feature); } catch { return null; }
  const [minX, minY, maxX, maxY] = bbox;
  const line = turf.polygonToLine(feature);
  let best = null, bestDist = -1;
  const STEPS = 24;
  for (let i = 0; i <= STEPS; i++) {
    for (let j = 0; j <= STEPS; j++) {
      const x = minX + ((maxX - minX) * i) / STEPS;
      const y = minY + ((maxY - minY) * j) / STEPS;
      const pt = turf.point([x, y]);
      if (!turf.booleanPointInPolygon(pt, feature)) continue;
      let d;
      try { d = turf.pointToLineDistance(pt, line, { units: "kilometers" }); } catch { continue; }
      if (d > bestDist) { bestDist = d; best = [x, y]; }
    }
  }
  return best;
}

// Subtract water polygons from a buildable-interior feature. Returns the
// largest dry remainder, or the original feature if there's no water / the
// subtraction fails. Accepts a GeoJSON FeatureCollection of water polygons.
function subtractWater(feature, waterFeatures) {
  const features = waterFeatures?.features || (Array.isArray(waterFeatures) ? waterFeatures : []);
  if (!feature || !features.length) return feature;
  let dry = feature;
  for (const water of features) {
    if (!water?.geometry) continue;
    try {
      const diff = turf.difference(dry, water);
      if (diff && turf.area(diff) > 1) dry = diff;
    } catch { /* skip bad water polygon */ }
  }
  // If the result is a MultiPolygon, keep the largest dry piece for placement.
  try {
    if (dry?.geometry?.type === "MultiPolygon") {
      let best = null, bestArea = -1;
      for (const coords of dry.geometry.coordinates) {
        const poly = turf.polygon(coords);
        const a = turf.area(poly);
        if (a > bestArea) { bestArea = a; best = poly; }
      }
      if (best) return best;
    }
  } catch { /* fall through */ }
  return dry;
}

// True if the point lies inside any water polygon.
function pointOnWater(lngLat, waterFeatures) {
  const features = waterFeatures?.features || (Array.isArray(waterFeatures) ? waterFeatures : []);
  if (!lngLat || !features.length) return false;
  const pt = turf.point(lngLat);
  return features.some((w) => {
    try { return w?.geometry && turf.booleanPointInPolygon(pt, w); } catch { return false; }
  });
}

// Parse a setback (ft) out of a zoning string, else the safe default.
function setbackFromZoning(zoning) {
  if (!zoning) return DEFAULT_SETBACK_FT;
  const m = String(zoning).match(/setback[^0-9]*(\d+(?:\.\d+)?)\s*(?:ft|feet|')/i);
  return m ? Number(m[1]) : DEFAULT_SETBACK_FT;
}

// PHYSICAL-FIT ONLY probe for the "Customize" mode. Verdict is decided PURELY
// by where the tower is — does the tower + fall zone + compound physically fit
// inside the parcel boundary? Zoning, water, and setbacks NEVER change the
// works/doesn't-work answer here (setback = 0). Returns { status:'works'|'fails'
// |'needs_review', reasons, fallZone, compound }. Zoning is passed back untouched
// for INFO display only via the caller.
export function computePhysicalFit({ parcelGeometry, towerLngLat, heightFt, widthFt, depthFt }) {
  const fallZone = buildFallZone(towerLngLat, heightFt);
  const compound = buildCompound(towerLngLat, widthFt, depthFt);
  const reasons = [];

  if (!parcelGeometry) {
    return {
      status: "needs_review",
      reasons: ["No parcel boundary here — can't verify a tower would physically fit."],
      fallZone, compound,
    };
  }

  const parcelFeature = { type: "Feature", properties: {}, geometry: parcelGeometry };
  const towerInside = turf.booleanPointInPolygon(turf.point(towerLngLat), parcelFeature);
  const compoundInside = towerInside && allVerticesInside(compound, parcelFeature);
  const fallZoneInside = towerInside && allVerticesInside(fallZone, parcelFeature);

  let status = "works";
  if (!towerInside) {
    status = "fails";
    reasons.push("This spot is outside the parcel — a tower here isn't on the property.");
  }
  if (towerInside && !fallZoneInside) {
    status = "fails";
    reasons.push(`Fall zone (${Math.round(heightFt)} ft radius) crosses the parcel line here — move inward or lower the height.`);
  }
  if (towerInside && !compoundInside) {
    status = "fails";
    reasons.push(`Compound (${Math.round(widthFt)}×${Math.round(depthFt)} ft) extends past the parcel line here.`);
  }
  if (status === "works") {
    reasons.push("A tower would physically fit right here — fall zone and compound stay inside the parcel.");
  }
  return { status, reasons, fallZone, compound };
}

export function buildFallZone(lngLat, heightFt, multiplier = 1) {
  return turf.circle(lngLat, heightFt * multiplier * FT_TO_KM, { steps: 64, units: "kilometers" });
}

export function buildCompound(lngLat, widthFt, depthFt) {
  const center = turf.point(lngLat);
  const halfW = (widthFt / 2) * FT_TO_KM;
  const halfD = (depthFt / 2) * FT_TO_KM;
  // Corners: go north/south (bearing 0/180) by halfD, then east/west (90/270) by halfW.
  const corner = (bD, bW) =>
    turf.destination(turf.destination(center, halfD, bD, { units: "kilometers" }), halfW, bW, { units: "kilometers" })
      .geometry.coordinates;
  const nw = corner(0, 270), ne = corner(0, 90), se = corner(180, 90), sw = corner(180, 270);
  return turf.polygon([[nw, ne, se, sw, nw]]);
}

// Deterministic containment: turf.booleanWithin for Polygon parcels, with a
// per-vertex fallback (equivalent for these convex shapes) for MultiPolygons.
function allVerticesInside(feature, parcelFeature) {
  if (parcelFeature.geometry?.type === "Polygon") {
    try { return turf.booleanWithin(feature, parcelFeature); } catch { /* fall through */ }
  }
  const coords = feature.geometry.coordinates[0];
  return coords.every((c) => turf.booleanPointInPolygon(turf.point(c), parcelFeature));
}

// HawkPerch live solver. Turf performs geodesic measurements and returns decimal
// feet, avoiding degree-based distance distortion across a parcel.
export function computeFit({
  parcelGeometry, towerLngLat, heightFt, widthFt, depthFt, zoning, waterFeatures,
  frontSetbackFt = 50, sideSetbackFt = 25, rearSetbackFt = 25,
  maxHeightFt = 199, hasPELetter = false, fallZoneMultiplier = 0.5,
}) {
  const multiplier = hasPELetter ? Math.min(0.9, Math.max(0.1, fallZoneMultiplier)) : 1;
  const fallZone = buildFallZone(towerLngLat, heightFt, multiplier);
  const compound = buildCompound(towerLngLat, widthFt, depthFt);
  const reasons = [];

  if (!parcelGeometry) {
    return { status: "needs_review", errorCode: null, reasons: ["No parcel boundary geometry available — containment cannot be verified."], fallZone, compound, edgeDistanceFt: 0, maxAvailableHeight: 0 };
  }

  const parcelFeature = { type: "Feature", properties: {}, geometry: parcelGeometry };
  const point = turf.point(towerLngLat);
  const towerInside = turf.booleanPointInPolygon(point, parcelFeature);
  const edgeDistanceFt = towerInside ? distanceToBoundaryFt(point, parcelFeature) : 0;
  const setbackFt = Math.max(frontSetbackFt, sideSetbackFt, rearSetbackFt, setbackFromZoning(zoning));
  const geometricHeight = multiplier > 0 ? edgeDistanceFt / multiplier : 0;
  const maxAvailableHeight = Math.min(maxHeightFt, geometricHeight);
  const compoundInside = towerInside && allVerticesInside(compound, parcelFeature);
  const fallZoneInside = towerInside && allVerticesInside(fallZone, parcelFeature);

  let errorCode = null;
  if (!towerInside) {
    errorCode = "ERR_EXT_P";
    reasons.push("Outside Parcel Boundary — move the tower inside Target A.");
  } else if (pointOnWater(towerLngLat, waterFeatures)) {
    errorCode = "ERR_STBK";
    reasons.push("Tower sits on a mapped water body — move it onto dry land.");
  } else if (edgeDistanceFt < setbackFt || !compoundInside) {
    errorCode = "ERR_STBK";
    reasons.push(`Setback Violation — ${Math.round(edgeDistanceFt)} ft available; ${Math.round(setbackFt)} ft required.`);
    if (!compoundInside) reasons.push(`The ${Math.round(widthFt)}×${Math.round(depthFt)} ft compound crosses the parcel line.`);
  } else if (maxAvailableHeight < 100) {
    errorCode = "ERR_H_MIN";
    reasons.push(`Below Minimum 100ft Height — this position supports only ${Math.round(maxAvailableHeight)} ft.`);
  } else if (!fallZoneInside || heightFt > maxAvailableHeight) {
    errorCode = "ERR_FZ_S";
    reasons.push(`Fall Zone Spillover — requested ${Math.round(heightFt)} ft; highest allowable here is ${Math.round(maxAvailableHeight)} ft.`);
  }

  if (!errorCode) {
    reasons.push(`Allowable site — ${Math.round(edgeDistanceFt)} ft to the nearest boundary and a ${Math.round(heightFt * multiplier)} ft fall zone.`);
    reasons.push(hasPELetter ? `PE-certified multiplier active at ${multiplier.toFixed(2)}×.` : "Standard 100% fall-zone multiplier active.");
  }

  return {
    status: errorCode ? "fails" : "works", errorCode, reasons, fallZone, compound,
    setbackFt, edgeDistanceFt, maxAvailableHeight, fallZoneMultiplier: multiplier,
  };
}

function distanceToBoundaryFt(point, parcelFeature) {
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