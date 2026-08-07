/**
 * CodeHawk — orchestration layer.
 *
 * processJurisdiction() is the single code path used by BOTH the on-demand
 * lookup (a user drops a new SiteHawk location) and the nightly batch, so the
 * two can never drift apart. Everything it writes has already passed the strict
 * gate in shared/codehawk.ts; everything it could not prove goes to the review
 * queue instead of being guessed at.
 */

import { findOrdinance } from './telecomOrdinance.ts';
import {
  CRITICAL_FIELDS,
  buildRecordPatch,
  completenessScore,
  discoverSourceCandidates,
  extractOrdinanceFields,
  fetchOrdinanceSource,
  gateExtraction,
  isUsableSource,
  normalizeJurisdiction,
  qualityControlPass,
  resolveBestSource,
  towerSignal,
} from './codehawk.ts';

/** Service-role view that findOrdinance() can use without touching RLS-scoped reads. */
const svc = (base44) => ({ entities: base44.asServiceRole.entities });

export async function loadExisting(base44, state, jurisdiction) {
  try {
    const { row } = await findOrdinance(svc(base44), state, jurisdiction);
    return row || null;
  } catch {
    return null;
  }
}

/** Pull every registry row once, paging through the entity list. */
export async function listAllOrdinances(base44) {
  const all = [];
  let skip = 0;
  while (skip < 20000) {
    const batch = await base44.asServiceRole.entities.TelecomOrdinance.list(null, 500, skip);
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 500) break;
    skip += 500;
  }
  return all;
}

/**
 * Existing pending review items for a jurisdiction, keyed field|value, so the
 * nightly batch cannot pile up the same unresolved proposal night after night.
 */
async function pendingQueueKeys(base44, jurisdiction, state) {
  try {
    const rows = await base44.asServiceRole.entities.OrdinanceReviewQueue.filter(
      { jurisdiction, state: String(state).toUpperCase(), status: 'pending' },
      null,
      200
    );
    return new Set((rows || []).map((r) => `${r.field_name}|${r.proposed_value}`));
  } catch {
    return new Set();
  }
}

/**
 * Work out which source to read, spending as little as possible:
 *   1. A source_url we already trust for this jurisdiction — tried free/direct.
 *   2. Only on a miss, a parallel web-research fan-out for candidate URLs.
 */
async function resolveSource(base44, { jurisdiction, state, existing, counters, creds, forceDiscovery }) {
  if (existing?.source_url && !forceDiscovery) {
    const known = await fetchOrdinanceSource(base44, existing.source_url, counters, creds, false);
    if (isUsableSource(known)) {
      return { ...known, signal: known.file_url ? 8 : towerSignal(known.text), tried: [{ url: existing.source_url, ok: true, method: known.method }] };
    }
  }

  const candidates = await discoverSourceCandidates(base44, jurisdiction, state, 4);
  // Keep the known-good URL in the running as a fallback the renderer can retry.
  if (existing?.source_url && !candidates.some((c) => c.url === existing.source_url)) {
    candidates.push({ url: existing.source_url, publisher: 'registry', section_hint: existing.section_ref || '' });
  }
  return await resolveBestSource(base44, candidates, counters, creds);
}

/**
 * Run one jurisdiction end to end.
 * Returns a plain result object suitable for both the run log and the agent.
 */
