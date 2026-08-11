// upsertTelecomOrdinance — HTTP intake for the n8n ordinance scraper.
//
// URL:  https://site-hawk-pro.base44.app/functions/upsertTelecomOrdinance
// Auth: header  x-webhook-secret: <WEBHOOK_SECRET>
// Body: the ordinance payload as JSON. Requires jurisdiction + state.
//       Any other TelecomOrdinance field may be included; ONLY the fields you
//       send are written (existing values are never blanked out).
//
// Matches on jurisdiction_normalized + state; updates the existing registry
// record when found, creates one otherwise. Values are stored verbatim —
// numbers are never converted or rounded (compliance math depends on them).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const FIELDS = [
  'height_limit_ft', 'setback_ft', 'fall_zone_ft', 'residential_separation_ft',
  'tower_separation_ft', 'permit_type', 'setback_rule', 'pe_fall_zone_allowed',
  'stealth_required', 'collocation_required', 'source_url', 'section_ref',
  'fall_zone_pct_of_height', 'pe_letter_required', 'field_citations',
  'verification_status', 'completeness_score', 'last_verified_date',
  'last_source_method', 'review_required', 'codehawk_run_id', 'extraction_notes',
];

function normalize(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/\b(CITY|TOWN|VILLAGE|TOWNSHIP)\s+OF\s+/g, '')
    .replace(/\bCOUNTY\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default async function(req) {
  try {
    const expected = secrets.get('WEBHOOK_SECRET');
    if (!expected) {
      return Response.json({ error: 'WEBHOOK_SECRET not configured' }, { status: 500 });
    }
    if ((req.headers.get('x-webhook-secret') || '') !== expected) {
      console.error('upsertTelecomOrdinance: bad or missing x-webhook-secret');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Body must be a JSON object' }, { status: 400 });
    }
    const jurisdiction = String(body.jurisdiction || '').trim();
    const state = String(body.state || '').trim().toUpperCase();
    if (!jurisdiction || !state) {
      return Response.json({ error: 'jurisdiction and state are required' }, { status: 400 });
    }

    const jurisdiction_normalized = body.jurisdiction_normalized
      ? String(body.jurisdiction_normalized).toUpperCase().trim()
      : normalize(jurisdiction);

    const payload = { jurisdiction, state, jurisdiction_normalized };
    for (const key of FIELDS) {
      if (body[key] !== undefined && body[key] !== null) payload[key] = body[key];
    }

    const base44 = createClientFromRequest(req);
    // The registry holds BOTH key conventions from earlier passes — some county
    // rows are stored as 'LEON', others as 'LEON COUNTY'. Matching on only one
    // silently creates a duplicate instead of filling the row that exists, which
    // then splits one county's ordinance across two records. Try both.
    let existing = await base44.asServiceRole.entities.TelecomOrdinance.filter({
      jurisdiction_normalized,
      state,
    });
    if (existing.length === 0) {
      const alt = /\bCOUNTY\b/.test(String(jurisdiction).toUpperCase())
        ? `${jurisdiction_normalized} COUNTY`
        : null;
      if (alt) {
        existing = await base44.asServiceRole.entities.TelecomOrdinance.filter({
          jurisdiction_normalized: alt,
          state,
        });
      }
    }

    if (existing.length > 0) {
      const record = await base44.asServiceRole.entities.TelecomOrdinance.update(existing[0].id, payload);
      console.log('TelecomOrdinance updated:', jurisdiction, state, existing[0].id);
      return Response.json({ ok: true, action: 'updated', id: existing[0].id, record });
    }

    const record = await base44.asServiceRole.entities.TelecomOrdinance.create(payload);
    console.log('TelecomOrdinance created:', jurisdiction, state, record?.id);
    return Response.json({ ok: true, action: 'created', id: record?.id, record });
  } catch (error) {
    console.error('upsertTelecomOrdinance error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}