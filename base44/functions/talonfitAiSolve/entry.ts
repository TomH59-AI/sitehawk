import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  solveTalonFit, buildCandidateSave, SOLVER_VERSION,
  MAX_RING_RADIUS_MILES, MAX_RING_RADIUS_FEET, MINIMUM_HEIGHT_FT,
} from '../../shared/talonfitAiSolver.ts';
import {
  fetchParcel, fetchOrdinanceRules, fetchWaterFeatures,
  fetchMappedStructures, fetchExistingTowers,
} from '../../shared/talonfitInputs.ts';

/**
 * talonfitAiSolve — TalonFit-AI-1.0 point solve.
 *
 * Payload: {
 *   lat, lon,                              // candidate point
 *   center_lat, center_lon,                // search ring center (SRC)
 *   requested_height_ft,                   // proposed tower height (ft AGL)
 *   compound_width_ft, compound_depth_ft,  // compound footprint (ft)
 *   pe_letter_will_be_provided,            // boolean
 *   saved_count                            // saved D/E/F candidates so far
 * }
 * Returns the full solver contract object: the assembled input plus
 * calculated_result and candidate_save. Missing source data is never invented —
 * it surfaces in calculated_result.missing_information and forces VERIFY.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat), lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }
    const realieKey = Deno.env.get("REALIE_API_KEY");
    if (!realieKey) return Response.json({ error: "REALIE_API_KEY not set" }, { status: 500 });

    const [parcel, rules, water, structures, towers] = await Promise.all([
      fetchParcel(lat, lon, realieKey).catch(() => null),
      fetchOrdinanceRules(lat, lon).catch(() => null),
      fetchWaterFeatures(lat, lon).catch(() => ({ available: false, collection: { type: "FeatureCollection", features: [] } })),
      fetchMappedStructures(lat, lon).catch(() => ({ available: false, structures: [] })),
      fetchExistingTowers(lat, lon, Deno.env.get("UNWIREDLABS_TOKEN") || "").catch(() => ({ available: false, towers: [] })),
    ]);

    if (!parcel) {
      return Response.json({
        solver_version: SOLVER_VERSION,
        candidate_point: { latitude: lat, longitude: lon },
        calculated_result: {
          decision: "REJECTED",
          map_color: "RED",
          maximum_buildable_height_ft: null,
          binding_constraint: "No parcel of record",
          reasons: ["No parcel record was returned by Realie at this coordinate — there is nothing to site on."],
          missing_information: ["parcel record (Realie)"],
        },
        candidate_save: { slot: "D", save_allowed: false, double_click_required: true, maximum_saved_candidates: 3 },
      });
    }

    const input = {
      solver_version: SOLVER_VERSION,
      candidate_point: { latitude: lat, longitude: lon },
      search_ring: {
        center: {
          latitude: Number.isFinite(Number(body.center_lat)) ? Number(body.center_lat) : lat,
          longitude: Number.isFinite(Number(body.center_lon)) ? Number(body.center_lon) : lon,
        },
        maximum_radius_miles: MAX_RING_RADIUS_MILES,
        maximum_radius_feet: MAX_RING_RADIUS_FEET,
      },
      parcel: {
        parcel_id: parcel.parcel_id,
        address: parcel.address,
        jurisdiction: rules?._jurisdiction || parcel.jurisdiction,
        zoning_classification: parcel.zoning_classification,
        geometry: parcel.geometry,
      },
      tower_proposal: {
        requested_height_ft: Number(body.requested_height_ft) || MINIMUM_HEIGHT_FT,
        minimum_height_ft: MINIMUM_HEIGHT_FT,
        compound_width_ft: Number(body.compound_width_ft) || 100,
        compound_depth_ft: Number(body.compound_depth_ft) || 100,
        pe_letter_will_be_provided: body.pe_letter_will_be_provided === true,
      },
      ordinance_rules: rules || {
        maximum_tower_height_ft: null,
        property_line_rule: { rule_name: "Property line setback", fixed_distance_ft: 0, height_multiplier: 1, data_status: "missing" },
        additional_height_dependent_rules: [],
        pe_policy: { reduction_allowed: null, standard_multiplier: 1, pe_multiplier: 0.5, pe_letter_required: true },
        tower_separation: { required_distance_ft: null, data_status: "missing" },
        structure_separation: { required_distance_ft: null, data_status: "missing" },
        approval_path: null,
        ordinance_data_verified: false,
      },
      spatial_constraints: {
        water_features: water.collection,
        existing_towers: towers.towers,
        mapped_structures: structures.structures,
        tower_data_available: towers.available,
        structure_data_available: structures.available,
        exclude_structures_intersecting_selected_parcel: true,
      },
    };

    const result = solveTalonFit(input);
    const savedCount = Number(body.saved_count) || 0;
    const candidateSave = buildCandidateSave(result, savedCount, input.candidate_point);

    console.log(`talonfitAiSolve ${result.decision} @ ${lat},${lon} max=${result.maximum_buildable_height_ft} bind=${result.binding_constraint}`);

    return Response.json({
      ...input,
      parcel_details: { owner: parcel.owner, acreage: parcel.acreage, county: parcel.county, state: parcel.state },
      ordinance_summary: rules?._summary || null,
      calculated_result: result,
      candidate_save: candidateSave,
      solved_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("talonfitAiSolve error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});