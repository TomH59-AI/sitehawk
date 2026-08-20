// promoteZoningEdit — turn ONE subscriber's manual Section 2 correction into
// shared knowledge, so the next user who runs zoning in that jurisdiction
// starts from it instead of researching it again.
//
// Before this existed, a manual edit lived only in React state and whatever
// SCIP it was printed into. A user could phone the OKC planning department,
// get the real fee schedule, type it in — and the next subscriber to run a
// site three blocks away saw "NEEDS RESEARCH" in the same row.
//
// TWO destinations, deliberately:
//
//  1. JurisdictionZoningCache.report.user_overrides — ALWAYS. Covers all 32
//     rows including the ones the ordinance registry has no column for
//     (fees, contacts, submittal deadlines, timeframes, bond). Overrides are
//     carried forward by putCachedZoning, so a later source run cannot clobber
//     them, and they are applied last when the report is assembled.
//
//  2. TelecomOrdinance — ONLY for the nine rows that map to a real registry
//     column, and only ever as verification_status 'needs_review'. A human's
//     typed value is better than an AI inference and worse than a cited
//     ordinance quote, and it is ranked and badged that way ("Team entry",
//     never "Ordinance"). Every registry write also files an
//     OrdinanceReviewQueue item so an admin confirms it before it can ever be
//     promoted to 'verified'.
//
// Nothing here writes a value the user did not type. Clearing a field removes
// the override rather than storing a blank.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const USER_SOURCE = 'SiteHawk User (manual)';

// UI field key → TelecomOrdinance column. Rows absent from this map are
// cache-only: real knowledge, but with no registry column to live in.
const REGISTRY_COLUMNS = {
  maximum_tower_height:   { col: 'height_limit_ft',            kind: 'ft' },
  residential_separation: { col: 'residential_separation_ft',  kind: 'ft',   proseCol: 'setback_rule' },
  tower_separation:       { col: 'tower_separation_ft',        kind: 'ft' },
  fall_zone_requirements: { col: 'fall_zone_ft',               kind: 'ft',   proseCol: 'setback_rule' },
  stealth_required:       { col: 'stealth_required',           kind: 'bool' },
  required_collocations:  { col: 'collocation_required',       kind: 'bool' },
  ldc_section_references: { col: 'section_ref',                kind: 'text' },
  zoning_process:         { col: 'permit_type',                kind: 'text' },
  pe_letter:              { col: 'pe_fall_zone_allowed',       kind: 'bool' },
};

const VALID_SECTIONS = ['zoning_overview', 'tower_specifics', 'site_plan', 'building_permit'];

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

