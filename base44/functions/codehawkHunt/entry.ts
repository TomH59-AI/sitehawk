/**
 * codehawkHunt — on-demand single-jurisdiction ordinance hunt.
 *
 * Registry-first: if SiteHawk already holds a complete, cited record we answer
 * instantly and spend nothing. Only on a miss, a gap, or an explicit refresh do
 * we go out to the official code — fetch it directly, escalate to OxyLabs only
 * if that fails, extract from the text we are already holding, QC it, and write
 * only what carries a verified quote.
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
      triggered_by: user.email || 'unknown',
    });
    runId = run?.id || null;

    const result = await processJurisdiction(base44, {
      jurisdiction,
      state,
      existing,
      creds,
      runId,
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
