/**
 * generateZoningPermitReport — ZONEOMICS (paid tier) PRIMARY + REALIE.
 *
 * Notion Ordinance Vacuum REMOVED entirely. Cascade is now:
 *   Zoneomics → Realie → AI (web-grounded gap-fill).
 *
 * SERIAL PIPELINE (all keyed off the SARF coordinates lat/lon):
 *   STEP 1  MapBox reverse-geocode (MAPBOX_API_KEY) → state / county / city
 *   STEP 2  Zoneomics paid zoneDetail (ZONEOMICS_API_KEY) → PRIMARY zoning district + telecom controls
 *   STEP 3  Realie parcel @ SARF center (REALIE_API_KEY)  → cross-check district + parcel facts + gaps
 *   STEP 4  LLM extraction (gemini, web-grounded)         → fills any field still empty
 *   STEP 5  Zoneomics overlay WINS                        → its values overwrite the LLM inferences
 *   STEP 6  Render four panels — each row { value, source, confidence }
 *
 * Source tags surfaced to the UI: Zoneomics | Realie | AI | Manual.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── HawkSCIP quota gate ─────────────────────────────────────────────────────
// A HawkSCIP is spent when a user runs Zoning on a site for the FIRST time.
// SARF is free. Tier is read from User.tier (the field the Supabase payment
// webhook stamps). Counting HawkScipSpend rows IS the quota.
//   free          → 2 HawkSCIPs lifetime
//   hawk_site     → 15 / calendar month
//   hawkeyes      → 30 / calendar month
//   hawkeye_apex  → unlimited
const QUOTA = {
  free:         { limit: 2,  window: 'lifetime' },
  hawk_site:    { limit: 15, window: 'month' },
  hawkeyes:     { limit: 30, window: 'month' },
  hawkeye_apex: { limit: Infinity, window: 'unlimited' },
};

function siteKeyFor(lat, lon) {
  return `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
}

function monthStartISO() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// ─── helpers ────────────────────────────────────────────────────────────────
async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    return { ok: res.ok, status: res.status, data, text };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e) };
  } finally {
    clearTimeout(timeout);
  }
}

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function row(value, source, confidence = 'medium') {
  const v = clean(value);
  if (!v) return { value: 'NEEDS RESEARCH', source: source || 'none', confidence: 'low' };
  return { value: v, source, confidence };
}

// ─── FCC geo fallback (state/county) ────────────────────────────────────────
async function getGeoContext(lat, lon) {
  const url = `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`;
  const res = await fetchJsonWithTimeout(url, { headers: { Accept: 'application/json' } }, 9000);
  const d = res.data || {};
  return {
    state_code: d?.State?.code || null,
    state_name: d?.State?.name || null,
    county_name: d?.County?.name || null,
  };
}

// ─── STEP 1: MapBox reverse-geocode (jurisdiction identity) ─────────────────
async function mapboxReverseGeocode(lat, lon) {
  const key = Deno.env.get('MAPBOX_API_KEY');
  if (!key) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?types=place,district,region&access_token=${encodeURIComponent(key)}`;
  const res = await fetchJsonWithTimeout(url, { headers: { Accept: 'application/json' } }, 9000);
  const feats = res?.data?.features || [];
  if (!feats.length) return null;
  const get = (t) => feats.find((f) => (f.place_type || []).includes(t));
  const region = get('region');
  const district = get('district'); // county in the US
  const place = get('place');       // city/town
  const stateCode = region?.properties?.short_code?.replace(/^US-/i, '')?.toUpperCase() || null;
  const countyName = district ? clean(district.text).replace(/\s+County$/i, '') : null;
  return {
    state_code: stateCode,
    state_name: region ? clean(region.text) : null,
    county_name: countyName,
    city_name: place ? clean(place.text) : null,
  };
}

// ─── STEP 3: Realie parcel @ SARF center (cross-check district + parcel facts) ─
// Query Realie by lat/lon point first; fall back to address if provided.
async function getRealieParcel(lat, lon, address) {
  const key = Deno.env.get('REALIE_API_KEY');
  if (!key) return null;

  const headers = { Authorization: key, Accept: 'application/json' };
  const parse = (d) => (Array.isArray(d) ? d[0] : d?.results?.[0] || d) || null;
  const normalize = (p) => {
    if (!p) return null;
    return {
      parcel_id: clean(p.parcel_id || p.apn || p.parcelnumb) || null,
      owner_name: clean(p.owner_name || p.owner) || null,
      address: clean(p.address || p.situs_address || p.property_address) || null,
      city: clean(p.city || p.situs_city) || null,
      county: clean(p.county) || null,
      state: clean(p.state || p.state_code) || null,
      land_use: p.land_use || p.property_use || p.use_description || null,
      acreage: p.acreage || p.acres || p.lot_size_acres || null,
      zoning: p.zoning || p.zoning_code || null,
      zoning_description: p.zoning_description || p.zoning_desc || null,
      zoning_overlay: p.zoning_overlay || p.overlay || null,
      special_district: p.special_district || null,
      geometry: p.geometry || p.parcel_geometry || null,
    };
  };

  try {
    const r = await fetch(
      `https://app.realie.ai/api/public/property/search/?latitude=${lat}&longitude=${lon}`,
      { headers }
    );
    if (r.ok) {
      const got = normalize(parse(await r.json()));
      if (got) return got;
    }
  } catch (_) { /* fall through to address */ }

  if (address) {
    try {
      const r = await fetch(
        `https://app.realie.ai/api/public/property/search/?address=${encodeURIComponent(address)}`,
        { headers }
      );
      if (r.ok) return normalize(parse(await r.json()));
    } catch (_) { return null; }
  }
  return null;
}