// Mirrors jurisdictionCacheKey in generateZoningPermitReport. The two MUST stay
// identical or an edit lands on a key nothing ever reads.
function jurisdictionCacheKey(stateCode, jurisdictionName, type) {
  const norm = String(jurisdictionName || '')
    .toLowerCase()
    .replace(/\b(city|town|village|borough) of\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return null;
  return `${String(stateCode || 'NA').toUpperCase()}|${type || 'unknown'}|${norm}`;
}

function normalizeJurisdiction(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/\b(CITY|TOWN|VILLAGE|TOWNSHIP)\s+OF\s+/g, '')
    .replace(/\bCOUNTY\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Distances are stored as plain numbers because compliance math depends on
// them. "1/2 mile" and "1,320 ft" both have to land as 2640 / 1320, and a
// value we cannot parse must fall to prose rather than become a wrong number.
function parseFeet(raw) {
  const s = clean(raw).toLowerCase();
  if (!s) return null;
  const fraction = s.match(/(\d+)\s*\/\s*(\d+)\s*mile/);
  if (fraction) {
    const [, a, b] = fraction;
    const denom = Number(b);
    if (!denom) return null;
    return Math.round((Number(a) / denom) * 5280);
  }
  const miles = s.match(/(\d+(?:\.\d+)?)\s*mile/);
  if (miles) return Math.round(Number(miles[1]) * 5280);
  const num = s.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!num) return null;
  const n = Number(num[0]);
  return Number.isFinite(n) ? n : null;
}

function parseBool(raw) {
  const s = clean(raw).toLowerCase();
  if (!s) return null;
  if (/^(y|yes|true|required|yes\b)/.test(s)) return true;
  if (/^(n|no|false|not required|none)/.test(s)) return false;
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const state = clean(body.state).toUpperCase();
    const jurisdiction = clean(body.jurisdiction);
    const jurisdictionType = clean(body.jurisdiction_type) || 'unknown';
    const section = clean(body.section);
    const field = clean(body.field);
    const value = clean(body.value);

    if (!state || !jurisdiction) {
      return Response.json({ ok: false, skipped: 'no_jurisdiction' });
    }
    if (!VALID_SECTIONS.includes(section) || !field) {
      return Response.json({ error: 'section and field are required' }, { status: 400 });
    }

    // Prefer the key the report was actually built under (returned as
    // jurisdiction.key). Recomputing it here from a bare county name would miss
    // the row entirely — the report keys counties as 'oklahoma county', not
    // 'oklahoma'. Recomputation stays only as a fallback for older clients.
    const key = clean(body.jurisdiction_key) || jurisdictionCacheKey(state, jurisdiction, jurisdictionType);
    if (!key) return Response.json({ ok: false, skipped: 'no_cache_key' });

    const now = new Date().toISOString();
    const result = { ok: true, cache: null, registry: null, review_queued: false };

    // ── 1. Jurisdiction cache override (always) ──────────────────────────────
    const rows = await base44.asServiceRole.entities.JurisdictionZoningCache
      .filter({ jurisdiction_name_normalized: key })
      .catch(() => []);
    const existing = rows?.[0] || null;

    const report = existing?.report ? { ...existing.report } : {};
    const overrides = { ...(report.user_overrides || {}) };
    const sectionOverrides = { ...(overrides[section] || {}) };

    if (value) {
      sectionOverrides[field] = {
        value,
        source: USER_SOURCE,
        confidence: 'medium',
        edited_by: user.email || null,
        edited_at: now,
      };
    } else {
      // Clearing a field retracts the override rather than storing a blank that
      // would suppress a good source value on the next run.
      delete sectionOverrides[field];
    }

    if (Object.keys(sectionOverrides).length) overrides[section] = sectionOverrides;
    else delete overrides[section];
    report.user_overrides = overrides;

    if (existing) {
      await base44.asServiceRole.entities.JurisdictionZoningCache.update(existing.id, { report });
      result.cache = 'updated';
    } else {
      // No cached row yet (edit made before a report was ever cached here).
      // Store the override alone so it is waiting when the first run lands.
      await base44.asServiceRole.entities.JurisdictionZoningCache.create({
        state_code: state,
        jurisdiction_name_normalized: key,
        jurisdiction_name: jurisdiction,
        jurisdiction_type: jurisdictionType,
        report,
        // 'partial' on purpose: this row holds an override, not researched
        // panels, and must not be served as a finished report.
        status: 'partial',
        fetched_at: now,
        source_name: USER_SOURCE,
      });
      result.cache = 'created';
    }

    // ── 2. Registry write (mapped fields only, never above 'needs_review') ───
    const mapping = REGISTRY_COLUMNS[field];
    if (mapping && value) {
      const patch = {};
      if (mapping.kind === 'ft') {
        const n = parseFeet(value);
        if (n !== null) patch[mapping.col] = n;
        else if (mapping.proseCol) patch[mapping.proseCol] = value;
      } else if (mapping.kind === 'bool') {
        const b = parseBool(value);
        if (b !== null) patch[mapping.col] = b;
      } else {
        patch[mapping.col] = value;
      }

      if (Object.keys(patch).length) {
        const normalized = normalizeJurisdiction(jurisdiction);
        let found = await base44.asServiceRole.entities.TelecomOrdinance
          .filter({ state, jurisdiction_normalized: normalized })
          .catch(() => []);
        if (!found?.length && /\bCOUNTY\b/.test(jurisdiction.toUpperCase())) {
          found = await base44.asServiceRole.entities.TelecomOrdinance
            .filter({ state, jurisdiction_normalized: `${normalized} COUNTY` })
            .catch(() => []);
        }
        const target = found?.[0] || null;
        const currentValue = target ? target[mapping.col] : null;

        // A user edit never overwrites a CITED registry value — that would let a
        // typo silently replace a quoted ordinance provision. It goes to the
        // review queue instead and an admin decides.
        const citation = target?.field_citations?.[mapping.col];
        const wouldOverwriteCitedValue = Boolean(citation?.quote) &&
          currentValue !== null && currentValue !== undefined && currentValue !== '';

        if (wouldOverwriteCitedValue) {
          result.registry = 'deferred_to_review';
        } else {
          patch.verification_status = 'needs_review';
          patch.review_required = true;
          patch.last_source_method = 'user_manual';
          patch.extraction_notes =
            `${field} set by ${user.email || 'a subscriber'} in Section 2 on ${now.slice(0, 10)}. ` +
            `Typed by hand, not extracted from code text — confirm against the published ordinance before trusting it.`;
          if (clean(body.source_url)) patch.source_url = clean(body.source_url);

          if (target) {
            await base44.asServiceRole.entities.TelecomOrdinance.update(target.id, patch);
            result.registry = 'updated';
          } else {
            await base44.asServiceRole.entities.TelecomOrdinance.create({
              jurisdiction,
              jurisdiction_normalized: normalized,
              state,
              ...patch,
            });
            result.registry = 'created';
          }
        }

        // Every registry-shaped edit is queued for an admin either way.
        await base44.asServiceRole.entities.OrdinanceReviewQueue.create({
          jurisdiction,
          state,
          ordinance_id: target?.id || null,
          field_name: mapping.col,
          proposed_value: String(patch[mapping.col] ?? patch[mapping.proseCol] ?? value),
          current_value: currentValue === null || currentValue === undefined ? '' : String(currentValue),
          reason: wouldOverwriteCitedValue ? 'conflict_with_existing' : 'no_quote',
          section_ref: target?.section_ref || null,
          source_url: clean(body.source_url) || target?.source_url || null,
          confidence: 'medium',
          qc_verdict: `User-entered via Section 2 by ${user.email || 'unknown'}. No ordinance quote captured.`,
          status: 'pending',
        }).catch((e) => console.log('promoteZoningEdit: review queue write failed:', e?.message));
        result.review_queued = true;
      }
    }

    console.log(
      `promoteZoningEdit: ${user.email} ${state}/${jurisdiction} ${section}.${field} ` +
      `cache=${result.cache} registry=${result.registry || 'n/a'}`
    );
    return Response.json(result);
  } catch (error) {
    console.error('promoteZoningEdit error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
