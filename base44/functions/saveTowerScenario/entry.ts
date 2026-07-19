import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// HawkFit — ensures/creates the SiteTarget, then creates/updates the
// TowerScenario (lower-case fit_status). Returns { siteTarget, scenario, fit }.
const SITE_TARGET_FIELDS = ["address", "parcel_id", "owner", "acreage", "zoning", "jurisdiction", "latitude", "longitude", "parcel_geometry", "source"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { site_target, scenario, fit } = body || {};
    if (!site_target || !scenario) {
      return Response.json({ error: "site_target and scenario required" }, { status: 400 });
    }

    // Ensure the SiteTarget exists — only live schema fields are persisted.
    let siteTarget;
    if (site_target.id) {
      siteTarget = await base44.entities.SiteTarget.get(site_target.id);
    } else {
      const data = {};
      for (const k of SITE_TARGET_FIELDS) {
        if (site_target[k] != null && site_target[k] !== "") data[k] = site_target[k];
      }
      siteTarget = await base44.entities.SiteTarget.create(data);
    }

    const fitStatus = scenario.fit_status ? String(scenario.fit_status).toLowerCase() : undefined;
    const scenarioData = {
      site_target_id: siteTarget.id,
      name: scenario.name || siteTarget.address || "Tower Scenario",
      tower_lat: Number(scenario.tower_lat),
      tower_lon: Number(scenario.tower_lon),
      tower_height_ft: scenario.tower_height_ft ?? 199,
      compound_width_ft: scenario.compound_width_ft ?? 100,
      compound_depth_ft: scenario.compound_depth_ft ?? 100,
      fit_status: fitStatus,
      fit_reasons: scenario.fit_reasons || [],
      hawkperch_error_code: scenario.hawkperch_error_code || undefined,
      edge_distance_ft: scenario.edge_distance_ft ?? undefined,
      max_available_height_ft: scenario.max_available_height_ft ?? undefined,
      hawkperch_config: scenario.hawkperch_config || undefined,
      notes: scenario.notes || undefined,
    };

    let saved;
    if (scenario.id) {
      saved = await base44.entities.TowerScenario.update(scenario.id, scenarioData);
    } else {
      saved = await base44.entities.TowerScenario.create(scenarioData);
    }

    return Response.json({
      siteTarget,
      scenario: saved,
      fit: fit || { status: fitStatus, reasons: scenarioData.fit_reasons },
      // legacy keys kept for the standalone HawkFit page
      site_target_id: siteTarget.id,
      tower_scenario_id: saved.id,
    });
  } catch (error) {
    console.error("saveTowerScenario error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});