// scipStudioAssemble — creates/refreshes the ScipStudioDoc for a ScipRecord.
// Data-integrity rules:
//  • target_a is written ONCE from the original ScipRecord and never touched again.
//  • Refreshes only FILL BLANKS — analyst-entered values are never overwritten.
//  • Map exhibits keep any existing captured asset; fresh URLs only fill gaps.
// Completeness: ALL 12 required exhibits are built here (stored SCIP URLs first,
// otherwise fresh Mapbox Static Image URLs — same approach as the legacy print doc),
// plus fiber/airport/public-safety lookups so the doc prints as a complete SCIP.
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
function coverage(obj = {}) {
  const keys = Object.keys(obj);
  if (!keys.length) return 0;
  return Math.round((keys.filter((k) => !isEmpty(obj[k])).length / keys.length) * 100);
}

// ───────── Mapbox Static Images builders (ported from sitehawkScipStatic) ─────────
const STATIC_BASE = "https://api.mapbox.com/styles/v1/mapbox";
const SAT = "satellite-streets-v12", LIGHT = "light-v11", OUTDOORS = "outdoors-v12";
const W = 1000, H = 720;
const GREEN = "#628C83", GOLD = "#FFC72C", NAVY = "#0C1B2E";

function ringFeature(lat, lon, radiusMi, stroke = GOLD, width = 3) {
  const coords = [];
  const latR = radiusMi / 69.0;
  const lonR = radiusMi / (69.0 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 80; i++) {
    const t = (i / 80) * 2 * Math.PI;
    coords.push([+(lon + lonR * Math.cos(t)).toFixed(6), +(lat + latR * Math.sin(t)).toFixed(6)]);
  }
  return {
    type: "Feature",
    properties: { stroke, "stroke-width": width, "stroke-opacity": 0.95, fill: stroke, "fill-opacity": 0.06 },
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}
function pointFeature(lat, lon, color, symbol) {
  return {
    type: "Feature",
    properties: { "marker-color": color, "marker-size": "medium", ...(symbol ? { "marker-symbol": symbol } : {}) },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}
function lineFeature(aLat, aLon, bLat, bLon, color = GREEN) {
  return {
    type: "Feature",
    properties: { stroke: color, "stroke-width": 4, "stroke-opacity": 1 },
    geometry: { type: "LineString", coordinates: [[aLon, aLat], [bLon, bLat]] },
  };
}
function overlayUrl({ style, features, center, zoom, bbox, token }) {
  const geojson = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }));
  const region = bbox
    ? `[${bbox.map((n) => n.toFixed(6)).join(",")}]`
    : `${center[0].toFixed(6)},${center[1].toFixed(6)},${zoom}`;
  return `${STATIC_BASE}/${style}/static/geojson(${geojson})/${region}/${W}x${H}@2x?access_token=${token}&padding=40`;
}
function rasterCompositeUrl({ style, rasterUrl, lat, lon, pad, token }) {
  const bbox = [lon - pad, lat - pad, lon + pad, lat + pad];
  const geojson = encodeURIComponent(JSON.stringify({
    type: "FeatureCollection",
    features: [pointFeature(lat, lon, GREEN, "communications-tower")],
  }));
  const region = `[${bbox.map((n) => n.toFixed(6)).join(",")}]`;
  const overlay = `url-${encodeURIComponent(rasterUrl)}(${region}),geojson(${geojson})`;
  return `${STATIC_BASE}/${style}/static/${overlay}/${region}/${W}x${H}@2x?access_token=${token}&padding=0`;
}
function pairBbox(aLat, aLon, bLat, bLon, padFrac = 0.3) {
  const minLat = Math.min(aLat, bLat), maxLat = Math.max(aLat, bLat);
  const minLon = Math.min(aLon, bLon), maxLon = Math.max(aLon, bLon);
  const dLat = Math.max(maxLat - minLat, 0.01) * padFrac;
  const dLon = Math.max(maxLon - minLon, 0.01) * padFrac;
  return [minLon - dLon, minLat - dLat, maxLon + dLon, maxLat + dLat];
}
const marker = (lat, lon) => [pointFeature(lat, lon, GREEN, "communications-tower")];

const FEMA_EXPORT = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export";
const NWI_EXPORT = "https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export";
const ASCE_WIND_EXPORT = "https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Tile_RC_II_new/MapServer/export";

