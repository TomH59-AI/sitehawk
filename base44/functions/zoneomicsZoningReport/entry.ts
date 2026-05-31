/**
 * zoneomicsZoningReport — PAID-TIER ($189/mo) Zoneomics PRIMARY source for the
 * Section 2 SCIP zoning report.
 *
 * Calls the Zoneomics v2 zoneDetail endpoint at the SARF lat/lon and pulls EVERY
 * field the paid tier exposes (zone_details + controls + permitted_land_uses),
 * then maps each one onto the SCIP panel fields. Uses generic schema-discovery:
 * it walks the entire `controls` tree and the zone_details block, flattening all
 * keys, then matches them by name to the SCIP telecom / tower fields.
 *
 * Returns { zoneomics: { <scip_field>: { value, source:'Zoneomics' } }, raw,
 *           zone_code, jurisdiction, populated_count, http_status, ok, error }.
 *
 * [ZONEOMICS DIAG] logs the call URL (key redacted), status code, and the count
 * of populated SCIP fields so we can confirm the paid tier is being hit.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ZONE_DETAIL = 'https://api.zoneomics.com/v2/zoneDetail';

function clean(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s || s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return '';
  return s;
}

// Recursively flatten an object into { leafKeyLowercased: value } pairs. We keep
// the LAST seen value for a duplicate leaf key, which favors the deepest match.
function flattenLeaves(obj, out = {}) {
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenLeaves(v, out);
    } else if (Array.isArray(v)) {
      const joined = v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
      out[k.toLowerCase()] = joined;
    } else {
      out[k.toLowerCase()] = v;
    }
  }
  return out;
}

// Find the first flattened leaf whose key matches any of the given substrings.
// Optional `valueRx` requires the matched VALUE to also match a pattern — used to
// reject generic non-telecom controls (e.g. a "height" key that holds "STF").
function pick(flat, needles, valueRx = null) {
  for (const [k, v] of Object.entries(flat)) {
    for (const n of needles) {
      if (k.includes(n)) {
        const c = clean(v);
        if (c && (!valueRx || valueRx.test(c))) return c;
      }
    }
  }
  return '';
}

// A value looks like a real measurement if it contains a number + ft/feet/%/×.
const MEASURE_RX = /\d/;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('ZONEOMICS_API_KEY');
    if (!apiKey) return Response.json({ ok: false, http_status: 500, error: 'ZONEOMICS_API_KEY not set' }, { status: 200 });

    const { lat, lon, lng } = await req.json();
    const latitude = lat;
    const longitude = lon ?? lng;
    if (latitude == null || longitude == null) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }

    const url = new URL(ZONE_DETAIL);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lng', String(longitude));
    url.searchParams.set('output_fields', 'zoning,controls,plu');

    const redacted = url.toString().replace(apiKey, '***');
    let r, text;
    try {
      r = await fetch(url.toString());
      text = await r.text();
    } catch (e) {
      console.log(`[ZONEOMICS DIAG] url=${redacted} status=network_error err=${e?.message}`);
      return Response.json({ ok: false, http_status: 0, error: `network: ${e?.message}` }, { status: 200 });
    }

    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!r.ok) {
      console.log(`[ZONEOMICS DIAG] url=${redacted} status=${r.status} populated=0`);
      return Response.json({
        ok: false,
        http_status: r.status,
        error: r.status === 401 || r.status === 403
          ? 'Zoneomics auth failed (401/403) — check ZONEOMICS_API_KEY / paid tier.'
          : `Zoneomics HTTP ${r.status}`,
      }, { status: 200 });
    }

    // Paid-tier shape: { data: { data: { meta, zone_details, controls, permitted_land_uses } } }
    const root = json?.data?.data || json?.data || json;
    const zd = root?.zone_details || {};
    const meta = root?.meta || {};
    const controls = root?.controls || {};

    const flat = flattenLeaves(controls);

    const zoneCode = clean(zd.zone_code);
    const zoneName = clean(zd.zone_name);
    const districtLabel = [zoneCode, zoneName].filter(Boolean).join(' — ');

    // Generic name-match mapping from flattened Zoneomics keys → SCIP fields.
    const z = {};
    const set = (field, value) => {
      const c = clean(value);
      if (c) z[field] = { value: c, source: 'Zoneomics' };
    };

    // ZONING OVERVIEW
    set('property_zoning_district', districtLabel || zoneCode);
    set('zoning_jurisdiction', clean(meta.city_name));
    set('zoning_process', pick(flat, ['special_use', 'conditional_use', 'approval_process']));
    set('zoning_approval_timeframe', pick(flat, ['timeframe', 'approval_time']));
    set('zoning_contact_information', pick(flat, ['contact', 'department']));

    // TOWER SPECIFICS — telecom / wireless fields the paid tier exposes. The
    // tower/antenna-specific keys are trusted directly; generic-height/setback
    // keys must carry a numeric value to avoid grabbing non-telecom controls.
    set('maximum_tower_height',
      pick(flat, ['tower_height', 'antenna_height']) ||
      pick(flat, ['max_height', 'building_height', 'height_ft'], MEASURE_RX));
    set('residential_separation', pick(flat, ['residential_separation', 'separation_residential']));
    set('tower_separation', pick(flat, ['tower_separation', 'separation_tower', 'separation_between']));
    set('fall_zone_requirements', pick(flat, ['fall_zone', 'fall-zone', 'fallzone']));
    set('stealth_required', pick(flat, ['stealth', 'concealment', 'camouflage']));
    set('required_collocations', pick(flat, ['collocation', 'co-location', 'colocation']));
    set('special_tower_landscaping', pick(flat, ['tower_landscap', 'antenna_screening']));
    set('ldc_section_references', pick(flat, ['ordinance_section', 'code_section', 'ldc_section']));
    set('measured_from_base_or_center', pick(flat, ['measured_from']));

    // Antenna/tower setback → fill residential separation if blank (telecom-only).
    if (!z.residential_separation) {
      const sb = pick(flat, ['antenna_setback', 'tower_setback']);
      if (sb) z.residential_separation = { value: sb, source: 'Zoneomics' };
    }

    // LDC section reference fallback — the zone code page link is a usable ref.
    if (!z.ldc_section_references && clean(zd.link)) {
      z.ldc_section_references = { value: clean(zd.link), source: 'Zoneomics' };
    }

    const populated = Object.keys(z).length;
    console.log(`[ZONEOMICS DIAG] url=${redacted} status=${r.status} zone=${zoneCode || '—'} city=${meta.city_name || '—'} populated=${populated}`);

    return Response.json({
      ok: true,
      http_status: r.status,
      zoneomics: z,
      zone_code: zoneCode,
      zone_name: zoneName,
      zone_guide: clean(zd.zone_guide),
      link: clean(zd.link),
      jurisdiction: {
        city_name: clean(meta.city_name) || null,
        city_id: meta.city_id || null,
      },
      populated_count: populated,
    });
  } catch (error) {
    console.error('zoneomicsZoningReport error:', error?.message || error);
    return Response.json({ ok: false, http_status: 500, error: error?.message || String(error) }, { status: 200 });
  }
});