/**
 * zoningSweepAdvance — scheduled auto-advance for the Notion zoning sweep.
 *
 * The Railway scraper runs ONE job at a time. This function is safe to call on a
 * tight schedule: it reads the sweep cursor first and only fires the next batch
 * when nothing is in flight, so it naturally waits for the current job to finish
 * and then immediately picks up the next set of jurisdictions.
 *
 * stop_after_state (default 'FL') keeps the auto-advance inside one state so the
 * sweep does not roll into NC/GA unattended — once the cursor leaves that state
 * the function reports 'state_complete' and stops advancing.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { secrets } from 'base44:runtime';
import { getZoningSweepStatus, runNextZoningBatch, zoningMcpConfigured } from '../../shared/zoningScraperMcp.ts';

Deno.serve(async (req) => {
  try {
    // Invoked by the scheduled workflow (no user) or by an admin by hand.
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Admins only' }, { status: 403 });
    }

    if (!zoningMcpConfigured(secrets)) {
      return Response.json({ status: 'not_configured' }, { status: 200 });
    }

    const body = await req.json().catch(() => ({}));
    const batch = Math.min(25, Math.max(1, Number(body?.batch) || 25));
    const stopAfterState = body?.stop_after_state === null
      ? null
      : String(body?.stop_after_state || 'FL').toUpperCase();

    const sweep = await getZoningSweepStatus(secrets);
    const queue = sweep?.queue || {};
    const upNext = sweep?.up_next || {};

    if (sweep?.ok === false) {
      console.error(`[SWEEP ADVANCE] status failed: ${sweep.error}`);
      return Response.json({ status: 'status_failed', error: sweep.error }, { status: 200 });
    }

    if (upNext?.done === true || queue?.finished_at) {
      console.log('[SWEEP ADVANCE] sweep finished — nothing to advance');
      return Response.json({ status: 'sweep_complete', queue }, { status: 200 });
    }

    // A job in flight: leave it alone. The next scheduled tick picks it up.
    if (sweep?.active_job) {
      console.log(`[SWEEP ADVANCE] job ${sweep.active_job.job_id || '?'} still running — waiting`);
      return Response.json({ status: 'job_in_flight', active_job: sweep.active_job, up_next: upNext }, { status: 200 });
    }

    const currentState = String(upNext?.state || '').toUpperCase();
    if (stopAfterState && currentState && currentState !== stopAfterState) {
      console.log(`[SWEEP ADVANCE] cursor moved to ${currentState} — stopping (scoped to ${stopAfterState})`);
      return Response.json({ status: 'state_complete', completed_state: stopAfterState, next_state: currentState, up_next: upNext }, { status: 200 });
    }

    const started = await runNextZoningBatch(secrets, batch);
    if (started?.ok === false) {
      console.log(`[SWEEP ADVANCE] runNextBatch refused: ${started.error}`);
      return Response.json({ status: 'busy', error: started.error || null }, { status: 200 });
    }

    const jurisdictions = started?.batch?.jurisdictions || [];
    console.log(
      `[SWEEP ADVANCE] started job ${started?.job_id} — ${currentState} offset ${started?.batch?.offset}, ` +
        `${jurisdictions.length} jurisdictions, ${started?.batch?.remaining_in_state ?? '?'} left in state`
    );

    return Response.json({
      status: 'batch_started',
      job_id: started?.job_id || null,
      state: currentState,
      jurisdictions,
      remaining_in_state: started?.batch?.remaining_in_state ?? null,
      remaining_total: started?.batch?.remaining_total ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`zoningSweepAdvance error: ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
});