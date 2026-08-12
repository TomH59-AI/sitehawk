/**
 * migrateZoningCacheToJurisdiction — one-shot cleanup for JurisdictionZoningCache.
 *
 * The cache was documented as jurisdiction-level ("one fetch per jurisdiction,
 * reused across every SCIP") but every row was written keyed `sitekey:LAT,LON`.
 * The result: each site in a jurisdiction kept its own copy of that
 * jurisdiction's zoning / tower / site-plan / building-permit panels — copies
 * free to drift from each other and from the CodeHawk registry they came from.
 *
 * This walks the legacy rows and collapses them:
 *   - derives the jurisdiction key from the panels the row already holds
 *   - promotes the RICHEST row per jurisdiction into the canonical row
 *     (richest = fewest "NEEDS RESEARCH" fields, so migration never downgrades)
 *   - rewrites every other site row as a thin pointer at that canonical row
 *
 * No scraping, no LLM, no paid sources — pure data motion. Site rows keep their
 * coordinates, geo and parcel; only the duplicated panels are removed.
 *
 * POST { dry_run?: boolean, limit?: number }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

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

/** How much real content a panel set carries — used to pick the best copy. */
function panelScore(panels) {
  if (!panels || typeof panels !== 'object') return -1;
  let filled = 0;
  let cited = 0;
  for (const group of ['zoning_overview', 'tower_specifics', 'site_plan', 'building_permit']) {
    const section = panels[group];
    if (!section || typeof section !== 'object') continue;
    for (const field of Object.values(section)) {
      const value = String(field?.value ?? '').trim();
      if (!value || /^NEEDS RESEARCH$/i.test(value)) continue;
      filled += 1;
      if (field?.quote) cited += 1;
    }
  }
  // A cited field is worth more than a filled one; both beat an empty panel.
  return filled + cited * 2;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const limit = Math.min(Number(body.limit) || 5000, 5000);

    // ── Load every cache row ────────────────────────────────────────────────
    const rows = [];
    let skip = 0;
    while (rows.length < limit) {
      const page = await base44.asServiceRole.entities.JurisdictionZoningCache.list(null, 200, skip);
      if (!page?.length) break;
      rows.push(...page);
      if (page.length < 200) break;
      skip += 200;
    }

    const siteRows = rows.filter((r) => String(r.jurisdiction_name_normalized || '').startsWith('sitekey:'));
    const existingJurisdictionRows = new Map(
      rows
        .filter((r) => !String(r.jurisdiction_name_normalized || '').startsWith('sitekey:'))
        .map((r) => [r.jurisdiction_name_normalized, r])
    );

    // ── Group legacy (panel-carrying) site rows by jurisdiction ─────────────
    const groups = new Map();
    const skipped = [];

    for (const row of siteRows) {
      const payload = row.report || {};
      if (payload.panels_from) continue; // already migrated
      const panels = payload.report;
      if (!panels) { skipped.push({ row: row.jurisdiction_name_normalized, why: 'no_panels' }); continue; }

      const j = payload.jurisdiction || {};
      const state = j.state_code || row.state_code || null;
      const city = j.city_name || null;
      const county = j.county_name || null;
      // Match how the report resolves a governing body: the municipality when
      // there is one, otherwise the county-equivalent.
      const label = city || (county ? `${county} County` : null);
      const type = city ? 'city' : county ? 'county' : 'unknown';
      const key = jurisdictionCacheKey(state, label, type);
      if (!key || !state || state.length !== 2) {
        // Sign-flipped coordinates produced rows in Egypt and China; they have
        // no usable jurisdiction and are left alone for a human to delete.
        skipped.push({ row: row.jurisdiction_name_normalized, why: 'unresolvable_jurisdiction', state });
        continue;
      }

      if (!groups.has(key)) groups.set(key, { key, state, label, type, county, members: [] });
      groups.get(key).members.push({ row, score: panelScore(panels), panels });
    }

    // ── Promote the richest copy, point the rest at it ──────────────────────
    const results = [];
    for (const group of groups.values()) {
      group.members.sort((a, b) => b.score - a.score);
      const best = group.members[0];
      const already = existingJurisdictionRows.get(group.key);
      const alreadyScore = already ? panelScore(already.report?.report) : -1;
      const useExisting = already && alreadyScore >= best.score;
      const now = new Date().toISOString();

      const outcome = {
        jurisdiction: group.label,
        state: group.state,
        key: group.key,
        site_rows_collapsed: group.members.length,
        promoted_score: useExisting ? alreadyScore : best.score,
        source: useExisting ? 'existing_jurisdiction_row' : 'promoted_from_site_row',
      };

      if (!dryRun) {
        if (!useExisting) {
          const data = {
            state_code: group.state,
            jurisdiction_name_normalized: group.key,
            jurisdiction_name: group.label,
            jurisdiction_type: group.type,
            county_name: group.county || null,
            report: { report: best.panels },
            source_url: best.panels?._registry?.source_url || null,
            fetched_at: best.row.fetched_at || now,
            last_verified_at: now,
            status: 'published',
            source_name: 'migrated from per-site cache',
          };
          if (already) await base44.asServiceRole.entities.JurisdictionZoningCache.update(already.id, data);
          else await base44.asServiceRole.entities.JurisdictionZoningCache.create(data);
        }

        for (const member of group.members) {
          const { report: _panels, ...siteSpecific } = member.row.report || {};
          await base44.asServiceRole.entities.JurisdictionZoningCache.update(member.row.id, {
            report: { ...siteSpecific, panels_from: group.key },
          });
        }
      }

      results.push(outcome);
    }

    results.sort((a, b) => b.site_rows_collapsed - a.site_rows_collapsed);
    const collapsed = results.reduce((n, r) => n + r.site_rows_collapsed, 0);

    return Response.json({
      ok: true,
      dry_run: dryRun,
      cache_rows_scanned: rows.length,
      site_rows: siteRows.length,
      jurisdictions: results.length,
      site_rows_collapsed: collapsed,
      duplicate_copies_removed: Math.max(0, collapsed - results.length),
      skipped,
      results,
    });
  } catch (error) {
    console.error('[migrateZoningCacheToJurisdiction]', error?.message || error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
