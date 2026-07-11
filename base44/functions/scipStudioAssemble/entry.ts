// scipStudioAssemble — creates/refreshes the ScipStudioDoc for a ScipRecord.
// Data-integrity rules:
//  • target_a is written ONCE from the original ScipRecord and never touched again.
//  • Refreshes only FILL BLANKS — analyst-entered values are never overwritten.
//  • Map exhibits keep any existing captured asset; fresh URLs only fill gaps.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const TEMPLATE_VERSION = "SCIP Document Studio Template v1";

const MAP_SET = [
  ["search_ring", "Search Ring Overview"],
  ["aerial_parcel", "Aerial & Parcel"],
  ["site_fit", "Candidate Site Fit"],
  ["zoning", "Zoning"],
  ["flum", "Future Land Use"],
  ["floodplain", "Floodplain"],
  ["wetlands", "Wetlands"],
  ["topography", "Topography"],
  ["power", "Power Infrastructure"],
  ["fiber", "Fiber / Communications"],
  ["airport", "Airport / FAA"],
  ["wind", "Wind / Design Criteria"],
];

const SCORECARD = [
  ["Parcel Fit", 20], ["Zoning Feasibility", 20], ["Access & Constructability", 15],
  ["Power & Backhaul", 15], ["Environmental Risk", 10], ["Acquisition Potential", 10],
  ["Target Coverage Fit", 10],
];

const QUALITY_GATE = [
  "Target coordinates match original record",
  "Candidate coordinates and parcel ID verified",
  "All report claims have a source",
  "Maps include legend / scale / attribution",
  "Images are readable and captioned",
  "No unresolved placeholders in final output",
  "Zoning citations and dates recorded",
  "Power-line data not represented as service confirmation",
  "Open risks clearly disclosed",
  "All included sections approved",
];

