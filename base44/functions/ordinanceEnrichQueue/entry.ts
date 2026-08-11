// ordinanceEnrichQueue — the work queue n8n pulls from to enrich the ordinance library.
//
// URL:  https://site-hawk-pro.base44.app/functions/ordinanceEnrichQueue
// Auth: header  x-webhook-secret: <WEBHOOK_SECRET>
//
// Body (all optional):
//   {
//     "limit": 25,              // max jobs to hand back (default 25, cap 100)
//     "state": "FL",            // restrict to one state
//     "cooldown_days": 14,      // skip records attempted within this window (default 14)
//     "missing": ["height_limit_ft", "setback_ft", "fall_zone"]   // which gaps qualify
//   }
//
// Returns jurisdictions that already exist in the registry but lack the NUMBERS
// TalonFit's grading math needs. Each job carries the citation and source URL the
// record already holds so n8n starts from the known code section instead of
// re-hunting. Read-only — n8n writes results back through upsertTelecomOrdinance.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

// All five grading-critical NUMBERS. Chasing only three left records "done" in
// the queue while TalonFit still had to fall back to conservative assumptions.
const DEFAULT_MISSING = [
  'height_limit_ft',
  'setback_ft',
  'fall_zone',
  'residential_separation_ft',
  'tower_separation_ft',
];

// County code governs unincorporated land and is mirrored by many of its
// municipalities, so one enriched county answers far more sites than one city.
function isCounty(r) {
  const n = `${r.jurisdiction || ''} ${r.jurisdiction_type || ''}`.toUpperCase();
  return n.includes('COUNTY') || n.includes('PARISH');
}

function hasFallZone(r) {
  return r.fall_zone_ft != null || r.fall_zone_pct_of_height != null;
}

// How many of the three grading-critical numbers are absent (higher = more valuable to enrich).
function gapsFor(r, wanted) {
  const gaps = [];
  if (wanted.includes('height_limit_ft') && r.height_limit_ft == null) gaps.push('height_limit_ft');
  if (wanted.includes('setback_ft') && r.setback_ft == null) gaps.push('setback_ft');
  if (wanted.includes('fall_zone') && !hasFallZone(r)) gaps.push('fall_zone');
  if (wanted.includes('residential_separation_ft') && r.residential_separation_ft == null) {
    gaps.push('residential_separation_ft');
  }
  if (wanted.includes('tower_separation_ft') && r.tower_separation_ft == null) {
    gaps.push('tower_separation_ft');
  }
  return gaps;
}

export default async function (req) {
  try {
    const expected = secrets.get('WEBHOOK_SECRET');
    if (!expected) {
      return Response.json({ error: 'WEBHOOK_SECRET not configured' }, { status: 500 });
    }
    if ((req.headers.get('x-webhook-secret') || '') !== expected) {
      console.error('ordinanceEnrichQueue: bad or missing x-webhook-secret');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit) || 25, 100);
    const state = body?.state ? String(body.state).toUpperCase().trim() : null;
    const cooldownDays = Number.isFinite(Number(body?.cooldown_days)) ? Number(body.cooldown_days) : 14;
    const wanted = Array.isArray(body?.missing) && body.missing.length ? body.missing : DEFAULT_MISSING;

    const base44 = createClientFromRequest(req);
    const all = state
      ? await base44.asServiceRole.entities.TelecomOrdinance.filter({ state }, '-updated_date', 5000)
      : await base44.asServiceRole.entities.TelecomOrdinance.list('-updated_date', 5000);

    const cutoff = cooldownDays > 0 ? Date.now() - cooldownDays * 86400000 : null;

    const candidates = [];
    for (const r of all) {
      const gaps = gapsFor(r, wanted);
      if (!gaps.length) continue;
      const lastTried = r.last_verified_date ? new Date(r.last_verified_date).getTime() : 0;
      if (cutoff && lastTried && lastTried > cutoff) continue; // attempted too recently
      candidates.push({ record: r, gaps, lastTried, county: isCounty(r) });
    }

    // Counties first (they answer the most sites), then most gaps, then the ones
    // untouched the longest. Pass county_first:false to enrich cities instead.
    const countyFirst = body?.county_first !== false;
    candidates.sort(
      (a, b) =>
        (countyFirst ? Number(b.county) - Number(a.county) : 0) ||
        b.gaps.length - a.gaps.length ||
        a.lastTried - b.lastTried
    );

    const jobs = candidates.slice(0, limit).map(({ record: r, gaps }) => ({
      id: r.id,
      jurisdiction: r.jurisdiction,
      jurisdiction_normalized: r.jurisdiction_normalized,
      state: r.state,
      missing_fields: gaps,
      // Everything already on file, so n8n starts from the known citation.
      section_ref: r.section_ref || null,
      source_url: r.source_url || null,
      setback_rule: r.setback_rule || null,
      permit_type: r.permit_type || null,
      height_limit_ft: r.height_limit_ft ?? null,
      setback_ft: r.setback_ft ?? null,
      fall_zone_ft: r.fall_zone_ft ?? null,
      fall_zone_pct_of_height: r.fall_zone_pct_of_height ?? null,
      residential_separation_ft: r.residential_separation_ft ?? null,
      last_verified_date: r.last_verified_date || null,
      extraction_notes: r.extraction_notes || null,
    }));

    console.log(
      `ordinanceEnrichQueue: ${jobs.length} job(s) handed out of ${candidates.length} pending` +
        (state ? ` in ${state}` : '')
    );

    return Response.json({
      ok: true,
      count: jobs.length,
      pending_total: candidates.length,
      registry_total: all.length,
      write_back_to: 'https://site-hawk-pro.base44.app/functions/upsertTelecomOrdinance',
      jobs,
    });
  } catch (error) {
    console.error('ordinanceEnrichQueue error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}