function exportPng(base, bbox, layers, size = `${W},${H}`) {
  return `${base}?` + new URLSearchParams({
    bbox: `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`,
    bboxSR: "4326", imageSR: "4326", size,
    format: "png32", transparent: "true", dpi: "96", layers, f: "image",
  });
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
    const zr = (k) => {
      const row = scip.zoning_report?.[k];
      return row && typeof row === "object" ? row.value ?? null : row ?? null;
    };

    const token = Deno.env.get("MAPBOX_API_KEY");
    const radius = parseFloat(scip.search_radius) || 1.0;
    // Exhibit anchor = candidate parcel when available, else the ring center
    const cLat = Number(tgt?.latitude ?? scip.latitude);
    const cLon = Number(tgt?.longitude ?? scip.longitude);
    const hasCoords = Number.isFinite(cLat) && Number.isFinite(cLon);

    // ── Best-effort enrichment lookups (never block assembly) ──
    let airport = null, safety = null, fiberSnap = null;
    const [airportRes, safetyRes, fiberSnaps] = await Promise.allSettled([
      base44.functions.invoke('nearestAirportFromDirectory', { lat: cLat, lon: cLon }),
      base44.functions.invoke('nearestPublicSafetyDept', { lat: cLat, lon: cLon, state: scip.state, county: scip.county }),
      base44.entities.DataSourceSnapshot.filter({ scip_record_id, section_key: "fiber", is_current: true }),
    ]);
    if (airportRes.status === "fulfilled") airport = airportRes.value?.match || airportRes.value?.data?.match || null;
    if (safetyRes.status === "fulfilled") safety = safetyRes.value?.data || safetyRes.value || null;
    if (fiberSnaps.status === "fulfilled") fiberSnap = fiberSnaps.value?.[0]?.normalized_result || null;

    // ── Fresh map URLs for ALL 12 exhibits (stored SCIP assets first) ──
    const fresh_maps = {};
    if (token && hasCoords) {
      const srcLat = Number(scip.latitude), srcLon = Number(scip.longitude);
      const ringFeatures = [ringFeature(srcLat, srcLon, radius), pointFeature(srcLat, srcLon, GOLD, "marker"), ...marker(cLat, cLon)];
      const latR = (radius / 69.0) * 1.4;
      const lonR = (radius / (69.0 * Math.cos((srcLat * Math.PI) / 180))) * 1.4;

      fresh_maps.search_ring = {
        asset_url: scip.map_image_url || overlayUrl({ style: SAT, features: ringFeatures, bbox: [srcLon - lonR, srcLat - latR, srcLon + lonR, srcLat + latR], token }),
        source: "SiteHawk SARF Map (Mapbox)",
      };
      fresh_maps.aerial_parcel = {
        asset_url: hm.aerial_url || overlayUrl({ style: SAT, features: marker(cLat, cLon), center: [cLon, cLat], zoom: 16, token }),
        source: "Mapbox Satellite",
      };
      fresh_maps.site_fit = {
        asset_url: overlayUrl({ style: SAT, features: marker(cLat, cLon), center: [cLon, cLat], zoom: 17, token }),
        source: "Mapbox Satellite — candidate close-up",
      };
      fresh_maps.zoning = {
        asset_url: hm.zoning_url || overlayUrl({ style: LIGHT, features: marker(cLat, cLon), center: [cLon, cLat], zoom: 15, token }),
        source: hm.zoning_url ? "Zoneomics overlay" : "Mapbox Light — zoning location",
      };
      fresh_maps.flum = {
        asset_url: overlayUrl({ style: LIGHT, features: marker(cLat, cLon), center: [cLon, cLat], zoom: 15, token }),
        source: "Mapbox Light — FLUM location context",
      };
      fresh_maps.floodplain = {
        asset_url: hm.floodplain_url || rasterCompositeUrl({ style: LIGHT, rasterUrl: exportPng(FEMA_EXPORT, [cLon - 0.012, cLat - 0.012, cLon + 0.012, cLat + 0.012], "show:28"), lat: cLat, lon: cLon, pad: 0.012, token }),
        source: "FEMA NFHL overlay",
      };
      fresh_maps.wetlands = {
        asset_url: rasterCompositeUrl({ style: SAT, rasterUrl: exportPng(NWI_EXPORT, [cLon - 0.012, cLat - 0.012, cLon + 0.012, cLat + 0.012], "show:0"), lat: cLat, lon: cLon, pad: 0.012, token }),
        source: "USFWS National Wetlands Inventory overlay",
      };
      fresh_maps.topography = {
        asset_url: hm.topography_url || overlayUrl({ style: OUTDOORS, features: marker(cLat, cLon), center: [cLon, cLat], zoom: 14, token }),
        source: "Mapbox Terrain",
      };
      fresh_maps.power = {
        asset_url: pa.power?.map_url || pa.power?.url || overlayUrl({ style: LIGHT, features: marker(cLat, cLon), center: [cLon, cLat], zoom: 14, token }),
        source: (pa.power?.map_url || pa.power?.url) ? "EIA/HIFLD power map" : "Mapbox Light — power service location",
      };
      fresh_maps.fiber = {
        asset_url: overlayUrl({ style: LIGHT, features: marker(cLat, cLon), center: [cLon, cLat], zoom: 14, token }),
        source: "Mapbox Light — fiber/communications location",
      };
      const aLat = Number(airport?.latitude ?? airport?.latitude_deg), aLon = Number(airport?.longitude ?? airport?.longitude_deg);
      fresh_maps.airport = {
        asset_url: pa.airport?.map_url || pa.airport?.url || (Number.isFinite(aLat) && Number.isFinite(aLon)
          ? overlayUrl({ style: LIGHT, features: [ringFeature(cLat, cLon, 0.5, "#ffffff", 1.2), lineFeature(cLat, cLon, aLat, aLon), pointFeature(aLat, aLon, GREEN, "airport"), pointFeature(cLat, cLon, NAVY, "communications-tower")], bbox: pairBbox(cLat, cLon, aLat, aLon), token })
          : null),
        source: "Airport directory map",
      };
      fresh_maps.wind = {
        asset_url: rasterCompositeUrl({ style: LIGHT, rasterUrl: exportPng(ASCE_WIND_EXPORT, [cLon - 0.35, cLat - 0.35, cLon + 0.35, cLat + 0.35], "show:5", "720,720"), lat: cLat, lon: cLon, pad: 0.35, token }),
        source: "ASCE 7-22 wind speed overlay",
      };
    }

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
      email: scip.owner_contacts?.best_email || null,
      phone: scip.owner_contacts?.best_phone || null,
      access_from: null,
      row_driveway_notes: ec.access_notes || null,
      general_directions: null,
    };

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
      fiber_available: fiberSnap?.fiber_available ?? fiberSnap?.available ?? null,
      fiber_provider: fiberSnap?.fiber_provider ?? fiberSnap?.provider ?? fiberSnap?.providers?.[0]?.name ?? null,
      nearest_fiber_route: fiberSnap?.nearest_fiber_route ?? null,
      distance_to_candidate: fiberSnap?.distance ?? fiberSnap?.distance_to_candidate ?? null,
      telco_provider: fiberSnap?.telco_provider ?? null,
      nearest_demarc: null,
      backhaul_confidence: fiberSnap?.backhaul_confidence ?? fiberSnap?.confidence ?? null,
      verification_notes: null,
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
    const airportLabel = airport?.name || airport?.airport_name || pa.airport?.name || null;
    const airportDist = airport?.distance_miles ?? pa.airport?.distance_miles ?? null;
    const environmental = {
      flood_zone: ec.flood_zone || tgt?.fema_risk_factor || null,
      wetland_concern: ec.wetland_concerns || null,
      water_management_district: ec.water_management_district || null,
      hazardous_materials: ec.hazardous_waste || null,
      topography_slope: null,
      protected_lands: null,
      access_constraint: ec.access_notes || null,
      airport_faa_concern: null,
      nearest_airport_distance: airportLabel
        ? `${airportLabel}${airportDist != null ? ` — ${Number(airportDist).toFixed(2)} mi` : ""}`
        : null,
      wind_design_criteria: null,
    };
    const police = safety?.police || null;
    const fire = safety?.fire || null;
    const emergency = {
      police_jurisdiction: ec.local_police || police?.name || null,
      police_contact: police ? [police.phone, police.street_address, police.city].filter(Boolean).join(" · ") || null : null,
      fire_jurisdiction: ec.local_fire || fire?.name || null,
      fire_contact: fire ? [fire.phone, fire.street_address, fire.city].filter(Boolean).join(" · ") || null : null,
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