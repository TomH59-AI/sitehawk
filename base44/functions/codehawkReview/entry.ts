/**
 * codehawkReview — the admin review queue for ordinance values CodeHawk would
 * not write on its own: conflicts with what the registry already holds, missing
 * or unverifiable quotes, failed QC, or low confidence.
 *
 * Nothing in this queue has touched TelecomOrdinance. Approving an item is the
 * only way it gets written, and the write carries the same field-level citation
 * an automatic write would have.
 *
 * POST { action: 'list' | 'approve' | 'reject' | 'approve_all_for', ... }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  BOOLEAN_FIELDS,
  CRITICAL_FIELDS,
  NUMERIC_FIELDS,
  completenessScore,
} from '../../shared/codehawk.ts';

/** Turn the queue's display text back into a properly typed ordinance value. */
function fromText(field, text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  if (NUMERIC_FIELDS.includes(field)) {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (BOOLEAN_FIELDS.includes(field)) {
    if (/^(yes|true)$/i.test(raw)) return true;
    if (/^(no|false)$/i.test(raw)) return false;
    return null;
  }
  return raw;
}

async function applyApproval(base44, item, user, note) {
  const value = fromText(item.field_name, item.proposed_value);
  if (value === null) {
    throw new Error(`Cannot convert "${item.proposed_value}" into a value for ${item.field_name}.`);
  }

  let ordinance = null;
  if (item.ordinance_id) {
    ordinance = await base44.asServiceRole.entities.TelecomOrdinance.get(item.ordinance_id).catch(() => null);
  }
  if (!ordinance) {
    const matches = await base44.asServiceRole.entities.TelecomOrdinance.filter(
      { state: String(item.state).toUpperCase(), jurisdiction: item.jurisdiction },
      null,
      1
    );
    ordinance = matches?.[0] || null;
  }
  if (!ordinance) throw new Error(`No TelecomOrdinance record found for ${item.jurisdiction}, ${item.state}.`);

  const citations = { ...(ordinance.field_citations || {}) };
  citations[item.field_name] = {
    value,
    quote: item.quote || null,
    section_ref: item.section_ref || null,
    source_url: item.source_url || null,
    confidence: item.confidence || null,
    verified_date: new Date().toISOString(),
    method: 'admin_approved',
    qc_verdict: 'admin_override',
    approved_by: user.email || null,
  };

  const merged = { ...ordinance, [item.field_name]: value };
  const score = completenessScore(merged);

  // Anything still pending for this jurisdiction keeps the review flag on.
  const stillPending = await base44.asServiceRole.entities.OrdinanceReviewQueue.filter(
    { jurisdiction: item.jurisdiction, state: String(item.state).toUpperCase(), status: 'pending' },
    null,
    50
  ).catch(() => []);
  const remaining = (stillPending || []).filter((r) => r.id !== item.id).length;

  await base44.asServiceRole.entities.TelecomOrdinance.update(ordinance.id, {
    [item.field_name]: value,
    field_citations: citations,
    completeness_score: score,
    review_required: remaining > 0,
    verification_status: remaining > 0 ? 'needs_review' : score >= CRITICAL_FIELDS.length ? 'verified' : 'partial',
    last_verified_date: new Date().toISOString(),
  });

  await base44.asServiceRole.entities.OrdinanceReviewQueue.update(item.id, {
    status: 'approved',
    resolved_by: user.email || null,
    resolved_at: new Date().toISOString(),
    resolution_note: note || undefined,
  });

  return { ordinance_id: ordinance.id, field: item.field_name, value, completeness_score: score, remaining_pending: remaining };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');

    if (action === 'list') {
      const status = ['pending', 'approved', 'rejected'].includes(body.status) ? body.status : 'pending';
      const limit = Math.max(1, Math.min(Number(body.limit) || 100, 500));
      const skip = Math.max(0, Number(body.skip) || 0);
      const query = { status };
      if (body.state) query.state = String(body.state).toUpperCase();
      if (body.jurisdiction) query.jurisdiction = String(body.jurisdiction);

      const items = await base44.asServiceRole.entities.OrdinanceReviewQueue.filter(query, '-created_date', limit, skip);
      return Response.json({ ok: true, status, count: (items || []).length, items: items || [] });
    }

    if (action === 'approve' || action === 'reject') {
      const id = String(body.id || '').trim();
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

      const item = await base44.asServiceRole.entities.OrdinanceReviewQueue.get(id).catch(() => null);
      if (!item) return Response.json({ error: 'Review item not found' }, { status: 404 });
      if (item.status !== 'pending') return Response.json({ error: `Item is already ${item.status}` }, { status: 409 });

      if (action === 'reject') {
        await base44.asServiceRole.entities.OrdinanceReviewQueue.update(id, {
          status: 'rejected',
          resolved_by: user.email || null,
          resolved_at: new Date().toISOString(),
          resolution_note: body.note || undefined,
        });
        return Response.json({ ok: true, action: 'rejected', id });
      }

      const applied = await applyApproval(base44, item, user, body.note);
      console.log(`[codehawkReview] ${user.email} approved ${item.field_name} for ${item.jurisdiction}, ${item.state}`);
      return Response.json({ ok: true, action: 'approved', id, ...applied });
    }

    if (action === 'bulk_reject') {
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 200) : [];
      if (!ids.length) return Response.json({ error: 'ids array is required' }, { status: 400 });
      let rejected = 0;
      for (const id of ids) {
        try {
          await base44.asServiceRole.entities.OrdinanceReviewQueue.update(id, {
            status: 'rejected',
            resolved_by: user.email || null,
            resolved_at: new Date().toISOString(),
            resolution_note: body.note || undefined,
          });
          rejected += 1;
        } catch {
          /* skip individual failures */
        }
      }
      return Response.json({ ok: true, action: 'bulk_reject', rejected });
    }

    return Response.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (error) {
    console.error('[codehawkReview] error:', error?.message || String(error));
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
