/**
 * generateZoningPermitReport — ZONEOMICS REMOVED, replaced by Regrid + Realie + Notion stack.
 *
 * Builds the full SiteHawk Zoning + Site Plan + Building Permit report.
 *
 * SERIAL PIPELINE:
 *   STEP 1  MapBox reverse-geocode (MAPBOX_API_KEY) → state / county / city
 *   STEP 2  Regrid point parcel (REGRID_API_TOKEN)  → PRIMARY parcel + zoning district
 *   STEP 3  Realie parcel cross-check (REALIE_API_KEY) → zoning agreement / supplement
 *   STEP 4  Notion Ordinance Vacuum                 → PRIMARY telecom tower rules
 *   STEP 5  LLM extraction fallback (gemini)        → fills gaps from ordinance prose
 *   STEP 6  Render four panels — each row { value, source, confidence }
 *
 * Source tags surfaced to the UI: Regrid | Realie | Notion | AI | Manual.
 * Zoning-district disagreements between Regrid and Realie are flagged so the
 * user can pick.
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

// ─── STEP 2: Regrid point parcel (PRIMARY parcel + zoning district) ─────────
async function fetchRegridParcel(lat, lon) {
  const token = Deno.env.get('REGRID_API_TOKEN');
  if (!token) return null;
  const url = `https://app.regrid.com/api/v2/parcels/point?lat=${lat}&lon=${lon}&token=${token}`;
  const res = await fetchJsonWithTimeout(url, { headers: { Accept: 'application/json' } }, 12000);
  const feature = res?.data?.parcels?.features?.[0];
  if (!feature) return null;
  const f = feature.properties?.fields || {};
  return {
    parcel_id: clean(f.parcelnumb) || null,
    owner_name: clean(f.owner) || null,
    address: clean(f.address) || null,
    city: clean(f.scity) || null,
    county: clean(f.county) || null,
    state: clean(f.state2) || null,
    acreage: f.gisacre || f.ll_gisacre || null,
    zoning: clean(f.zoning) || null,
    zoning_description: clean(f.zoning_description) || null,
    zoning_subtype: clean(f.zoning_subtype || f.zoning_type) || null,
    jurisdiction: clean(f.county || f.scity) || null,
    geometry: feature.geometry || null,
  };
}

// ─── STEP 3: Realie parcel cross-check / supplement ─────────────────────────
async function getRealieParcel(address) {
  const key = Deno.env.get('REALIE_API_KEY');
  if (!key || !address) return null;
  try {
    const r = await fetch(`https://app.realie.ai/api/public/property/search/?address=${encodeURIComponent(address)}`, {
      headers: { Authorization: key, Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const p = Array.isArray(d) ? d[0] : d?.results?.[0] || d;
    if (!p) return null;
    return {
      land_use: p.land_use || p.property_use || p.use_description || null,
      acreage: p.acreage || p.acres || p.lot_size_acres || null,
      zoning: p.zoning || p.zoning_code || null,
      zoning_overlay: p.zoning_overlay || p.overlay || null,
      special_district: p.special_district || null,
    };
  } catch (_) { return null; }
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

// ─── STEP 5: LLM structured extraction (gap-fill from Notion prose) ─────────
async function llmExtractReport(base44, ctx) {
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gemini_3_flash',
    add_context_from_internet: true,
    prompt: `You are extracting a SiteHawk Zoning + Permit Report for a telecom tower site.

CONTEXT:
- Coordinates: ${ctx.lat}, ${ctx.lon}
- State: ${ctx.state}  | County: ${ctx.county}  | City: ${ctx.city || 'unknown'}
- Parcel address: ${ctx.address}

SOURCE A — Regrid parcel (PRIMARY for zoning district / parcel facts):
${JSON.stringify(ctx.regrid || { miss: true }).slice(0, 4000)}

SOURCE B — Realie parcel (cross-check / supplement):
${JSON.stringify(ctx.realie || { miss: true }).slice(0, 4000)}

SOURCE C — Notion Ordinance Vacuum (PRIMARY for telecom tower rules, fees, contacts, process), state folder "${ctx.notion?.folder_title || 'none'}":
${(ctx.notion?.text || '(no Notion content found for this state)').slice(0, 40000)}

TASK: Fill out EVERY field in the report below using the sources. Per field:
- TOWER SPECIFICS (LDC section refs, maximum tower height, stealth required, required collocations, residential separation, tower separation, measured from base/center, fall zone, special tower landscaping): use Notion (SOURCE C) FIRST, then web. Set source to "Notion" if directly quoted from the Notion KEY PROVISIONS, or "AI" if inferred from Notion prose.
- Property zoning DISTRICT / land use: prefer Regrid (SOURCE A), then Realie (SOURCE B). Set source to "Regrid" or "Realie".
- Fees / contacts / process / timeframes (site plan + building permit panels): prefer Notion. Set source to "Notion" or "AI".
- Set "source" to one of: "Regrid" | "Realie" | "Notion" | "AI" | "none".
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
    const [mb, fcc] = await Promise.all([
      mapboxReverseGeocode(lat, lon).catch(() => null),
      getGeoContext(lat, lon).catch(() => ({})),
    ]);
    const geo = {
      state_code: mb?.state_code || fcc?.state_code || null,
      state_name: mb?.state_name || fcc?.state_name || null,
      county_name: mb?.county_name || fcc?.county_name || null,
    };

    // STEP 2 + 3 — Regrid (primary parcel/zoning) + Realie (cross-check), in parallel.
    const candidateAddress = candidate?.parcel_address || candidate?.address || null;
    const [regrid, realieByCandidate] = await Promise.all([
      fetchRegridParcel(lat, lon).catch(() => null),
      getRealieParcel(candidateAddress).catch(() => null),
    ]);
    // Prefer Regrid's resolved address for the Realie cross-check if we didn't have one.
    const realie = realieByCandidate || (regrid?.address ? await getRealieParcel(regrid.address).catch(() => null) : null);

    const city = mb?.city_name || regrid?.city || null;
    const jurisdictions = [city, geo.county_name, regrid?.jurisdiction].filter(Boolean);

    // STEP 4 — Notion Ordinance Vacuum (telecom rules).
    const notionToken = await getNotionAccessToken(base44);
    const notion = await getNotionStateContext(geo.state_code, jurisdictions, notionToken).catch(() => ({ found: false, text: '' }));

    // STEP 5 — LLM gap-fill from Notion prose + parcel facts.
    const llmReport = await llmExtractReport(base44, {
      lat, lon,
      state: geo.state_name || geo.state_code,
      county: geo.county_name,
      city,
      address: candidateAddress || regrid?.address,
      regrid,
      realie,
      notion,
    });

    const report = llmReport || {};
    report.zoning_overview = report.zoning_overview || {};

    // STEP 6a — Deterministic Regrid override for the zoning district (PRIMARY).
    let zoningDiscrepancy = null;
    if (regrid?.zoning) {
      const district = regrid.zoning_description
        ? `${regrid.zoning} — ${regrid.zoning_description}`
        : regrid.zoning;
      report.zoning_overview.property_zoning_district = row(district, 'Regrid', 'high');

      // Cross-check with Realie: flag a disagreement so the user can pick.
      const rz = clean(realie?.zoning);
      const gz = clean(regrid.zoning);
      if (rz && gz && rz.toUpperCase() !== gz.toUpperCase() && !rz.toUpperCase().includes(gz.toUpperCase()) && !gz.toUpperCase().includes(rz.toUpperCase())) {
        zoningDiscrepancy = { regrid: gz, realie: rz };
        report.zoning_overview.property_zoning_district = {
          value: `Discrepancy — Regrid: ${gz} | Realie: ${rz}`,
          source: 'Regrid \u2260 Realie',
          confidence: 'low',
        };
      }
    } else if (realie?.zoning) {
      report.zoning_overview.property_zoning_district = row(realie.zoning, 'Realie', 'medium');
    }

    // STEP 6b — Regrid jurisdiction cross-check for zoning jurisdiction.
    if (regrid?.jurisdiction && !clean(report.zoning_overview?.zoning_jurisdiction?.value)) {
      report.zoning_overview.zoning_jurisdiction = row(
        [city, geo.county_name, geo.state_code].filter(Boolean).join(', '),
        'Regrid', 'medium'
      );
    }

    console.log(`Zoning report: user=${user.email} state=${geo.state_code} city=${city || '—'} county=${geo.county_name || '—'} regrid=${!!regrid} realie=${!!realie} notion=${!!notion?.found} discrepancy=${!!zoningDiscrepancy}`);

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
      zoning_discrepancy: zoningDiscrepancy,
      parcel: regrid ? {
        parcel_id: regrid.parcel_id,
        owner_name: regrid.owner_name,
        acreage: regrid.acreage,
        geometry: regrid.geometry,
      } : null,
      sources_used: {
        regrid: !!regrid,
        regrid_zoning: regrid?.zoning || null,
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