// ─── STEP 2: Zoneomics paid zoneDetail (PRIMARY zoning + telecom controls) ──
function zoCleanVal(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s || s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return '';
  return s;
}
function zoFlatten(obj, out = {}) {
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) zoFlatten(v, out);
    else if (Array.isArray(v)) out[k.toLowerCase()] = v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
    else out[k.toLowerCase()] = v;
  }
  return out;
}
function zoPick(flat, needles, valueRx = null) {
  for (const [k, v] of Object.entries(flat)) {
    for (const n of needles) {
      if (k.includes(n)) {
        const c = zoCleanVal(v);
        if (c && (!valueRx || valueRx.test(c))) return c;
      }
    }
  }
  return '';
}
async function getZoneomics(lat, lon) {
  const apiKey = Deno.env.get('ZONEOMICS_API_KEY');
  if (!apiKey) return { ok: false, http_status: 500, error: 'ZONEOMICS_API_KEY not set', fields: {} };

  const url = new URL('https://api.zoneomics.com/v2/zoneDetail');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lon));
  // Plan-allowed output fields only: zoning, controls, plu, parcels, plu-tags, geom.
  url.searchParams.set('output_fields', 'zoning,controls,plu,parcels,plu-tags');
  const redacted = url.toString().replace(apiKey, '***');

  const res = await fetchJsonWithTimeout(url.toString(), {}, 12000);
  if (!res.ok) {
    console.log(`[ZONEOMICS DIAG] url=${redacted} status=${res.status} populated=0`);
    return {
      ok: false,
      http_status: res.status,
      error: res.status === 401 || res.status === 403
        ? 'Zoneomics auth failed (401/403) — check ZONEOMICS_API_KEY / paid tier.'
        : `Zoneomics HTTP ${res.status || 'network'}`,
      fields: {},
    };
  }

  const json = res.data || {};
  const root = json?.data?.data || json?.data || json;
  const zd = root?.zone_details || {};
  const meta = root?.meta || {};
  const flat = zoFlatten(root?.controls || {});
  const MEASURE = /\d/;

  const zoneCode = zoCleanVal(zd.zone_code);
  const districtLabel = [zoneCode, zoCleanVal(zd.zone_name)].filter(Boolean).join(' — ');

  // permitted land-use (plu) + plu-tags — allowed output fields on this tier.
  const pluTags = root?.plu_tags || root?.['plu-tags'] || root?.plu?.tags || root?.plu || null;
  const tagText = (t) => {
    if (t == null) return '';
    if (typeof t !== 'object') return zoCleanVal(t);
    return zoCleanVal(t.name || t.tag || t.label || t.title || t.value || t.type || t.category || '');
  };
  const landUseTags = Array.isArray(pluTags)
    ? [...new Set(pluTags.map(tagText).filter(Boolean))].join(', ')
    : tagText(pluTags);

  // conditionalControls/gde-controls are NOT on this Zoneomics tier — telecom
  // controls come from the generic `controls` block only.
  const cond = {};

  const fields = {};
  const put = (f, v) => { const c = zoCleanVal(v); if (c) fields[f] = c; };

  put('property_zoning_district', districtLabel || zoneCode);
  put('zoning_jurisdiction', zoCleanVal(meta.city_name));
  put('zoning_process', zoPick(flat, ['special_use', 'conditional_use', 'approval_process']));
  put('cup_or_special_exception', zoPick(flat, ['conditional_use', 'special_use', 'special_exception', 'use_permit', 'cup', 'variance', 'approval_process']));
  put('zoning_approval_timeframe', zoPick(flat, ['timeframe', 'approval_time']));
  put('zoning_contact_information', zoPick(flat, ['contact', 'department']));
  // Telecom-specific controls: conditionalControls FIRST, then generic controls.
  put('maximum_tower_height',
    zoPick(cond, ['tower_height', 'antenna_height', 'max_height', 'height_ft'], MEASURE) ||
    zoPick(flat, ['tower_height', 'antenna_height']) ||
    zoPick(flat, ['max_height', 'building_height', 'height_ft'], MEASURE));
  put('residential_separation',
    zoPick(cond, ['residential_separation', 'separation_residential', 'antenna_setback', 'tower_setback']) ||
    zoPick(flat, ['residential_separation', 'separation_residential']) ||
    zoPick(flat, ['antenna_setback', 'tower_setback']));
  put('tower_separation',
    zoPick(cond, ['tower_separation', 'separation_tower', 'separation_between']) ||
    zoPick(flat, ['tower_separation', 'separation_tower', 'separation_between']));
  put('fall_zone_requirements',
    zoPick(cond, ['fall_zone', 'fall-zone', 'fallzone']) ||
    zoPick(flat, ['fall_zone', 'fall-zone', 'fallzone']));
  put('stealth_required',
    zoPick(cond, ['stealth', 'concealment', 'camouflage']) ||
    zoPick(flat, ['stealth', 'concealment', 'camouflage']));
  put('required_collocations',
    zoPick(cond, ['collocation', 'co-location', 'colocation']) ||
    zoPick(flat, ['collocation', 'co-location', 'colocation']));
  put('ldc_section_references', zoPick(flat, ['ordinance_section', 'code_section', 'ldc_section']) || zoCleanVal(zd.link));

  console.log(`[ZONEOMICS DIAG] url=${redacted} status=${res.status} zone=${zoneCode || '—'} city=${meta.city_name || '—'} populated=${Object.keys(fields).length} tags=${landUseTags || '—'}`);
  return { ok: true, http_status: res.status, zone_code: zoneCode, city_name: zoCleanVal(meta.city_name) || null, land_use_tags: landUseTags || null, fields };
}

