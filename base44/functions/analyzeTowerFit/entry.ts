import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as turf from 'npm:@turf/turf@6.5.0';

// HawkFit Map — authoritative server-side feasibility check.
// Mirrors src/lib/hawkfitGeometry.js: fall-zone radius = tower height,
// compound rectangle centered on the tower, both must stay inside the parcel.
const FT_TO_KM = 0.0003048;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      parcel_geometry, tower_lat, tower_lon, zoning,
      tower_height_ft = 199, compound_width_ft = 100, compound_depth_ft = 100,
    } = body || {};
    if (tower_lat == null || tower_lon == null) {
      return Response.json({ error: "tower_lat and tower_lon required" }, { status: 400 });
    }

    const lngLat = [Number(tower_lon), Number(tower_lat)];
    const reasons = [];
    let status = "works";

    if (!parcel_geometry) {
      return Response.json({
        status: "needs_review",
        reasons: ["No parcel boundary geometry available — containment cannot be verified."],
        fall_zone_radius_ft: tower_height_ft,
      });
    }

    const parcel = { type: "Feature", properties: {}, geometry: parcel_geometry };
    const fallZone = turf.circle(lngLat, tower_height_ft * FT_TO_KM, { steps: 64, units: "kilometers" });

    const center = turf.point(lngLat);
    const halfW = (compound_width_ft / 2) * FT_TO_KM;
    const halfD = (compound_depth_ft / 2) * FT_TO_KM;
    const corner = (bD, bW) =>
      turf.destination(turf.destination(center, halfD, bD, { units: "kilometers" }), halfW, bW, { units: "kilometers" })
        .geometry.coordinates;
    const nw = corner(0, 270), ne = corner(0, 90), se = corner(180, 90), sw = corner(180, 270);
    const compound = turf.polygon([[nw, ne, se, sw, nw]]);

    const inside = (feature) => feature.geometry.coordinates[0]
      .every((c) => turf.booleanPointInPolygon(turf.point(c), parcel));

    const towerInside = turf.booleanPointInPolygon(center, parcel);
    if (!towerInside) { status = "fails"; reasons.push("Tower location is outside the parcel boundary."); }
    if (towerInside && !inside(compound)) { status = "fails"; reasons.push("Compound extends beyond the parcel boundary."); }
    if (towerInside && !inside(fallZone)) { status = "fails"; reasons.push(`Fall zone (${Math.round(tower_height_ft)} ft radius) crosses the parcel boundary.`); }
    if (status === "works" && !zoning) { status = "needs_review"; reasons.push("Zoning is unknown for this parcel — verify locally."); }
    if (status === "works") reasons.push("Compound and fall zone are fully contained within the parcel.");

    return Response.json({ status, reasons, fall_zone_radius_ft: tower_height_ft });
  } catch (error) {
    console.error("analyzeTowerFit error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});