const isEmpty = (v) => v === null || v === undefined || v === "";
function fillBlanks(existing = {}, fresh = {}) {
  const out = { ...existing };
  for (const k of Object.keys(fresh)) if (isEmpty(out[k])) out[k] = fresh[k];
  return out;
}
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613, toRad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
// Coverage % = non-empty values / total keys in an object
function coverage(obj = {}) {
  const keys = Object.keys(obj);
  if (!keys.length) return 0;
  return Math.round((keys.filter((k) => !isEmpty(obj[k])).length / keys.length) * 100);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scip_record_id } = await req.json();
    if (!scip_record_id) return Response.json({ error: 'scip_record_id required' }, { status: 400 });

    const scip = await base44.entities.ScipRecord.get(scip_record_id);
    if (!scip) return Response.json({ error: 'SCIP record not found' }, { status: 404 });

    const existing = (await base44.entities.ScipStudioDoc.filter({ scip_record_id }))[0] || null;

    const tgt = scip.parcel_targets?.[scip.active_target_index || 0] || null;
    const hm = scip.hawk_maps || {};
    const pa = scip.power_airport_maps || {};
    const ec = scip.existing_conditions || {};
    // zoning_report rows may be {value,source,confidence} or plain values
    const zr = (k) => {
      const row = scip.zoning_report?.[k];
      return row && typeof row === "object" ? row.value ?? null : row ?? null;
    };

    // ---- Fresh auto-derived groups (blanks-only merge on refresh) ----
    const identity = {
      project_id: scip.id,
      site_name: scip.site_name || null,
      client: null,
      prepared_by: scip.agent_name || user.full_name || null,
      issue_date: new Date().toISOString().slice(0, 10),
    };

    // LOCKED — written once, never refreshed
    const target_a = {
      target_id: scip.id,
      site_name: scip.site_name || null,
      latitude: scip.latitude,
      longitude: scip.longitude,
      search_radius: scip.search_radius ? `${scip.search_radius} mi` : null,
      requested_height_ft: scip.sarf_height ?? null,
      county: scip.county || null,
      state: scip.state || null,
      created_date: scip.created_date || null,
      created_by: scip.created_by || null,
      original_instructions: scip.description || null,
    };

    const candidate = tgt ? {
      candidate_id: tgt.label || "Target A",
      candidate_name: tgt.parcel_address || tgt.owner_name || null,
      latitude: tgt.latitude ?? null,
      longitude: tgt.longitude ?? null,
      distance_from_target_a: (tgt.latitude != null && scip.latitude != null)
        ? `${haversineMiles(scip.latitude, scip.longitude, tgt.latitude, tgt.longitude).toFixed(2)} mi`
        : null,
      parcel_id: tgt.apn || null,
      site_address: tgt.parcel_address || null,
      parcel_size: tgt.acreage != null ? `${tgt.acreage} ac` : null,
      parcel_dimensions: tgt.boundaries || null,
      owner_of_record: tgt.owner_name || null,
      tax_status: null,
      current_use: tgt.land_use || null,
      ground_elevation: hm.center_amsl_ft != null ? `${hm.center_amsl_ft} ft AMSL` : null,
      proposed_compound_size: null,
      available_centerlines: null,
    } : {};

    const owner_access = {
      owner_entity: tgt?.owner_name || null,
      contact_person: null,
      mailing_address: tgt?.mailing_address || null,
      email: null,
      phone: null,
      access_from: null,
      row_driveway_notes: ec.access_notes || null,
      general_directions: null,
    };

    const fresh_maps = {
      search_ring: { asset_url: scip.map_image_url, source: "SiteHawk SARF Map (Mapbox)" },
      aerial_parcel: { asset_url: hm.aerial_url, source: "Mapbox Satellite" },
      zoning: { asset_url: hm.zoning_url, source: "Zoneomics overlay" },
      floodplain: { asset_url: hm.floodplain_url, source: "FEMA NFHL overlay" },
      topography: { asset_url: hm.topography_url, source: "Mapbox Terrain" },
      power: { asset_url: pa.power?.map_url || pa.power?.url, source: "EIA/HIFLD power map" },
      airport: { asset_url: pa.airport?.map_url || pa.airport?.url, source: "Airport directory map" },
    };
    const prevMaps = Object.fromEntries((existing?.map_set || []).map((m) => [m.key, m]));
    const map_set = MAP_SET.map(([key, label]) => {
      const prev = prevMaps[key];
      if (prev?.asset_url) return { ...prev, label };
      const f = fresh_maps[key];
      return {
        key, label,
        status: f?.asset_url ? "Captured" : "Not Captured",
        asset_url: f?.asset_url || null,
        captured_at: f?.asset_url ? new Date().toISOString() : null,
        source: f?.asset_url ? f.source : null,
        caption: prev?.caption || null,
      };
    });

    const powerBlock = {
      utility_owner: pa.power?.company || pa.power?.provider || pa.power?.company_name || null,
      utility_contact: [pa.power?.phone, pa.power?.address, pa.power?.website].filter(Boolean).join(" · ") || null,
      nearest_service_point: null,
      nearest_pole_asset_id: null,
      distance_to_candidate: pa.power?.distance || pa.power?.distance_miles || null,
      service_voltage: pa.power?.voltage || null,
      on_site_power_observed: null,
      field_verification_status: "Not Verified",
    };
    const fiberBlock = {
      fiber_available: null, fiber_provider: null, nearest_fiber_route: null,
      distance_to_candidate: null, telco_provider: null, nearest_demarc: null,
      backhaul_confidence: null, verification_notes: null,
    };

    const zoningOverview = {
      jurisdiction: scip.zoning_jurisdiction || null,
      planning_contact: zr("planning_contact"),
      zoning_district: tgt?.zoning_classification || zr("zoning_district") || zr("property_zoning_district"),
      future_land_use: zr("future_land_use"),
      current_use: tgt?.land_use || null,
      telecom_code_section: zr("telecom_code_section") || zr("code_section"),
      approval_process: zr("approval_process") || zr("approval_path"),
      application_fees: zr("application_fees") || zr("fees"),
      estimated_timeframe: zr("estimated_timeframe") || zr("timeframe"),
      minimum_lot_compliance: zr("minimum_lot_compliance"),
      maximum_tower_height: zr("maximum_tower_height") || zr("max_tower_height"),
      stealth_required: zr("stealth_required"),
      required_collocations: zr("required_collocations"),
      residential_separation: zr("residential_separation"),
      tower_separation: zr("tower_separation"),
      measurement_method: zr("measurement_method"),
      fall_zone_requirement: zr("fall_zone_requirement") || zr("fall_zone_requirements"),
    };
    const environmental = {
      flood_zone: ec.flood_zone || tgt?.fema_risk_factor || null,
      wetland_concern: ec.wetland_concerns || null,
      water_management_district: ec.water_management_district || null,
      hazardous_materials: ec.hazardous_waste || null,
      topography_slope: null,
      protected_lands: null,
      access_constraint: ec.access_notes || null,
      airport_faa_concern: null,
      nearest_airport_distance: pa.airport?.name
        ? `${pa.airport.name}${pa.airport.distance_miles ? ` — ${pa.airport.distance_miles} mi` : ""}`
        : null,
      wind_design_criteria: null,
    };
    const emergency = {
      police_jurisdiction: ec.local_police || null,
      police_contact: null,
      fire_jurisdiction: ec.local_fire || null,
      fire_contact: null,
      nearest_hospital_ems: null,
      emergency_access_notes: null,
    };

    const infrastructure = {
      power: fillBlanks(existing?.infrastructure?.power, powerBlock),
      hifld_lines: existing?.infrastructure?.hifld_lines || [],
      ai_assessment: existing?.infrastructure?.ai_assessment || null,
      fiber: fillBlanks(existing?.infrastructure?.fiber, fiberBlock),
      risks: existing?.infrastructure?.risks || [],
    };
    const zoning = {
      overview: fillBlanks(existing?.zoning?.overview, zoningOverview),
      environmental: fillBlanks(existing?.zoning?.environmental, environmental),
      emergency: fillBlanks(existing?.zoning?.emergency, emergency),
      source_register: existing?.zoning?.source_register || [],
    };

    const scorecard = existing?.scorecard?.length ? existing.scorecard
      : SCORECARD.map(([category, weight]) => ({
          category, weight, score: null, weighted_score: 0,
          key_evidence: category === "Parcel Fit" && tgt?.score != null
            ? `SiteHawk siting score ${tgt.score}/100${tgt.score_reasons?.length ? ` — ${tgt.score_reasons[0]}` : ""}` : null,
          status: "Not Scored",
        }));

    const quality_gate = existing?.quality_gate?.length ? existing.quality_gate
      : QUALITY_GATE.map((check) => ({ check, required: true, result: "Pending", reviewed_by: null, review_date: null, notes: null }));

    const mergedIdentity = fillBlanks(existing?.identity, identity);
    const mergedCandidate = fillBlanks(existing?.candidate, candidate);
    const mergedOwner = fillBlanks(existing?.owner_access, owner_access);

    const completion = {
      target_a: { status: "Complete", source_coverage_pct: coverage(existing?.target_a || target_a) },
      candidate_profile: { status: coverage(mergedCandidate) > 0 ? "In Progress" : "Not Started", source_coverage_pct: coverage(mergedCandidate) },
      maps_evidence: { status: map_set.some((m) => m.asset_url) ? "In Progress" : "Not Started", source_coverage_pct: Math.round((map_set.filter((m) => m.asset_url).length / MAP_SET.length) * 100) },
      power_communications: { status: coverage(infrastructure.power) > 12 ? "In Progress" : "Not Started", source_coverage_pct: coverage(infrastructure.power) },
      zoning_constraints: { status: coverage(zoning.overview) > 0 ? "In Progress" : "Not Started", source_coverage_pct: coverage(zoning.overview) },
      final_assessment: { status: "Not Started", source_coverage_pct: 0 },
    };

    const issue_record = {
      ...(existing?.issue_record || {}),
      template_version: TEMPLATE_VERSION,
      generated_by: user.email,
      generated_at: new Date().toISOString(),
    };

    const payload = {
      scip_record_id,
      identity: mergedIdentity,
      candidate: mergedCandidate,
      owner_access: mergedOwner,
      map_set,
      infrastructure,
      zoning,
      scorecard,
      quality_gate,
      completion,
      issue_record,
    };

    let doc;
    if (existing) {
      // target_a stays exactly as first written — never included in updates
      doc = await base44.entities.ScipStudioDoc.update(existing.id, payload);
    } else {
      doc = await base44.entities.ScipStudioDoc.create({ ...payload, target_a, doc_status: "draft" });
    }

    return Response.json({ doc });
  } catch (error) {
    console.error('scipStudioAssemble failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});