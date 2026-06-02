/**
 * jurisdictionZoningCache — app-wide jurisdiction-level reuse layer for SCIP
 * zoning + cell-tower requirements.
 *
 * Two actions (the heavy Zoneomics→Realie→AI fetch stays on the frontend via
 * generateZoningPermitReport — function-to-function invoke is not permitted):
 *
 *   action "lookup"  → resolve jurisdiction from lat/lon, return a fresh cached
 *                      JurisdictionZoningCache row if one exists (cache HIT), else
 *                      report a miss with the resolved jurisdiction key so the
 *                      caller knows to run the real fetch.
 *   action "save"    → store a report the caller just fetched into the app-wide
 *                      jurisdiction cache (upsert by jurisdiction key), extracting
 *                      flat telecom requirements + optional district rows.
 *
 * The caller (HawkZoningPermitting) snapshots the report onto its ScipRecord so
 * old SCIPs never change when the jurisdiction row is later refreshed.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FRESH_DAYS = 180; // jurisdiction rules change slowly; reuse for ~6 months.

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function normalizeName(name) {
  return clean(name)
    .toLowerCase()
    .replace(/\b(city|town|village|borough|county|of|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

// Resolve state / county / city via MapBox (FCC fallback) — mirrors the geocode
// step in generateZoningPermitReport so the cache key matches what it resolves.
async function resolveJurisdiction(lat, lon) {
  const out = { state_code: null, state_name: null, county_name: null, city_name: null };
  const key = Deno.env.get('MAPBOX_API_KEY');
  if (key) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?types=place,district,region&access_token=${encodeURIComponent(key)}`;
      const r = await fetch(url);
      if (r.ok) {
        const feats = (await r.json())?.features || [];
        const get = (t) => feats.find((f) => (f.place_type || []).includes(t));
        const region = get('region');
        const district = get('district');
        const place = get('place');
        out.state_code = region?.properties?.short_code?.replace(/^US-/i, '')?.toUpperCase() || null;
        out.state_name = region ? clean(region.text) : null;
        out.county_name = district ? clean(district.text).replace(/\s+County$/i, '') : null;
        out.city_name = place ? clean(place.text) : null;
      }
    } catch (_) { /* fall through */ }
  }
  if (!out.state_code || !out.county_name) {
    try {
      const r = await fetch(`https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`, { headers: { Accept: 'application/json' } });
      if (r.ok) {
        const d = await r.json();
        out.state_code = out.state_code || d?.State?.code || null;
        out.state_name = out.state_name || d?.State?.name || null;
        out.county_name = out.county_name || (d?.County?.name ? clean(d.County.name).replace(/\s+County$/i, '') : null);
      }
    } catch (_) { /* ignore */ }
  }
  return out;
}

// Pull a flat telecom-requirements object out of the report panel structure.
function extractTelecomRequirements(report) {
  const r = report || {};
  const ts = r.tower_specifics || {};
  const zo = r.zoning_overview || {};
  const sp = r.site_plan || {};
  const bp = r.building_permit || {};
  const val = (o) => (o && typeof o === 'object' ? clean(o.value) : clean(o));
  return {
    max_tower_height: val(ts.maximum_tower_height),
    stealth_required: val(ts.stealth_required),
    required_collocations: val(ts.required_collocations),
    residential_separation: val(ts.residential_separation),
    tower_separation: val(ts.tower_separation),
    fall_zone_requirements: val(ts.fall_zone_requirements),
    setback_rules: val(ts.measured_from_base_or_center),
    zoning_district: val(zo.property_zoning_district),
    approval_path: val(zo.zoning_process),
    site_plan_requirements: val(sp.site_plan_jurisdiction) || val(sp.submittal_deadlines),
    building_permit_notes: val(bp.building_permit_jurisdiction) || val(bp.building_permit_timeframe),
  };
}

