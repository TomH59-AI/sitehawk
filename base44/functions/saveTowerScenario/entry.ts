import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// HawkFit Map — persists a SiteTarget (if new) and a TowerScenario with its
// feasibility verdict. Called from the HawkFit Map page's Save button.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { site_target, scenario } = body || {};
    if (!site_target || !scenario) {
      return Response.json({ error: "site_target and scenario required" }, { status: 400 });
    }

    let siteTargetId = site_target.id;
    if (!siteTargetId) {
      const { id: _id, ...targetData } = site_target;
      const created = await base44.entities.SiteTarget.create(targetData);
      siteTargetId = created.id;
    }

    const saved = await base44.entities.TowerScenario.create({
      ...scenario,
      site_target_id: siteTargetId,
    });

    return Response.json({ site_target_id: siteTargetId, tower_scenario_id: saved.id });
  } catch (error) {
    console.error("saveTowerScenario error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});