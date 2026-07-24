import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// TalonFit® run logger — rate-limits per user / per organization and writes
// one immutable audit record per execution (service role only; users cannot
// create TalonFitRunLog records directly).
const USER_LIMIT_PER_HOUR = 30;
const ORG_LIMIT_PER_HOUR = 150;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      source, parcel_id, latitude, longitude, jurisdiction,
      tower_height_ft, max_height_ft, binding_constraint, feasible, result_class,
    } = body || {};

    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      return Response.json({ error: 'latitude and longitude are required' }, { status: 400 });
    }

    const orgId = user.organization_id || (user.email || '').split('@')[1] || 'unknown';
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Rate limits — per user and per organization, rolling 1 hour.
    const [userRuns, orgRuns] = await Promise.all([
      base44.asServiceRole.entities.TalonFitRunLog.filter(
        { user_id: user.id, created_date: { $gte: hourAgo } }, '-created_date', USER_LIMIT_PER_HOUR + 1),
      base44.asServiceRole.entities.TalonFitRunLog.filter(
        { organization_id: orgId, created_date: { $gte: hourAgo } }, '-created_date', ORG_LIMIT_PER_HOUR + 1),
    ]);
    if (userRuns.length >= USER_LIMIT_PER_HOUR) {
      console.warn(`TalonFit rate limit (user) hit by ${user.email}`);
      return Response.json({ error: `TalonFit® rate limit reached — max ${USER_LIMIT_PER_HOUR} runs per hour per user.` }, { status: 429 });
    }
    if (orgRuns.length >= ORG_LIMIT_PER_HOUR) {
      console.warn(`TalonFit rate limit (org) hit by ${orgId}`);
      return Response.json({ error: `TalonFit® rate limit reached — max ${ORG_LIMIT_PER_HOUR} runs per hour for your organization.` }, { status: 429 });
    }

    const runId = crypto.randomUUID();
    await base44.asServiceRole.entities.TalonFitRunLog.create({
      run_id: runId,
      user_id: user.id,
      user_email: user.email || null,
      organization_id: orgId,
      source: source === 'hawkperch' ? 'hawkperch' : 'tower_siter',
      parcel_id: parcel_id || null,
      latitude: Number(latitude),
      longitude: Number(longitude),
      jurisdiction: jurisdiction || null,
      tower_height_ft: Number.isFinite(Number(tower_height_ft)) ? Number(tower_height_ft) : null,
      max_height_ft: Number.isFinite(Number(max_height_ft)) ? Number(max_height_ft) : null,
      binding_constraint: binding_constraint || null,
      feasible: !!feasible,
      result_class: result_class || null,
      run_timestamp_utc: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      run_id: runId,
      remaining_user_runs: USER_LIMIT_PER_HOUR - userRuns.length - 1,
    });
  } catch (error) {
    console.error('talonfitRun error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});