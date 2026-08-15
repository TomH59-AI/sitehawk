import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  findOptimalTowerPoint, buildCandidateSave, SOLVER_VERSION,
  MAX_RING_RADIUS_MILES, MAX_RING_RADIUS_FEET, MINIMUM_HEIGHT_FT,
} from '../../shared/talonfitAiSolver.ts';
import {
  fetchParcel, fetchOrdinanceRules, fetchWaterFeatures, fetchWetlandFeatures,
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
function mergeCodeHawkRules(base: any, record: any) {
  const fields = record?.fields || {};
  const value = (name: string) => fields?.[name]?.value;
  const numeric = (name: string) => Number.isFinite(Number(value(name))) ? Number(value(name)) : null;
  const heightCap = numeric("height_limit_ft");
  const setbackFt = numeric("setback_ft");
  const fallZoneFt = numeric("fall_zone_ft");
  const fallZonePct = numeric("fall_zone_pct_of_height");
  const fixedDistance = [setbackFt, fallZoneFt].filter((v) => v != null).reduce((m, v) => Math.max(m, Number(v)), 0);
  const multiplier = fallZonePct == null ? 0 : fallZonePct / 100;
  const sourceUrl = record?.source_url || fields?.height_limit_ft?.source_url || base?.ordinance_source_url || null;
  const section = record?.section_ref || fields?.height_limit_ft?.section_ref || base?.ordinance_section || null;
  const critical = ["height_limit_ft", "setback_ft", "fall_zone_ft", "residential_separation_ft", "tower_separation_ft", "pe_fall_zone_allowed"];
  const fullyCited = critical.every((name) => fields?.[name]?.cited === true);
  return {
    ...base,
    maximum_tower_height_ft: heightCap ?? base?.maximum_tower_height_ft ?? null,
    property_line_rule: {
      ...(base?.property_line_rule || {}),
      rule_name: fallZoneFt != null || fallZonePct != null ? "Fall zone / property line clearance" : "Property line setback",
      fixed_distance_ft: fixedDistance,
      height_multiplier: multiplier,
      measured_from: "property line",
      citation: section,
      data_status: setbackFt == null && fallZoneFt == null && fallZonePct == null ? "missing" : "verified",
    },
    pe_policy: {
      ...(base?.pe_policy || {}),
      reduction_allowed: typeof value("pe_fall_zone_allowed") === "boolean" ? value("pe_fall_zone_allowed") : base?.pe_policy?.reduction_allowed ?? null,
      standard_multiplier: multiplier,
      pe_multiplier: base?.pe_policy?.pe_multiplier ?? multiplier,
      citation: fields?.pe_fall_zone_allowed?.section_ref || section,
    },
    tower_separation: {
      required_distance_ft: numeric("tower_separation_ft"),
      citation: fields?.tower_separation_ft?.section_ref || section,
      data_status: numeric("tower_separation_ft") == null ? "missing" : "verified",
    },
    structure_separation: {
      required_distance_ft: numeric("residential_separation_ft"),
      citation: fields?.residential_separation_ft?.section_ref || section,
      data_status: numeric("residential_separation_ft") == null ? "missing" : "verified",
    },
    approval_path: value("permit_type") || base?.approval_path || null,
    ordinance_source_url: sourceUrl,
    ordinance_section: section,
    ordinance_data_verified: Boolean(sourceUrl && section && fullyCited),
    _summary: record?.extraction_notes || base?._summary || null,
  };
}

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

    const [parcel, initialRules, water, wetlands, structures, towers] = await Promise.all([
      fetchParcel(lat, lon, realieKey).catch(() => null),
      fetchOrdinanceRules(lat, lon).catch(() => null),
      fetchWaterFeatures(lat, lon).catch(() => ({ available: false, collection: { type: "FeatureCollection", features: [] } })),
      fetchWetlandFeatures(lat, lon).catch(() => ({ available: false, collection: { type: "FeatureCollection", features: [] } })),
      fetchMappedStructures(lat, lon).catch(() => ({ available: false, structures: [] })),
      fetchExistingTowers(lat, lon, Deno.env.get("UNWIREDLABS_TOKEN") || "").catch(() => ({ available: false, towers: [] })),
    ]);
    let rules = initialRules;

    // NightHawk path — read from the Base44 TelecomOrdinance registry FIRST.
    // NightHawk lands verified data here; TalonFit must consume it directly
    // rather than falling back to the legacy Supabase zoning-lookup edge function.
    if (parcel?.state) {
      try {
        const rawJur = String(rules?._jurisdiction || parcel.jurisdiction || parcel.county || "")
          .replace(new RegExp(`,?\\s*${parcel.state}$`, "i"), "").trim();
        const normalized = rawJur.toUpperCase()
          .replace(/^(CITY OF|COUNTY OF|TOWN OF|VILLAGE OF)\s+/, "").trim();
        if (normalized) {
          const records = await base44.asServiceRole.entities.TelecomOrdinance.filter({
            jurisdiction_normalized: normalized, state: parcel.state,
          }, "-last_verified_date", 1);
          if (records?.length) {
            const rec = records[0];
            // Map field_citations to the shape mergeCodeHawkRules expects
            const mapped = { ...rec, fields: rec.field_citations };
            rules = mergeCodeHawkRules(rules || {}, mapped);
          }
        }
      } catch (e) {
        console.warn("TelecomOrdinance registry lookup failed:", e?.message || String(e));
      }
    }

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

    // CodeHawk on-demand hunt — only fires when BOTH the TelecomOrdinance
    // registry (NightHawk path above) AND the Supabase zoning-lookup returned
    // missing or unverified data. CodeHawk escalates direct official-code fetch
    // → OxyLabs → Scrapfly, then writes verified fields back to the registry
    // so the next TalonFit run finds them without re-hunting.
    if (!rules?.ordinance_data_verified && parcel?.state) {
      try {
        const jurisdiction = String(rules?._jurisdiction || parcel.jurisdiction || parcel.county || "").replace(new RegExp(`,?\\s*${parcel.state}$`, "i"), "").trim();
        if (jurisdiction) {
          const hunted = await base44.functions.invoke("codehawkHunt", { jurisdiction, state: parcel.state, force_refresh: false });
          if (hunted?.data?.record) rules = mergeCodeHawkRules(rules || {}, hunted.data.record);
        }
      } catch (error) {
        console.warn("SiteSitter ordinance fallback unavailable:", error?.message || String(error));
      }
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
        standardized_zoning_type: parcel.standardized_zoning_type,
        standardized_zoning_subtype: parcel.standardized_zoning_subtype,
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
        wetland_features: wetlands.collection,
        existing_towers: towers.towers,
        mapped_structures: structures.structures,
        tower_data_available: towers.available,
        structure_data_available: structures.available,
        water_data_available: water.available,
        wetland_data_available: wetlands.available,
        exclude_structures_intersecting_selected_parcel: true,
      },
    };

    const optimized = findOptimalTowerPoint(input);
    const result = optimized.result;
    const optimalPoint = optimized.point;
    const savedCount = Number(body.saved_count) || 0;
    const candidateSave = buildCandidateSave(result, savedCount, optimalPoint);

    console.log(`SiteSitter ${result.decision} requested=${lat},${lon} optimal=${optimalPoint.latitude},${optimalPoint.longitude} max=${result.maximum_buildable_height_ft} bind=${result.binding_constraint}`);

    return Response.json({
      ...input,
      requested_point: { latitude: lat, longitude: lon },
      candidate_point: optimalPoint,
      optimal_location: { ...optimalPoint, evaluated_points: optimized.evaluated_count, moved_from_click: Math.abs(optimalPoint.latitude - lat) > 1e-7 || Math.abs(optimalPoint.longitude - lon) > 1e-7 },
      parcel_details: { owner: parcel.owner, acreage: parcel.acreage, county: parcel.county, state: parcel.state, zoning: parcel.zoning_classification },
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