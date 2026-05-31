/**
 * generateZoningPermitReport — REGRID REMOVED. Realie + Notion + AI stack.
 *
 * Builds the full SiteHawk Zoning + Site Plan + Building Permit report.
 *
 * SERIAL PIPELINE:
 *   STEP 1  MapBox reverse-geocode (MAPBOX_API_KEY) → state / county / city
 *   STEP 2  Realie parcel @ SARF center (REALIE_API_KEY) → PRIMARY zoning district + parcel
 *   STEP 3  Notion Ordinance Vacuum                 → PRIMARY telecom tower rules
 *   STEP 4  LLM extraction fallback (gemini/openai) → fills gaps from ordinance prose
 *   STEP 5  Render four panels — each row { value, source, confidence }
 *
 * Source tags surfaced to the UI: Realie | Notion | AI | Manual.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MAX_NOTION_CHARS = 60000;

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

// ─── STEP 2: Realie parcel @ SARF center (PRIMARY parcel + zoning district) ─
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

// ─── Notion ─────────────────────────────────────────────────────────────────
async function notionReq(path, token, init = {}) {
  const t = token || Deno.env.get('NOTION_API_TOKEN');
  if (!t) return null;
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.warn(`Notion ${path} → ${res.status} ${txt.slice(0, 200)}`);
    return null;
  }
  return res.json();
}

// Workspace-wide search for a page titled like "{ST}-Zoning" / "{ST} Zoning".
async function notionSearchStateFolder(stateCode, token) {
  const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const target = norm(stateCode);
  const queries = [`${stateCode}-Zoning`, `${stateCode} Zoning`, `${stateCode}-zoning`];
  for (const q of queries) {
    const d = await notionReq('/search', token, {
      method: 'POST',
      body: JSON.stringify({
        query: q,
        filter: { property: 'object', value: 'page' },
        page_size: 25,
      }),
    });
    const results = d?.results || [];
    for (const r of results) {
      if (r.object !== 'page') continue;
      const titleProp = r.properties && Object.values(r.properties).find(p => p.type === 'title');
      const title = titleProp?.title?.map(t => t.plain_text).join('') || '';
      const n = norm(title);
      if (n === `${target}ZONING` || n.startsWith(`${target}ZONING`) || n === target) {
        return { id: r.id, title };
      }
    }
  }
  return null;
}

async function getAllChildren(blockId, token) {
  const blocks = [];
  let cursor = null;
  do {
    const params = new URLSearchParams({ page_size: '100' });
    if (cursor) params.set('start_cursor', cursor);
    const d = await notionReq(`/blocks/${blockId}/children?${params}`, token);
    if (!d?.results) break;
    blocks.push(...d.results);
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor && blocks.length < 800);
  return blocks;
}

function blockToText(block) {
  const type = block.type;
  const v = block[type];
  if (!v) return '';
  if (type === 'child_page') return `\n## ${v.title}\n`;
  const text = (v.rich_text || []).map(t => t?.plain_text || '').join('').trim();
  if (!text) return '';
  if (type.startsWith('heading_')) return `\n### ${text}`;
  return text;
}

async function collectNotionText(blockId, depth, token, lines = []) {
  if (depth > 3) return lines;
  const blocks = await getAllChildren(blockId, token);
  for (const b of blocks) {
    const line = blockToText(b);
    if (line) lines.push(line);
    if ((b.has_children || b.type === 'child_page') && lines.join('\n').length < MAX_NOTION_CHARS) {
      await collectNotionText(b.id, depth + 1, token, lines);
    }
    if (lines.join('\n').length >= MAX_NOTION_CHARS) break;
  }
  return lines;
}

async function getNotionStateContext(stateCode, jurisdictionHints, token) {
  if (!stateCode) return { found: false, text: '', folder_title: null };

  let folder = await notionSearchStateFolder(stateCode, token);

  if (!folder) {
    const masterId = Deno.env.get('NOTION_MASTER_ZONING_PAGE_ID');
    if (masterId) {
      const children = await getAllChildren(masterId, token);
      const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const target = norm(stateCode);
      const hit = children.find(b => {
        if (b.type !== 'child_page') return false;
        const n = norm(b.child_page?.title || '');
        return n === `${target}ZONING` || n.startsWith(`${target}ZONING`) || n === target;
      });
      if (hit) folder = { id: hit.id, title: hit.child_page?.title || '' };
    }
  }

  if (!folder) {
    console.warn(`Notion: no "${stateCode}-Zoning" page found. Connect the Notion integration to the Team Space holding your zoning folders.`);
    return { found: false, text: '', folder_title: null };
  }

  const lines = await collectNotionText(folder.id, 0, token);
  console.log(`Notion: matched "${folder.title}" (${folder.id}) → ${lines.join('\n').length} chars`);
  return {
    found: lines.length > 0,
    text: lines.join('\n').slice(0, MAX_NOTION_CHARS),
    folder_title: folder.title,
    jurisdiction_hints: jurisdictionHints,
  };
}

async function getNotionAccessToken(base44) {
  try {
    const c = await base44.asServiceRole.connectors.getConnection('notion');
    if (c?.accessToken) {
      console.log('Notion: using OAuth connector token');
      return c.accessToken;
    }
    console.warn('Notion: connector returned no accessToken');
  } catch (e) {
    console.warn('Notion: connector lookup failed:', e?.message);
  }
  const envTok = Deno.env.get('NOTION_API_TOKEN');
  if (envTok) console.log('Notion: falling back to NOTION_API_TOKEN secret');
  return envTok || null;
}

// ─── STEP 4: LLM structured extraction (gap-fill from Notion prose) ─────────
async function llmExtractReport(base44, ctx) {
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gemini_3_flash',
    add_context_from_internet: true,
    prompt: `You are extracting a SiteHawk Zoning + Permit Report for a telecom tower site.

CONTEXT:
- Coordinates: ${ctx.lat}, ${ctx.lon}
- State: ${ctx.state}  | County: ${ctx.county}  | City: ${ctx.city || 'unknown'}
- Parcel address: ${ctx.address}

SOURCE A — Realie parcel (PRIMARY for zoning district / parcel facts):
${JSON.stringify(ctx.realie || { miss: true }).slice(0, 4000)}

SOURCE B — Notion Ordinance Vacuum (PRIMARY for telecom tower rules, fees, contacts, process), state folder "${ctx.notion?.folder_title || 'none'}":
${(ctx.notion?.text || '(no Notion content found for this state)').slice(0, 40000)}

TASK: Fill out EVERY field in the report below using the sources. Per field:
- TOWER SPECIFICS (LDC section refs, maximum tower height, stealth required, required collocations, residential separation, tower separation, measured from base/center, fall zone, special tower landscaping): use Notion (SOURCE B) FIRST, then web. Set source to "Notion" if directly quoted from the Notion KEY PROVISIONS, or "AI" if inferred from Notion prose.
- Property zoning DISTRICT / land use: prefer Realie (SOURCE A). Set source to "Realie".
- Fees / contacts / process / timeframes (site plan + building permit panels): prefer Notion. Set source to "Notion" or "AI".
- Set "source" to one of: "Realie" | "Notion" | "AI" | "none".
- If you cannot find a value in ANY source, set value to "NEEDS RESEARCH" and source to "none".
- DO NOT invent fees, phone numbers, addresses, or section numbers. Quote only what's in the sources.
- For yes/no fields use "Yes" / "No" / "NEEDS RESEARCH".
- Set confidence: "high" if directly quoted; "medium" if inferred; "low" if best guess.`,
    response_json_schema: {
      type: 'object',
      properties: {
        zoning_overview: {
          type: 'object',
          properties: {
            zoning_jurisdiction:        { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_contact_information: { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_process:             { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_fees:                { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_approval_timeframe:  { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            property_zoning_district:   { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
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

    // STEP 1 — MapBox reverse-geocode (FCC fallback for any gaps).
    const candidateAddress = candidate?.parcel_address || candidate?.address || null;
    const [mb, fcc, realie] = await Promise.all([
      mapboxReverseGeocode(lat, lon).catch(() => null),
      getGeoContext(lat, lon).catch(() => ({})),
      // STEP 2 — Realie parcel @ SARF center (PRIMARY zoning district).
      getRealieParcel(lat, lon, candidateAddress).catch(() => null),
    ]);
    const geo = {
      state_code: mb?.state_code || fcc?.state_code || null,
      state_name: mb?.state_name || fcc?.state_name || null,
      county_name: mb?.county_name || fcc?.county_name || null,
    };

    const city = mb?.city_name || realie?.city || null;
    const jurisdictions = [city, geo.county_name, realie?.county].filter(Boolean);

    // STEP 3 — Notion Ordinance Vacuum (telecom rules).
    const notionToken = await getNotionAccessToken(base44);
    const notion = await getNotionStateContext(geo.state_code, jurisdictions, notionToken).catch(() => ({ found: false, text: '' }));

    // STEP 4 — LLM gap-fill from Notion prose + Realie parcel facts.
    const llmReport = await llmExtractReport(base44, {
      lat, lon,
      state: geo.state_name || geo.state_code,
      county: geo.county_name,
      city,
      address: candidateAddress || realie?.address,
      realie,
      notion,
    });

    const report = llmReport || {};
    report.zoning_overview = report.zoning_overview || {};

    // STEP 5a — Deterministic Realie override for the zoning district (PRIMARY).
    if (realie?.zoning) {
      const district = realie.zoning_description
        ? `${realie.zoning} — ${realie.zoning_description}`
        : realie.zoning;
      report.zoning_overview.property_zoning_district = row(district, 'Realie', 'high');
    }

    // STEP 5b — Jurisdiction cross-check for zoning jurisdiction.
    if (!clean(report.zoning_overview?.zoning_jurisdiction?.value)) {
      report.zoning_overview.zoning_jurisdiction = row(
        [city, geo.county_name, geo.state_code].filter(Boolean).join(', '),
        'Realie', 'medium'
      );
    }

    console.log(`Zoning report: user=${user.email} state=${geo.state_code} city=${city || '—'} county=${geo.county_name || '—'} realie=${!!realie} notion=${!!notion?.found}`);

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
      notion_matched: !!notion?.found,
      parcel: realie ? {
        parcel_id: realie.parcel_id,
        owner_name: realie.owner_name,
        acreage: realie.acreage,
        geometry: realie.geometry,
      } : null,
      sources_used: {
        realie: !!realie,
        realie_zoning: realie?.zoning || null,
        notion: !!notion?.found,
        notion_folder: notion?.folder_title || null,
      },
    });
  } catch (error) {
    console.error('generateZoningPermitReport error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});