import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as turf from 'npm:@turf/turf@6.5.0';

// HawkFit — authoritative server-side deterministic fit check (no AI).
// Accepts { target, tower, towerHeightFt, compoundWidthFt, compoundDepthFt }
// (legacy snake_case fields also accepted) and returns { fit }.
// "works" only when fall zone AND compound stay inside the parcel (turf
// containment); "fails" when either crosses the boundary; "needs_review"
// when parcel geometry / zoning / tower data are missing.
const FT_TO_KM = 0.0003048;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const target = body.target || {};
    const parcelGeometry = target.parcel_geometry || body.parcel_geometry || null;
    const zoning = target.zoning ?? body.zoning ?? null;
    const tower = body.tower || {};
    const towerLat = tower.lat ?? body.tower_lat;
    const towerLon = tower.lon ?? tower.lng ?? body.tower_lon;
    const heightFt = Number(body.towerHeightFt ?? body.tower_height_ft ?? 199);
    const widthFt = Number(body.compoundWidthFt ?? body.compound_width_ft ?? 100);
    const depthFt = Number(body.compoundDepthFt ?? body.compound_depth_ft ?? 100);

    if (towerLat == null || towerLon == null) {
      return Response.json({
        fit: { status: "needs_review", reasons: ["Tower location is missing."], layers: {}, metrics: {} },
      });
    }

    const lngLat = [Number(towerLon), Number(towerLat)];
    const fallZone = turf.circle(lngLat, heightFt * FT_TO_KM, { steps: 64, units: "kilometers" });
    const center = turf.point(lngLat);
    const halfW = (widthFt / 2) * FT_TO_KM;
    const halfD = (depthFt / 2) * FT_TO_KM;
    const corner = (bD, bW) =>
      turf.destination(turf.destination(center, halfD, bD, { units: "kilometers" }), halfW, bW, { units: "kilometers" })
        .geometry.coordinates;
    const nw = corner(0, 270), ne = corner(0, 90), se = corner(180, 90), sw = corner(180, 270);
    const compound = turf.polygon([[nw, ne, se, sw, nw]]);
    const layers = { fallZone, compound };
    const metrics = { fall_zone_radius_ft: heightFt, compound_width_ft: widthFt, compound_depth_ft: depthFt };

    if (!parcelGeometry) {
      return Response.json({
        fit: {
          status: "needs_review",
          reasons: ["No parcel boundary geometry available — containment cannot be verified."],
          layers, metrics,
        },
      });
    }

    const parcel = { type: "Feature", properties: {}, geometry: parcelGeometry };
    // turf.booleanWithin requires Polygon containers; MultiPolygon parcels fall
    // back to per-vertex containment which is equivalent for these shapes.
    const contained = (feature) => {
      if (parcelGeometry.type === "Polygon") {
        try { return turf.booleanWithin(feature, parcel); } catch { /* fall through */ }
      }
      return feature.geometry.coordinates[0]
        .every((c) => turf.booleanPointInPolygon(turf.point(c), parcel));
    };

    const reasons = [];
    let status = "works";
    const towerInside = turf.booleanPointInPolygon(center, parcel);
    if (!towerInside) { status = "fails"; reasons.push("Tower location is outside the parcel boundary."); }
    if (towerInside && !contained(compound)) { status = "fails"; reasons.push("Compound extends beyond the parcel boundary."); }
    if (towerInside && !contained(fallZone)) { status = "fails"; reasons.push(`Fall zone (${Math.round(heightFt)} ft radius) crosses the parcel boundary.`); }
    if (status === "works" && !zoning) { status = "needs_review"; reasons.push("Zoning is unknown for this parcel — verify locally."); }
    if (status === "works") reasons.push("Compound and fall zone are fully contained within the parcel.");

    return Response.json({ fit: { status, reasons, layers, metrics } });
  } catch (error) {
    console.error("analyzeTowerFit error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});