export async function processJurisdiction(base44, options) {
  const {
    jurisdiction,
    state,
    existing: passedExisting,
    creds = {},
    runId = null,
    counters = {},
    dryRun = false,
    forceDiscovery = false,
  } = options;

  const stateCode = String(state || '').toUpperCase();
  const result = {
    jurisdiction,
    state: stateCode,
    action: 'pending',
    fields_written: [],
    fields_queued: [],
    source_url: null,
    method: null,
    completeness_before: 0,
    completeness_after: 0,
  };

  try {
    const existing = passedExisting !== undefined ? passedExisting : await loadExisting(base44, stateCode, jurisdiction);
    result.completeness_before = completenessScore(existing);
    result.ordinance_id = existing?.id || null;

    const source = await resolveSource(base44, { jurisdiction, state: stateCode, existing, counters, creds, forceDiscovery });
    result.sources_tried = source?.tried || [];

    if (!isUsableSource(source)) {
      result.action = 'no_source';
      result.reason = source?.reason || 'no_usable_source';
      return result;
    }

    result.source_url = source.url;
    result.method = source.method;

    // The handoff the old pipeline was missing: the text we just fetched goes
    // straight into the extractor. No second research pass, no second scrape.
    const draft = await extractOrdinanceFields(base44, {
      jurisdiction,
      state: stateCode,
      url: source.url,
      text: source.text,
      file_url: source.file_url,
    });

    const qc = await qualityControlPass(base44, {
      jurisdiction,
      state: stateCode,
      url: source.url,
      text: source.text,
      file_url: source.file_url,
      draft,
    });

    const { patch, citations, queue, wrongJurisdiction } = gateExtraction({
      jurisdiction,
      state: stateCode,
      existing,
      draft,
      qc,
      source,
      runId,
    });

    result.fields_written = Object.keys(patch);
    result.fields_queued = queue.map((q) => `${q.field_name}:${q.reason}`);
    result.wrong_jurisdiction = Boolean(wrongJurisdiction);
    result.qc_note = qc?.overall_note || null;

    if (dryRun) {
      result.action = 'dry_run';
      result.completeness_after = completenessScore({ ...(existing || {}), ...patch });
      result.would_write = patch;
      result.would_queue = queue.map((q) => ({ field: q.field_name, value: q.proposed_value, reason: q.reason }));
      return result;
    }

    const notes = [draft?.extraction_notes, qc?.overall_note].filter(Boolean).join(' · ');
    const recordPatch = buildRecordPatch({ existing, patch, citations, queue, source, runId, notes });

    if (existing?.id) {
      await base44.asServiceRole.entities.TelecomOrdinance.update(existing.id, recordPatch);
      result.action = Object.keys(patch).length ? 'improved' : 'reverified';
    } else {
      const created = await base44.asServiceRole.entities.TelecomOrdinance.create({
        jurisdiction,
        jurisdiction_normalized: normalizeJurisdiction(jurisdiction),
        state: stateCode,
        section_ref: draft?.section_ref || undefined,
        ...recordPatch,
      });
      result.ordinance_id = created?.id || null;
      result.action = 'created';
    }

    if (queue.length) {
      const seen = await pendingQueueKeys(base44, jurisdiction, stateCode);
      const fresh = queue.filter((q) => {
        const key = `${q.field_name}|${q.proposed_value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const item of fresh) {
        await base44.asServiceRole.entities.OrdinanceReviewQueue.create({
          ...item,
          ordinance_id: item.ordinance_id || result.ordinance_id || undefined,
        });
      }
      result.queued = fresh.length;
      result.queue_duplicates_skipped = queue.length - fresh.length;
    } else {
      result.queued = 0;
    }

    result.completeness_after = completenessScore({ ...(existing || {}), ...patch });
    return result;
  } catch (error) {
    result.action = 'error';
    result.error = String(error?.message || error).slice(0, 300);
    return result;
  }
}

/* ------------------------------------------------------------------ *
 * Batch selection
 * ------------------------------------------------------------------ */

/**
 * Backfill targets: existing records missing one or more of the six critical
 * values, weakest and stalest first. The cooldown keeps the batch from grinding
 * the same jurisdiction every night when its code simply does not state a rule.
 */
export function selectBackfillTargets(records, { batchSize, stateFilter, cooldownDays = 30 }) {
  const cutoff = Date.now() - cooldownDays * 86400000;
  return (records || [])
    .filter((r) => {
      if (stateFilter && String(r.state).toUpperCase() !== String(stateFilter).toUpperCase()) return false;
      if (completenessScore(r) >= CRITICAL_FIELDS.length) return false;
      if (r.last_verified_date && new Date(r.last_verified_date).getTime() > cutoff) return false;
      return true;
    })
    .map((r) => ({
      record: r,
      score: completenessScore(r),
      staleness: r.last_verified_date ? new Date(r.last_verified_date).getTime() : 0,
    }))
    .sort((a, b) => a.score - b.score || a.staleness - b.staleness)
    .slice(0, batchSize)
    .map((x) => ({ jurisdiction: x.record.jurisdiction, state: x.record.state, existing: x.record }));
}

/** Discovery targets: jurisdictions in the registry of governing bodies we have no ordinance row for. */
export async function selectDiscoveryTargets(base44, existingRecords, { batchSize, stateFilter }) {
  const have = new Set((existingRecords || []).map((r) => `${String(r.state).toUpperCase()}|${normalizeJurisdiction(r.jurisdiction)}`));
  const gaps = [];
  let skip = 0;
  while (gaps.length < batchSize && skip < 20000) {
    const batch = await base44.asServiceRole.entities.JurisdictionRegistry.list(null, 500, skip);
    if (!batch?.length) break;
    for (const row of batch) {
      if (!row?.name || !row?.state) continue;
      if (row.jurisdiction_type === 'cbsa' || row.jurisdiction_type === 'state') continue;
      if (stateFilter && String(row.state).toUpperCase() !== String(stateFilter).toUpperCase()) continue;
      const key = `${String(row.state).toUpperCase()}|${normalizeJurisdiction(row.name)}`;
      if (have.has(key)) continue;
      have.add(key);
      gaps.push({ jurisdiction: row.name, state: row.state, existing: null });
      if (gaps.length >= batchSize) break;
    }
    if (batch.length < 500) break;
    skip += 500;
  }
  return gaps;
}

/**
 * Run a batch of jurisdictions in bounded chunks with a wall-clock budget.
 *
 * Two deliberate choices here. Chunking (rather than one big fan-out) means the
 * run record can be updated after every chunk, so if the function is killed
 * mid-batch the dashboard still shows real progress instead of a run stuck at
 * zero. And the time budget means a slow night degrades into "fewer
 * jurisdictions tonight" — the skipped ones are still incomplete, so tomorrow's
 * batch picks them up first.
 */
export async function runBatch(base44, targets, { creds, runId, dryRun, concurrency = 5, deadlineMs = 240000, onProgress }) {
  const counters = { direct_fetch_calls: 0, oxylabs_calls: 0, scrapfly_calls: 0 };
  const started = Date.now();
  const results = [];

  for (let i = 0; i < targets.length; i += concurrency) {
    if (deadlineMs && Date.now() - started > deadlineMs) {
      for (const target of targets.slice(i)) {
        results.push({ jurisdiction: target.jurisdiction, state: target.state, action: 'skipped_time_budget' });
      }
      break;
    }

    const chunk = targets.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((target) =>
        processJurisdiction(base44, { ...target, creds, runId, counters, dryRun }).catch((error) => ({
          jurisdiction: target.jurisdiction,
          state: target.state,
          action: 'error',
          error: String(error?.message || error).slice(0, 300),
        }))
      )
    );
    results.push(...chunkResults);

    if (onProgress) {
      try {
        await onProgress(results, counters);
      } catch {
        /* progress reporting must never fail the batch */
      }
    }
  }

  return { results, counters };
}

export function summarize(results) {
  const tally = { processed: 0, improved: 0, created: 0, reverified: 0, unchanged: 0, failed: 0, queued_for_review: 0, fields_verified: 0 };
  for (const r of results || []) {
    tally.processed += 1;
    if (r?.action === 'improved') tally.improved += 1;
    else if (r?.action === 'created') tally.created += 1;
    else if (r?.action === 'reverified') tally.reverified += 1;
    else if (r?.action === 'error') tally.failed += 1;
    else tally.unchanged += 1;
    tally.queued_for_review += Number(r?.queued || 0);
    tally.fields_verified += Array.isArray(r?.fields_written) ? r.fields_written.length : 0;
  }
  return tally;
}
