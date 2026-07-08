// HawkFit Map — shared geometry + feasibility logic (turf.js).
// Fall-zone radius = tower height. Compound is a rectangle centered on the tower.
import * as turf from "@turf/turf";

const FT_TO_KM = 0.0003048;

export function buildFallZone(lngLat, heightFt) {
  return turf.circle(lngLat, heightFt * FT_TO_KM, { steps: 64, units: "kilometers" });
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

function allVerticesInside(feature, parcelFeature) {
  const coords = feature.geometry.coordinates[0];
  return coords.every((c) => turf.booleanPointInPolygon(turf.point(c), parcelFeature));
}

// Returns { status: 'works'|'fails'|'needs_review', reasons: [], fallZone, compound }
export function computeFit({ parcelGeometry, towerLngLat, heightFt, widthFt, depthFt, zoning }) {
  const fallZone = buildFallZone(towerLngLat, heightFt);
  const compound = buildCompound(towerLngLat, widthFt, depthFt);
  const reasons = [];
  let status = "works";

  if (!parcelGeometry) {
    return {
      status: "needs_review",
      reasons: ["No parcel boundary geometry available — containment cannot be verified."],
      fallZone,
      compound,
    };
  }

  const parcelFeature = { type: "Feature", properties: {}, geometry: parcelGeometry };
  const towerInside = turf.booleanPointInPolygon(turf.point(towerLngLat), parcelFeature);
  const compoundInside = towerInside && allVerticesInside(compound, parcelFeature);
  const fallZoneInside = towerInside && allVerticesInside(fallZone, parcelFeature);

  if (!towerInside) {
    status = "fails";
    reasons.push("Tower location is outside the parcel boundary.");
  }
  if (towerInside && !compoundInside) {
    status = "fails";
    reasons.push("Compound extends beyond the parcel boundary.");
  }
  if (towerInside && !fallZoneInside) {
    status = "fails";
    reasons.push(`Fall zone (${Math.round(heightFt)} ft radius) crosses the parcel boundary.`);
  }
  if (status === "works" && !zoning) {
    status = "needs_review";
    reasons.push("Zoning is unknown for this parcel — verify locally.");
  }
  if (status === "works") {
    reasons.push("Compound and fall zone are fully contained within the parcel.");
  }

  return { status, reasons, fallZone, compound };
}