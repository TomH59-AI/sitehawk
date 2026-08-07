/**
 * solverShadowLog — records one solver disagreement, or returns the rollup.
 *
 * Fire-and-forget from the client. This runs while the LIVE engine is still
 * authoritative, so it must never affect what a user sees: every failure path
 * returns ok and the caller ignores the response entirely.
 *
 * POST { action: 'record', diff: {...} }  -> stores one diff
 * POST { action: 'summary' }              -> admin rollup for the cutover call
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : String(v).slice(0, 500));

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'record');

    if (action === 'summary') {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

      const rows = await base44.asServiceRole.entities.SolverShadowDiff.list('-created_date', 500, 0).catch(() => []);
      const all = rows || [];

      let liveBlockedV2Allows = 0;
      let v2BlocksLiveAllows = 0;
      let v2Taller = 0;
      let v2Shorter = 0;
      let deltaSum = 0;
      let deltaCount = 0;
      let defaultSide = 0;
      const byBinding: Record<string, number> = {};
      const bySurface: Record<string, number> = {};

      for (const r of all) {
        const liveBlocked = Boolean(r.live_code);
        const v2Blocked = Array.isArray(r.v2_codes) && r.v2_codes.length > 0;
        if (liveBlocked && !v2Blocked) liveBlockedV2Allows++;
        if (!liveBlocked && v2Blocked) v2BlocksLiveAllows++;
        if (Number.isFinite(r.delta_ft)) {
          if (r.delta_ft >= 1) v2Taller++;
          else if (r.delta_ft <= -1) v2Shorter++;
          deltaSum += Math.abs(r.delta_ft);
          deltaCount++;
        }
        if (r.edge_classification === 'default_side') defaultSide++;
        if (r.binding_constraint) byBinding[r.binding_constraint] = (byBinding[r.binding_constraint] || 0) + 1;
        if (r.surface) bySurface[r.surface] = (bySurface[r.surface] || 0) + 1;
      }

      return Response.json({
        ok: true,
        total: all.length,
        live_blocked_v2_allows: liveBlockedV2Allows,
        v2_blocks_live_allows: v2BlocksLiveAllows,
        v2_taller: v2Taller,
        v2_shorter: v2Shorter,
        mean_abs_delta_ft: deltaCount ? Math.round((deltaSum / deltaCount) * 10) / 10 : 0,
        default_side_count: defaultSide,
        by_binding_constraint: byBinding,
        by_surface: bySurface,
        recent: all.slice(0, 40),
      });
    }

    const d = body.diff || {};
    const lat = num(d.lat);
    const lon = num(d.lon);

    // Dedupe server-side too: a shared browser cache is not a guarantee, and a
    // cursor drag across the same spot should not create a hundred rows.
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const existing = await base44.asServiceRole.entities.SolverShadowDiff.filter(
        {
          surface: str(d.surface) || 'unknown',
          lat: Math.round((lat as number) * 100000) / 100000,
          lon: Math.round((lon as number) * 100000) / 100000,
          live_code: str(d.live_code) || '',
        },
        null,
        1
      ).catch(() => []);
      if (existing?.length) return Response.json({ ok: true, deduped: true });
    }

    await base44.asServiceRole.entities.SolverShadowDiff.create({
      surface: str(d.surface) || 'unknown',
      jurisdiction: str(d.jurisdiction),
      lat: Number.isFinite(lat) ? Math.round((lat as number) * 100000) / 100000 : undefined,
      lon: Number.isFinite(lon) ? Math.round((lon as number) * 100000) / 100000 : undefined,
      live_code: str(d.live_code) || '',
      live_max_ft: num(d.live_max_ft),
      live_setback_ft: num(d.live_setback_ft),
      v2_codes: Array.isArray(d.v2_codes) ? d.v2_codes.slice(0, 8).map(String) : [],
      v2_max_ft: num(d.v2_max_ft),
      v2_rung: str(d.v2_rung),
      binding_constraint: str(d.binding_constraint),
      edge_classification: d.edge_classification === 'explicit' ? 'explicit' : 'default_side',
      delta_ft: num(d.delta_ft),
      explanation: str(d.explanation),
      user_email: str(user.email),
    });

    return Response.json({ ok: true });
  } catch (error) {
    // Deliberately soft: a diagnostic failure must never surface to a user.
    console.warn('[solverShadowLog]', String(error?.message || error).slice(0, 200));
    return Response.json({ ok: false });
  }
}