function isFresh(row) {
  if (!row || row.status !== 'published') return false;
  const ts = row.last_verified_at || row.fetched_at;
  if (!ts) return false;
  const ageMs = Date.now() - new Date(ts).getTime();
  return ageMs < FRESH_DAYS * 24 * 60 * 60 * 1000;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const action = body.action || 'lookup';
    const { lat, lon, zoning_district } = body;
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }

    const j = await resolveJurisdiction(lat, lon);
    if (!j.state_code) {
      return Response.json({ error: 'Could not resolve jurisdiction (no state).' }, { status: 422 });
    }

    // Prefer municipality as the jurisdiction; fall back to county.
    const jName = j.city_name || j.county_name || '';
    const jType = j.city_name ? 'city' : (j.county_name ? 'county' : 'unknown');
    const normalized = normalizeName(jName);
    const district = clean(zoning_district);
    const key = { state_code: j.state_code, jurisdiction_name_normalized: normalized, jurisdiction_type: jType };
    const jurisdictionOut = { ...j, jurisdiction_name: jName, jurisdiction_type: jType, normalized };

    const rows = normalized ? await base44.asServiceRole.entities.JurisdictionZoningCache.filter(key) : [];
    const existing = rows && rows[0] ? rows[0] : null;

    // ── ACTION: save (caller fetched a fresh report → upsert into cache) ──
    if (action === 'save') {
      const report = body.report;
      if (!report) return Response.json({ error: 'report required for save' }, { status: 400 });
      const nowIso = new Date().toISOString();
      const districtRow = report?.zoning_overview?.property_zoning_district || null;
      const writeData = {
        ...key,
        jurisdiction_name: jName,
        county_name: j.county_name || null,
        report,
        telecom_requirements: extractTelecomRequirements(report),
        zone_code: body.zone_code || null,
        source_name: body.zoneomics_ok ? 'Zoneomics + AI' : 'AI (web-grounded)',
        source_url: report?.tower_specifics?.ldc_section_references?.value || null,
        confidence: 'medium',
        status: 'published',
        raw_response: body.raw_response || null,
        fetched_at: nowIso,
        last_verified_at: nowIso,
      };
      let saved;
      if (existing) {
        const mergedDistricts = { ...(existing.district_reports || {}) };
        if (district && districtRow) mergedDistricts[district] = { property_zoning_district: districtRow };
        saved = await base44.asServiceRole.entities.JurisdictionZoningCache.update(existing.id, { ...writeData, district_reports: mergedDistricts });
      } else {
        const districts = {};
        if (district && districtRow) districts[district] = { property_zoning_district: districtRow };
        saved = await base44.asServiceRole.entities.JurisdictionZoningCache.create({ ...writeData, district_reports: districts });
      }
      console.log(`[jurisdictionZoningCache] SAVED ${j.state_code}/${normalized}/${jType} user=${user.email}`);
      return Response.json({
        cache: 'saved',
        jurisdiction: jurisdictionOut,
        telecom_requirements: writeData.telecom_requirements,
        last_verified_at: nowIso,
        cache_id: saved.id,
      });
    }

    // ── ACTION: lookup (default) — return fresh cached row or report a miss ──
    if (existing && isFresh(existing)) {
      console.log(`[jurisdictionZoningCache] HIT ${j.state_code}/${normalized}/${jType} user=${user.email}`);
      return Response.json({
        cache: 'hit',
        jurisdiction: { ...jurisdictionOut, jurisdiction_name: existing.jurisdiction_name || jName },
        report: existing.report || {},
        telecom_requirements: existing.telecom_requirements || {},
        district_report: district ? (existing.district_reports || {})[district] || null : null,
        source_name: existing.source_name || null,
        source_url: existing.source_url || null,
        last_verified_at: existing.last_verified_at || existing.fetched_at || null,
        confidence: existing.confidence || 'medium',
        cache_id: existing.id,
      });
    }

    console.log(`[jurisdictionZoningCache] MISS ${j.state_code}/${normalized}/${jType} user=${user.email}`);
    return Response.json({ cache: 'miss', jurisdiction: jurisdictionOut });
  } catch (error) {
    console.error('jurisdictionZoningCache error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});