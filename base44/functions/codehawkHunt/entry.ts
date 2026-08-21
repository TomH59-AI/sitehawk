/**
 * codehawkHunt — on-demand single-jurisdiction ordinance hunt.
 *
 * Registry-first: if SiteHawk already holds a complete, cited record we answer
 * instantly and spend nothing. Only on a miss, a gap, or an explicit refresh do
 * we go out to the official code — fetch it directly, use capped tiered
 * Scrapfly retrieval only when needed, keep OxyLabs as a final fallback, extract
 * from the text already retrieved, QC it, and write only verified quotes.
 *
 * POST {
 *   jurisdiction: string,     // required — "Brevard County" / "City of Rockledge"
 *   state: string,            // required — two-letter code
 *   force_refresh?: boolean,  // re-read the source even if the record looks complete
 *   dry_run?: boolean         // extract and QC, report what WOULD change, write nothing
 * }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { CRITICAL_FIELDS, FIELD_LABELS, completenessScore } from '../../shared/codehawk.ts';
import { loadExisting, processJurisdiction } from '../../shared/codehawkRun.ts';

function presentRecord(record) {
  if (!record) return null;
  const citations = record.field_citations || {};
  const fields = {};
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const value = record[field];
    if (value === null || value === undefined || value === '') continue;
    const citation = citations[field] || {};
    fields[field] = {
      label,
      value,
      quote: citation.quote || null,
      section_ref: citation.section_ref || record.section_ref || null,
      source_url: citation.source_url || record.source_url || null,
      confidence: citation.confidence || null,
      verified_date: citation.verified_date || null,
      cited: Boolean(citation.quote),
    };
  }
  return {
    id: record.id,
    jurisdiction: record.jurisdiction,
    state: record.state,
    verification_status: record.verification_status || 'unverified',
    completeness_score: record.completeness_score ?? completenessScore(record),
    critical_total: CRITICAL_FIELDS.length,
    missing_critical: CRITICAL_FIELDS.filter((f) => record[f] === null || record[f] === undefined || record[f] === ''),
    review_required: Boolean(record.review_required),
    last_verified_date: record.last_verified_date || null,
    source_url: record.source_url || null,
    section_ref: record.section_ref || null,
    extraction_notes: record.extraction_notes || null,
    fields,
  };
}

export default async function (req) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let runId = null;
  let base44;

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const jurisdiction = String(body.jurisdiction || '').trim();
    const state = String(body.state || '').trim().toUpperCase();
    const forceRefresh = body.force_refresh === true;
    const dryRun = body.dry_run === true;

    if (!jurisdiction || !state) {
      return Response.json({ error: 'jurisdiction and state are required' }, { status: 400 });
    }

    const existing = await loadExisting(base44, state, jurisdiction);
    const score = completenessScore(existing);

    // Registry hit, complete and cited — answer instantly, spend nothing.
    if (existing && score >= CRITICAL_FIELDS.length && !forceRefresh) {
      return Response.json({
        ok: true,
        source: 'registry',
        hunted: false,
        record: presentRecord(existing),
        message: 'Served from the SiteHawk registry. Pass force_refresh to re-read the official code.',
      });
    }

    const creds = {
      oxylabs_username: secrets.get('OXYLABS_USERNAME'),
      oxylabs_password: secrets.get('OXYLABS_PASSWORD'),
      scrapfly_key: secrets.get('SCRAPFLY_API_KEY'),
      scrapfly_call_limit: 6,
      scrapfly_asp_cost_budget: 50,
      supabase_url: secrets.get('HAWK_SUPABASE_URL'),
      supabase_key: secrets.get('HAWK_SUPABASE_SERVICE_ROLE_KEY') || secrets.get('SUPABASE_SERVICE_ROLE_KEY'),
    };

    const run = await base44.asServiceRole.entities.CodeHawkRun.create({
      run_type: dryRun ? 'dry_run' : 'on_demand',
      status: 'running',
      mode: 'single',
      batch_size: 1,
      state_filter: state,
      started_at: startedAt,
      max_scrapfly_calls: 6,
      triggered_by: user.email || 'unknown',
    });
    runId = run?.id || null;

    const counters = {
      direct_fetch_calls: 0,
      cache_hits: 0,
      census_hits: 0,
      scrapfly_calls: 0,
      scrapfly_credits: 0,
      scrapfly_cache_hits: 0,
      scrapfly_budget_exhausted: 0,
      oxylabs_calls: 0,
    };

    const result = await processJurisdiction(base44, {
      jurisdiction,
      state,
      existing,
      creds,
      runId,
      counters,
      dryRun,
      forceDiscovery: forceRefresh && !existing?.source_url,
      skipCache: forceRefresh, // force_refresh means "re-read the official code", not the cache
    });

    const updated = dryRun ? existing : await loadExisting(base44, state, jurisdiction);

    if (runId) {
      await base44.asServiceRole.entities.CodeHawkRun.update(runId, {
        status: result.action === 'error' ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedMs,
        processed: 1,
        improved: result.action === 'improved' ? 1 : 0,
        created: result.action === 'created' ? 1 : 0,
        queued_for_review: Number(result.queued || 0),
        failed: result.action === 'error' ? 1 : 0,
        fields_verified: (result.fields_written || []).length,
        direct_fetch_calls: counters.direct_fetch_calls || 0,
        cache_hits: counters.cache_hits || 0,
        scrapfly_calls: counters.scrapfly_calls || 0,
        scrapfly_credits: counters.scrapfly_credits || 0,
        scrapfly_cache_hits: counters.scrapfly_cache_hits || 0,
        scrapfly_budget_exhausted: counters.scrapfly_budget_exhausted || 0,
        scrapfly_remaining_credits: counters.scrapfly_remaining_credits,
        oxylabs_calls: counters.oxylabs_calls || 0,
        results: [result],
        error: result.error || undefined,
      });
    }

    return Response.json({
      ok: result.action !== 'error',
      source: 'hunt',
      hunted: true,
      run_id: runId,
      result,
      retrieval: {
        direct_fetch_calls: counters.direct_fetch_calls || 0,
        cache_hits: counters.cache_hits || 0,
        max_scrapfly_calls: 6,
        scrapfly_calls: counters.scrapfly_calls || 0,
        scrapfly_credits: counters.scrapfly_credits || 0,
        scrapfly_cache_hits: counters.scrapfly_cache_hits || 0,
        scrapfly_budget_exhausted: counters.scrapfly_budget_exhausted || 0,
        scrapfly_remaining_credits: counters.scrapfly_remaining_credits ?? null,
        oxylabs_calls: counters.oxylabs_calls || 0,
      },
      record: presentRecord(updated),
      registry_had: existing ? { completeness_score: score, verification_status: existing.verification_status || 'unverified' } : null,
    });
  } catch (error) {
    console.error('[codehawkHunt] error:', error?.message || String(error));
    if (runId && base44) {
      await base44.asServiceRole.entities.CodeHawkRun.update(runId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: String(error?.message || error).slice(0, 500),
      }).catch(() => {});
    }
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