// ─── STEP 4: LLM structured extraction (web-grounded gap-fill) ──────────────
async function llmExtractReport(base44, ctx) {
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gemini_3_flash',
    add_context_from_internet: true,
    prompt: `You are extracting a SiteHawk Zoning + Permit Report for a telecom tower site.

CONTEXT (all based on the SARF search coordinates):
- Coordinates: ${ctx.lat}, ${ctx.lon}
- State: ${ctx.state}  | County: ${ctx.county}  | City: ${ctx.city || 'unknown'}
- Parcel address: ${ctx.address}

SOURCE A — Realie parcel (authoritative for zoning district / parcel facts at the SARF point):
${JSON.stringify(ctx.realie || { miss: true }).slice(0, 4000)}

SOURCE B — Zoneomics paid-tier zoning district + telecom controls already resolved for this point:
${JSON.stringify(ctx.zoneomics || { miss: true }).slice(0, 4000)}

TASK: Fill out EVERY field in the report below for this jurisdiction. Per field:
- CUP / SPECIAL EXCEPTION PATH (cup_or_special_exception): Always check whether wireless/telecommunication towers may be approved by Conditional Use Permit (CUP), special exception, special use permit, administrative use permit, or variance. Assume a CUP/special-exception path is required unless the ordinance clearly says the proposed tower is by-right or prohibited. When a CUP/special-exception path exists, list the zoning classifications or zoning families where it can make a tower eligible. Set source to "AI" unless Zoneomics provided the value.
- PE SELF-CERTIFICATION (pe_self_certification): Research whether this jurisdiction allows a licensed Professional Engineer (PE) to SELF-CERTIFY the tower's structural/site plans (engineer-of-record sealed certification accepted in lieu of full plan review / public hearing), which yields a FASTER, more administrative permit path and often more flexible setback/height treatment. Answer "Yes — PE self-certification accepted" if the ordinance/building dept allows PE-sealed self-certification or a building-official administrative approval relying on a PE seal; "No — full review required" if a public hearing / special-use / conditional-use process is mandatory with no PE self-cert path; or "NEEDS RESEARCH" if you cannot verify. Quote the basis (code section / dept policy) in the value when found. Set source to "AI".
- TOWER SPECIFICS (LDC section refs, maximum tower height, stealth required, required collocations, residential separation, tower separation, measured from base/center, fall zone, special tower landscaping): use the jurisdiction's Land Development Code / zoning ordinance found via web search. Set source to "AI".
- Property zoning DISTRICT / land use: prefer Realie (SOURCE A) then Zoneomics (SOURCE B). Set source to "Realie".
- Fees / contacts / process / timeframes (site plan + building permit panels): research the actual jurisdiction's building & planning department online. Set source to "AI".
- Set "source" to one of: "Realie" | "AI" | "none".
- If you cannot find a value in ANY source, set value to "NEEDS RESEARCH" and source to "none".
- DO NOT invent fees, phone numbers, addresses, or section numbers. Quote only what you can verify online or from the sources.
- For yes/no fields use "Yes" / "No" / "NEEDS RESEARCH".
- Set confidence: "high" if directly quoted from an authoritative source; "medium" if inferred; "low" if best guess.`,
    response_json_schema: {
      type: 'object',
      properties: {
        zoning_overview: {
          type: 'object',
          properties: {
            zoning_jurisdiction:        { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_contact_information: { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_process:             { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            cup_or_special_exception:   { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_fees:                { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_approval_timeframe:  { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            property_zoning_district:   { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            pe_self_certification:      { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
          },
        },
        tower_specifics: {
          type: 'object',
          properties: {
            ldc_section_references:     { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            maximum_tower_height:       { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            stealth_required:           { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            required_collocations:      { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            residential_separation:     { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            tower_separation:           { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            measured_from_base_or_center:{ type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            fall_zone_requirements:     { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            special_tower_landscaping:  { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
          },
        },
        site_plan: {
          type: 'object',
          properties: {
            site_plan_jurisdiction:     { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            site_plan_contact_info:     { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            site_plan_fees:             { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            site_plan_timeframe:        { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            existing_site_plan_amend:   { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            concurrent_to_zoning_or_bp: { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            submittal_deadlines:        { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            electronic_hard_or_both:    { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
          },
        },
        building_permit: {
          type: 'object',
          properties: {
            building_permit_jurisdiction:{ type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            building_dept_contact_info:  { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            gc_must_submit:              { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            building_permit_fees:        { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            building_permit_timeframe:   { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            bond_required:               { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            e911_address_assigned:       { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
          },
        },
      },
    },
  });
  return result || {};
}

// ─── handler ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, candidate } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }

    // ── HAWKSCIP QUOTA GATE — runs BEFORE any paid Zoneomics/Realie call ──────
    // Admins bypass entirely. Everyone else is gated by their User.tier quota.
    if (user.role !== 'admin') {
      const tier = QUOTA[user.tier] ? user.tier : 'free';
      const { limit, window } = QUOTA[tier];
      const siteKey = siteKeyFor(lat, lon);

      // Idempotent per site — if this user already spent a HawkSCIP on this
      // exact site, let them re-run Zoning for free (no double-charge).
      const existing = await base44.asServiceRole.entities.HawkScipSpend.filter({
        user_email: user.email,
        site_key: siteKey,
      });
      const alreadySpentHere = existing.length > 0;

      if (!alreadySpentHere && limit !== Infinity) {
        // Count spends in the quota window: lifetime (free) or since month start (paid).
        const query = { user_email: user.email };
        let spends = await base44.asServiceRole.entities.HawkScipSpend.filter(query);
        if (window === 'month') {
          const start = monthStartISO();
          spends = spends.filter((s) => (s.created_date || '') >= start);
        }
        const used = spends.length;

        if (used >= limit) {
          console.log(`[HAWKSCIP GATE] BLOCKED user=${user.email} tier=${tier} used=${used}/${limit} window=${window}`);
          return Response.json(
            { upgrade_required: true, tier, used, limit, window },
            { status: 402 }
          );
        }
      }

      // Under limit (or unlimited) and not already charged for this site →
      // record ONE HawkSCIP spend, then proceed with the (paid) report.
      if (!alreadySpentHere) {
        await base44.asServiceRole.entities.HawkScipSpend.create({
          user_email: user.email,
          site_key: siteKey,
          tier_at_time: tier,
          lat: Number(lat),
          lon: Number(lon),
        });
        console.log(`[HAWKSCIP GATE] SPENT user=${user.email} tier=${tier} site=${siteKey} window=${window}`);
      } else {
        console.log(`[HAWKSCIP GATE] REUSE user=${user.email} site=${siteKey} (already spent — free re-run)`);
      }
    }

    // STEP 1 — MapBox reverse-geocode (FCC fallback for any gaps).
    // STEP 2 — Zoneomics paid zoneDetail (PRIMARY). STEP 3 — Realie cross-check.
    const candidateAddress = candidate?.parcel_address || candidate?.address || null;
    const [mb, fcc, zoneomics, realie] = await Promise.all([
      mapboxReverseGeocode(lat, lon).catch(() => null),
      getGeoContext(lat, lon).catch(() => ({})),
      getZoneomics(lat, lon).catch((e) => ({ ok: false, http_status: 0, error: e?.message, fields: {} })),
      getRealieParcel(lat, lon, candidateAddress).catch(() => null),
    ]);
    const geo = {
      state_code: mb?.state_code || fcc?.state_code || null,
      state_name: mb?.state_name || fcc?.state_name || null,
      county_name: mb?.county_name || fcc?.county_name || null,
    };

    const city = zoneomics?.city_name || mb?.city_name || realie?.city || null;

    // STEP 4 — LLM web-grounded gap-fill, seeded with Zoneomics + Realie facts.
    const llmReport = await llmExtractReport(base44, {
      lat, lon,
      state: geo.state_name || geo.state_code,
      county: geo.county_name,
      city,
      address: candidateAddress || realie?.address,
      realie,
      zoneomics,
    });

    const report = llmReport || {};
    report.zoning_overview = report.zoning_overview || {};
    report.tower_specifics = report.tower_specifics || {};

    // Which panel section each Zoneomics field lives in.
    const FIELD_SECTION = {
      property_zoning_district: 'zoning_overview',
      zoning_jurisdiction: 'zoning_overview',
      zoning_process: 'zoning_overview',
      cup_or_special_exception: 'zoning_overview',
      zoning_approval_timeframe: 'zoning_overview',
      zoning_contact_information: 'zoning_overview',
      maximum_tower_height: 'tower_specifics',
      residential_separation: 'tower_specifics',
      tower_separation: 'tower_specifics',
      fall_zone_requirements: 'tower_specifics',
      stealth_required: 'tower_specifics',
      required_collocations: 'tower_specifics',
      ldc_section_references: 'tower_specifics',
    };

    // STEP 5 (PRIMARY) — overlay Zoneomics paid-tier fields on top of the LLM
    // report. Zoneomics WINS — its values overwrite whatever the LLM inferred.
    const zoFields = zoneomics?.fields || {};
    for (const [field, value] of Object.entries(zoFields)) {
      const sec = FIELD_SECTION[field];
      if (!sec) continue;
      report[sec] = report[sec] || {};
      report[sec][field] = row(value, 'Zoneomics', 'high');
    }

    // STEP 3 — Realie cross-check of the zoning district code. If Zoneomics and
    // Realie disagree, surface BOTH inline + a flag the UI renders as a red badge.
    let zoning_district_conflict = null;
    if (realie?.zoning) {
      const realieDistrict = realie.zoning_description
        ? `${realie.zoning} — ${realie.zoning_description}`
        : realie.zoning;
      const zoCode = zoneomics?.zone_code || '';
      const codesDiffer = zoCode && realie.zoning &&
        zoCode.replace(/[^a-z0-9]/gi, '').toUpperCase() !== realie.zoning.replace(/[^a-z0-9]/gi, '').toUpperCase();
      if (zoFields.property_zoning_district && codesDiffer) {
        // Both present and different → show both + conflict flag.
        report.zoning_overview.property_zoning_district = row(
          `${zoFields.property_zoning_district}  ·  Realie: ${realieDistrict}`,
          'Zoneomics', 'high'
        );
        zoning_district_conflict = { zoneomics: zoCode, realie: realie.zoning };
      } else if (!zoFields.property_zoning_district) {
        // Zoneomics left it blank → Realie fills it.
        report.zoning_overview.property_zoning_district = row(realieDistrict, 'Realie', 'high');
      }
    }

    // Jurisdiction cross-check — fill if still empty after Zoneomics + Realie.
    if (!clean(report.zoning_overview?.zoning_jurisdiction?.value)) {
      report.zoning_overview.zoning_jurisdiction = row(
        [city, geo.county_name, geo.state_code].filter(Boolean).join(', '),
        'Realie', 'medium'
      );
    }

    console.log(`Zoning report: user=${user.email} state=${geo.state_code} city=${city || '—'} county=${geo.county_name || '—'} zoneomics=${zoneomics?.ok ? Object.keys(zoFields).length : 'fail'} realie=${!!realie}`);

    return Response.json({
      status: 'ok',
      coordinates: { lat, lon },
      geo,
      report,
      jurisdiction: {
        state_code: geo.state_code,
        state_name: geo.state_name,
        county_name: geo.county_name,
        city_name: city || null,
        label: [city, geo.county_name, geo.state_code].filter(Boolean).join(', '),
      },
      zoneomics: {
        ok: !!zoneomics?.ok,
        http_status: zoneomics?.http_status ?? null,
        error: zoneomics?.error || null,
        populated_count: Object.keys(zoneomics?.fields || {}).length,
        zone_code: zoneomics?.zone_code || null,
        land_use_tags: zoneomics?.land_use_tags || null,
      },
      zoning_district_conflict,
      parcel: realie ? {
        parcel_id: realie.parcel_id,
        owner_name: realie.owner_name,
        acreage: realie.acreage,
        geometry: realie.geometry,
      } : null,
      sources_used: {
        zoneomics: !!zoneomics?.ok,
        zoneomics_zone: zoneomics?.zone_code || null,
        realie: !!realie,
        realie_zoning: realie?.zoning || null,
      },
    });
  } catch (error) {
    console.error('generateZoningPermitReport error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});