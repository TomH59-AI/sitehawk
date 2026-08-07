/**
 * codehawkStats — registry health for the CodeHawk processing dashboard.
 *
 * Answers the question the current registry cannot: of the jurisdictions we
 * claim to cover, how many actually carry the six values that decide whether a
 * tower can be sited, and how many of those are backed by a real citation.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { CRITICAL_FIELDS, FIELD_LABELS, completenessScore } from '../../shared/codehawk.ts';
import { listAllOrdinances } from '../../shared/codehawkRun.ts';

// A run that claims to be running but has not been touched in 30 minutes was killed.
const STALE_RUN_MS = 30 * 60 * 1000;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const records = await listAllOrdinances(base44);

    const histogram = Array.from({ length: CRITICAL_FIELDS.length + 1 }, () => 0);
    const byStatus = {};
    const byState = {};
    const fieldCoverage = {};
    for (const field of CRITICAL_FIELDS) fieldCoverage[field] = { label: FIELD_LABELS[field], populated: 0, cited: 0 };

    let citedAnywhere = 0;
    let hasSourceUrl = 0;

    for (const record of records) {
      const score = completenessScore(record);
      histogram[score] += 1;

      const status = record.verification_status || 'unverified';
      byStatus[status] = (byStatus[status] || 0) + 1;

      const state = String(record.state || '??').toUpperCase();
      if (!byState[state]) byState[state] = { state, total: 0, complete: 0, empty: 0, gap: 0 };
      byState[state].total += 1;
      if (score >= CRITICAL_FIELDS.length) byState[state].complete += 1;
      if (score === 0) byState[state].empty += 1;
      byState[state].gap = byState[state].total - byState[state].complete;

      if (record.source_url) hasSourceUrl += 1;

      const citations = record.field_citations || {};
      if (Object.keys(citations).length) citedAnywhere += 1;

      for (const field of CRITICAL_FIELDS) {
        const value = record[field];
        if (value === null || value === undefined || value === '') continue;
        fieldCoverage[field].populated += 1;
        if (citations[field]?.quote) fieldCoverage[field].cited += 1;
      }
    }

    const [recentRuns, pendingReview] = await Promise.all([
      base44.asServiceRole.entities.CodeHawkRun.list('-created_date', 12, 0).catch(() => []),
      base44.asServiceRole.entities.OrdinanceReviewQueue.filter({ status: 'pending' }, null, 500).catch(() => []),
    ]);

    const now = Date.now();
    const runs = (recentRuns || []).map((run) => {
      const touched = new Date(run.updated_date || run.started_at || run.created_date || 0).getTime();
      const stalled = run.status === 'running' && now - touched > STALE_RUN_MS;
      return {
        id: run.id,
        run_type: run.run_type,
        mode: run.mode || null,
        status: stalled ? 'timed_out' : run.status,
        started_at: run.started_at || run.created_date,
        completed_at: run.completed_at || null,
        duration_ms: run.duration_ms || null,
        batch_size: run.batch_size || 0,
        processed: run.processed || 0,
        improved: run.improved || 0,
        created: run.created || 0,
        queued_for_review: run.queued_for_review || 0,
        failed: run.failed || 0,
        fields_verified: run.fields_verified || 0,
        oxylabs_calls: run.oxylabs_calls || 0,
        direct_fetch_calls: run.direct_fetch_calls || 0,
        state_filter: run.state_filter || null,
        triggered_by: run.triggered_by || null,
        error: run.error || null,
      };
    });

    const queueByReason = {};
    for (const item of pendingReview || []) {
      queueByReason[item.reason] = (queueByReason[item.reason] || 0) + 1;
    }

    const total = records.length;
    const complete = histogram[CRITICAL_FIELDS.length] || 0;

    return Response.json({
      ok: true,
      registry: {
        total,
        complete,
        empty: histogram[0] || 0,
        partial: total - complete - (histogram[0] || 0),
        with_source_url: hasSourceUrl,
        with_any_citation: citedAnywhere,
        critical_fields: CRITICAL_FIELDS.length,
        histogram: histogram.map((count, score) => ({ score, count })),
        by_status: byStatus,
        field_coverage: Object.entries(fieldCoverage).map(([field, data]) => ({ field, ...data })),
        by_state: Object.values(byState).sort((a, b) => b.gap - a.gap).slice(0, 25),
      },
      review_queue: {
        pending: (pendingReview || []).length,
        by_reason: queueByReason,
      },
      runs,
    });
  } catch (error) {
    console.error('[codehawkStats] error:', error?.message || String(error));
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
