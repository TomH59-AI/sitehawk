/**
 * codehawkBatch — the controlled nightly batch that replaces the
 * one-ordinance-per-day drip.
 *
 * Priority is backfill: existing registry records that are missing one or more
 * of the six critical tower-siting values, weakest and stalest first. Only when
 * the backfill queue is exhausted (or the caller asks for it) does the batch
 * move on to discovering brand-new jurisdictions.
 *
 * A 30-day cooldown keeps the batch off jurisdictions we just checked — a code
 * that genuinely does not state a fall zone must not be re-scraped every night
 * forever.
 *
 * POST {
 *   batch_size?: number,    // default 25, capped at 50
 *   state_filter?: string,  // scope to one state
 *   mode?: 'backfill' | 'discovery' | 'mixed',
 *   cooldown_days?: number, // default 30
 *   concurrency?: number,   // default 2, capped at 2 for worker safety
 *   time_budget_ms?: number,// default 240000
 *   max_scrapfly_calls?: number, // default 50, capped at 100 (0 disables Scrapfly)
 *   scrapfly_asp_cost_budget?: number, // per-request ASP ceiling, default 50
 *   dry_run?: boolean,
 *   scheduled?: boolean     // set by the nightly workflow so the run is labelled honestly
 * }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import {
  listAllOrdinances,
  runBatch,
  selectBackfillTargets,
  selectDiscoveryTargets,
  summarize,
} from '../../shared/codehawkRun.ts';

export default async function (req) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let runId = null;
  let base44;

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.max(1, Math.min(Number(body.batch_size) || 25, 50));
    const stateFilter = body.state_filter ? String(body.state_filter).toUpperCase() : null;
    const requestedMode = ['backfill', 'discovery', 'mixed'].includes(body.mode) ? body.mode : 'backfill';
    const cooldownDays = Number.isFinite(Number(body.cooldown_days)) ? Number(body.cooldown_days) : 30;
    const concurrency = Math.max(1, Math.min(Number(body.concurrency) || 2, 2));
    const timeBudgetMs = Math.max(30000, Math.min(Number(body.time_budget_ms) || 240000, 600000));
    const requestedScrapflyLimit = Number(body.max_scrapfly_calls);
    const maxScrapflyCalls = Number.isFinite(requestedScrapflyLimit)
      ? Math.max(0, Math.min(requestedScrapflyLimit, 100))
      : 50;
    const scrapflyAspCostBudget = Math.max(25, Math.min(Number(body.scrapfly_asp_cost_budget) || 50, 100));
    const dryRun = body.dry_run === true;
    // The scheduler authenticates as a real user, so we cannot infer "nightly"
    // from the absence of an email — the workflow says so explicitly instead.
    const scheduled = body.scheduled === true;

    const records = await listAllOrdinances(base44);

    let targets = [];
    let mode = requestedMode;

    if (requestedMode === 'backfill' || requestedMode === 'mixed') {
      const wanted = requestedMode === 'mixed' ? Math.ceil(batchSize * 0.7) : batchSize;
      targets = selectBackfillTargets(records, { batchSize: wanted, stateFilter, cooldownDays });
    }

    if (requestedMode === 'discovery' || targets.length < batchSize) {
      const remaining = batchSize - targets.length;
      if (remaining > 0) {
        const discovered = await selectDiscoveryTargets(base44, records, { batchSize: remaining, stateFilter });
        if (discovered.length) {
          targets = [...targets, ...discovered];
          if (requestedMode === 'backfill' && targets.length === discovered.length) mode = 'discovery';
          else if (requestedMode === 'backfill') mode = 'mixed';
        }
      }
    }

    if (!targets.length) {
      return Response.json({
        ok: true,
        processed: 0,
        message:
          stateFilter
            ? `Nothing to do for ${stateFilter}: every record is either complete or inside the ${cooldownDays}-day cooldown.`
            : `Nothing to do: every record is either complete or inside the ${cooldownDays}-day cooldown.`,
        registry_size: records.length,
      });
    }

    const run = await base44.asServiceRole.entities.CodeHawkRun.create({
      run_type: dryRun ? 'dry_run' : scheduled ? 'nightly_batch' : 'manual_batch',
      status: 'running',
      mode,
      batch_size: targets.length,
      state_filter: stateFilter || undefined,
      started_at: startedAt,
      max_scrapfly_calls: maxScrapflyCalls,
      triggered_by: scheduled ? 'scheduler' : user.email || 'unknown',
    });
    runId = run?.id || null;

    const creds = {
      oxylabs_username: secrets.get('OXYLABS_USERNAME'),
      oxylabs_password: secrets.get('OXYLABS_PASSWORD'),
      scrapfly_key: secrets.get('SCRAPFLY_API_KEY'),
      scrapfly_call_limit: maxScrapflyCalls,
      scrapfly_asp_cost_budget: scrapflyAspCostBudget,
      supabase_url: secrets.get('HAWK_SUPABASE_URL'),
      supabase_key: secrets.get('HAWK_SUPABASE_SERVICE_ROLE_KEY') || secrets.get('SUPABASE_SERVICE_ROLE_KEY'),
    };

    // Persist partial progress after every chunk so a killed function still
    // leaves an honest run record behind.
    const onProgress = async (partial, counters) => {
      if (!runId) return;
      await base44.asServiceRole.entities.CodeHawkRun.update(runId, {
        ...summarize(partial),
        direct_fetch_calls: counters.direct_fetch_calls || 0,
        cache_hits: counters.cache_hits || 0,
        scrapfly_calls: counters.scrapfly_calls || 0,
        scrapfly_credits: counters.scrapfly_credits || 0,
        scrapfly_cache_hits: counters.scrapfly_cache_hits || 0,
        scrapfly_budget_exhausted: counters.scrapfly_budget_exhausted || 0,
        scrapfly_remaining_credits: counters.scrapfly_remaining_credits,
        oxylabs_calls: counters.oxylabs_calls || 0,
      });
    };

    const { results, counters } = await runBatch(base44, targets, {
      creds,
      runId,
      dryRun,
      concurrency,
      deadlineMs: timeBudgetMs,
      onProgress,
    });

    const tally = summarize(results);
    const skipped = results.filter((r) => r?.action === 'skipped_time_budget').length;

    if (runId) {
      await base44.asServiceRole.entities.CodeHawkRun.update(runId, {
        ...tally,
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedMs,
        direct_fetch_calls: counters.direct_fetch_calls || 0,
        cache_hits: counters.cache_hits || 0,
        scrapfly_calls: counters.scrapfly_calls || 0,
        scrapfly_credits: counters.scrapfly_credits || 0,
        scrapfly_cache_hits: counters.scrapfly_cache_hits || 0,
        scrapfly_budget_exhausted: counters.scrapfly_budget_exhausted || 0,
        scrapfly_remaining_credits: counters.scrapfly_remaining_credits,
        oxylabs_calls: counters.oxylabs_calls || 0,
        results: results.slice(0, 200),
      });
    }

    console.log(
      `[codehawkBatch] mode=${mode} targets=${targets.length} improved=${tally.improved} created=${tally.created} queued=${tally.queued_for_review} scrapfly_calls=${counters.scrapfly_calls} scrapfly_credits=${counters.scrapfly_credits} oxylabs=${counters.oxylabs_calls} skipped=${skipped}`
    );

    return Response.json({
      ok: true,
      run_id: runId,
      mode,
      dry_run: dryRun,
      registry_size: records.length,
      targeted: targets.length,
      skipped_time_budget: skipped,
      ...tally,
      direct_fetch_calls: counters.direct_fetch_calls || 0,
      cache_hits: counters.cache_hits || 0,
      max_scrapfly_calls: maxScrapflyCalls,
      scrapfly_calls: counters.scrapfly_calls || 0,
      scrapfly_credits: counters.scrapfly_credits || 0,
      scrapfly_cache_hits: counters.scrapfly_cache_hits || 0,
      scrapfly_budget_exhausted: counters.scrapfly_budget_exhausted || 0,
      scrapfly_remaining_credits: counters.scrapfly_remaining_credits ?? null,
      oxylabs_calls: counters.oxylabs_calls || 0,
      results,
    });
  } catch (error) {
    console.error('[codehawkBatch] error:', error?.message || String(error));
    if (runId && base44) {
      await base44.asServiceRole.entities.CodeHawkRun.update(runId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedMs,
        error: String(error?.message || error).slice(0, 500),
      }).catch(() => {});
    }
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
