/**
 * generateZoningPermitReport
 *
 * Builds the full SiteHawk Zoning + Site Plan + Building Permit report.
 *
 * Sources (in priority order, ALL are used — not short-circuited):
 *   1. Zoneomics API          → PRIMARY zoning: property zoning district, zone name, land use
 *   2. Notion Master Zoning   → BACKUP zoning + curated jurisdiction contacts, fees, timeframes, site plan + building permit process
 *   3. Municode Worker        → tower specs (height, setback, stealth, collocation, fall zone, LDC refs)
 *   4. Oxylabs scrape         → live planning/building dept pages to fill gaps
 *   5. Realie parcel          → current land use, acreage (for "meets min lot requirements")
 *
 * Output: { zoning_overview, tower_specifics, site_plan, building_permit }
 *   Every row is { value, source, confidence } so the UI shows provenance.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MUNICODE_WORKER_BASE = 'https://municode-mcp.tomhodges.workers.dev';
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

// ─── FCC geo (state/county) ─────────────────────────────────────────────────
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

function parseCityFromAddress(address, stateCode) {
  const text = clean(address);
  if (!text || !stateCode) return null;
  const parts = text.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const stateIdx = parts.findIndex(p => p.toUpperCase().startsWith(stateCode));
  if (stateIdx > 0) return parts[stateIdx - 1].replace(/\d{5}.*/, '').trim();
  return parts.length >= 3 ? parts[parts.length - 2].replace(/\d{5}.*/, '').trim() : null;
}

// ─── Zoneomics (PRIMARY zoning source) ──────────────────────────────────────
async function fetchZoneomics(lat, lon) {
  const apiKey = Deno.env.get('ZONEOMICS_API_KEY');
  if (!apiKey) return null;
  const url = new URL('https://api.zoneomics.com/v2/zoneDetail');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lon));
  url.searchParams.set('output_fields', 'zoning,plu,controls');
  const res = await fetchJsonWithTimeout(url.toString(), { headers: { Accept: 'application/json' } }, 15000);
  const d = res?.data?.data;
  if (!res.ok || !res?.data?.success || !d || !d.zone_details) return null;
  const zd = d.zone_details || {};
  const asOfRight = d.permitted_land_uses?.as_of_right || [];
  return {
    city_name: d.meta?.city_name || null,
    zone_code: clean(zd.zone_code),
    zone_name: clean(zd.zone_name),
    zone_type: clean(zd.zone_type),
    zone_guide: clean(zd.zone_guide),
    link: zd.link || null,
    permitted_land_uses: Array.isArray(asOfRight) ? asOfRight.slice(0, 20) : [],
  };
}

// ─── Municode ───────────────────────────────────────────────────────────────
async function fetchMunicode(jurisdictions, state) {
  if (!state) return null;
  for (const name of jurisdictions) {
    const url = `${MUNICODE_WORKER_BASE}/api/zoning?name=${encodeURIComponent(name)}&state=${encodeURIComponent(state)}&maxSections=10`;
    const res = await fetchJsonWithTimeout(url, { headers: { Accept: 'application/json' } }, 20000);
    if (res.ok && res.data) {
      const hasSpecs = res.data.towerSpecs && Object.values(res.data.towerSpecs).some(v => clean(v));
      const hasSections = Array.isArray(res.data.telecomSections) && res.data.telecomSections.length > 0;
      if (hasSpecs || hasSections) return { ...res.data, _matched: name };
    }
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
// Works regardless of where the page lives in Team Spaces, as long as the
// Notion integration has been added to that team space.
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
      // Title is in properties.title.title[] OR properties.Name.title[]
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

  // PRIMARY: workspace-wide search for "{ST}-Zoning" — finds pages in Team Spaces
  // as long as the Notion integration has been added to that team space.
  let folder = await notionSearchStateFolder(stateCode, token);

  // FALLBACK: if configured, also scan direct children of NOTION_MASTER_ZONING_PAGE_ID.
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
    console.warn(`Notion: no "${stateCode}-Zoning" page found. Make sure the Notion integration is connected to the Team Space containing your zoning folders (Notion → Settings → Connections → add this integration to that Team Space).`);
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
  // Prefer the Base44 Notion connector (OAuth) — it's the source of truth.
  // Fall back to the NOTION_API_TOKEN secret only if the connector isn't available.
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

// ─── Oxylabs scrape ─────────────────────────────────────────────────────────
async function oxylabsScrape(url) {
  const u = Deno.env.get('OXYLABS_USERNAME');
  const p = Deno.env.get('OXYLABS_PASSWORD');
  if (!u || !p) return null;
  try {
    const r = await fetch('https://realtime.oxylabs.io/v1/queries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${u}:${p}`)}`,
      },
      body: JSON.stringify({
        source: 'universal',
        url,
        render: 'html',
        geo_location: 'United States',
        user_agent_type: 'desktop',
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const html = data.results?.[0]?.content || '';
    // Strip tags down to ~30k chars of text
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                     .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim()
                     .slice(0, 30000);
    return { url, text };
  } catch (e) {
    console.warn('Oxylabs scrape failed:', e?.message);
    return null;
  }
}

async function searchPlanningDeptUrls(jurisdiction, state) {
  // Try a Google search via Oxylabs to find the planning + building department pages.
  const q = `${jurisdiction} ${state} planning department zoning telecom tower permit fees`;
  const data = await oxylabsScrape(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
  if (!data?.text) return [];
  // Extract .gov / .us domain URLs from search result text
  const urls = Array.from(data.text.matchAll(/https?:\/\/[a-z0-9.-]+\.(gov|us)[a-z0-9/_\-?=&.]*/gi))
    .map(m => m[0])
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 3);
  return urls;
}

// ─── Realie parcel ──────────────────────────────────────────────────────────
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
    };
  } catch (_) { return null; }
}

// ─── LLM structured extraction ──────────────────────────────────────────────
async function llmExtractReport(base44, ctx) {
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gemini_3_flash',
    add_context_from_internet: true,
    prompt: `You are extracting a SiteHawk Zoning + Permit Report for a telecom tower site.

CONTEXT:
- Coordinates: ${ctx.lat}, ${ctx.lon}
- State: ${ctx.state}  | County: ${ctx.county}  | City: ${ctx.city || 'unknown'}
- Parcel address: ${ctx.address}
- Parcel zoning (from search): ${ctx.parcelZoning || 'unknown'}
- Realie parcel facts: ${JSON.stringify(ctx.realie || {})}

SOURCE 1 — Zoneomics API (PRIMARY for property zoning district, zone name, permitted land uses):
${JSON.stringify(ctx.zoneomics || { miss: true }).slice(0, 8000)}

SOURCE 2 — Notion Master Zoning DB (BACKUP for zoning + curated contacts, fees, timeframes), state folder "${ctx.notion?.folder_title || 'none'}":
${(ctx.notion?.text || '(no Notion content found for this state)').slice(0, 35000)}

SOURCE 3 — Municode ordinance extract (PRIMARY for tower specs):
${JSON.stringify(ctx.municode || { miss: true }).slice(0, 12000)}

SOURCE 4 — Live web scrape (Oxylabs) of planning/building dept pages:
${(ctx.scrapes || []).map((s, i) => `--- SCRAPE ${i+1}: ${s.url} ---\n${s.text.slice(0, 8000)}`).join('\n\n').slice(0, 30000) || '(no scrapes returned)'}

TASK: Fill out EVERY field in the report below using ALL sources. Per field:
- Pick the BEST source. For property zoning district / zone name / land use, ALWAYS prefer Zoneomics (SOURCE 1); if Zoneomics has no coverage, fall back to Notion. Use Municode for tower specs; Notion for fees/contacts/process; Oxylabs/web for anything else missing.
- Set "source" to one of: "Zoneomics" | "Municode" | "Notion" | "Oxylabs" | "Realie" | "Web Research" | "none".
- If you genuinely cannot find a value in ANY source, set value to "NEEDS RESEARCH" and source to "none".
- DO NOT invent fees, phone numbers, addresses, or section numbers. Quote only what's in the sources.
- For yes/no fields use "Yes" / "No" / "NEEDS RESEARCH".
- Set confidence: "high" if directly quoted from official source; "medium" if inferred from context; "low" if best guess.`,
    response_json_schema: {
      type: 'object',
      properties: {
        jurisdiction_resolved: { type: 'string' },
        zoning_overview: {
          type: 'object',
          properties: {
            zoning_jurisdiction:        { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_contact_information: { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_process:             { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_fees:                { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            zoning_approval_timeframe:  { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            property_zoning_district:   { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            property_future_land_use:   { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            property_current_usage:     { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
            meets_min_lot_requirements: { type: 'object', properties: { value: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'string' } } },
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

// ─── Backfill Municode-derived tower specs (deterministic, not LLM) ─────────
function applyMunicodeOverrides(report, municode) {
  if (!municode) return report;
  const t = municode.towerSpecs || {};
  const ts = report.tower_specifics || {};
  const set = (key, val) => {
    if (clean(val) && (!ts[key] || ts[key].value === 'NEEDS RESEARCH' || ts[key].confidence === 'low')) {
      ts[key] = { value: clean(val), source: 'Municode', confidence: 'high' };
    }
  };
  set('maximum_tower_height', t.maxHeightFt);
  set('stealth_required', /required|yes/i.test(clean(t.stealthRequired)) ? 'Yes' : (clean(t.stealthRequired) || ''));
  set('required_collocations', t.collocationRequired);
  set('residential_separation', t.setbackResidential);
  set('fall_zone_requirements', t.fallZone);
  if (Array.isArray(t.ldcSections) && t.ldcSections.length) {
    set('ldc_section_references', t.ldcSections.join(', '));
  }
  report.tower_specifics = ts;
  return report;
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

    const address = candidate?.parcel_address || candidate?.address || null;
    const parcelZoning = candidate?.zoning_classification || candidate?.zoning || null;

    // 1. Geo context
    const geo = await getGeoContext(lat, lon);
    const city = parseCityFromAddress(address, geo.state_code);
    const jurisdictions = [city, geo.county_name].filter(Boolean);

    // 2. Run all sources in parallel — Zoneomics is the PRIMARY zoning source.
    const notionToken = await getNotionAccessToken(base44);
    const [zoneomics, municode, notion, realie] = await Promise.all([
      fetchZoneomics(lat, lon).catch(() => null),
      fetchMunicode(jurisdictions, geo.state_code).catch(() => null),
      getNotionStateContext(geo.state_code, jurisdictions, notionToken).catch(() => ({ found: false, text: '' })),
      getRealieParcel(address).catch(() => null),
    ]);

    // 3. Oxylabs scrape — find live planning dept pages for the jurisdiction
    const primaryJurisdiction = jurisdictions[0] || geo.county_name || '';
    const scrapeUrls = primaryJurisdiction ? await searchPlanningDeptUrls(primaryJurisdiction, geo.state_name || geo.state_code) : [];
    const scrapes = (await Promise.all(scrapeUrls.slice(0, 2).map(u => oxylabsScrape(u)))).filter(Boolean);

    // 4. LLM structured extract from all sources
    const llmReport = await llmExtractReport(base44, {
      lat, lon,
      state: geo.state_name || geo.state_code,
      county: geo.county_name,
      city,
      address,
      parcelZoning,
      zoneomics,
      municode,
      notion,
      scrapes,
      realie,
    });

    // 5. Deterministic Municode overrides for tower specs (higher trust than LLM)
    const report = applyMunicodeOverrides(llmReport, municode);

    // 6. Deterministic Zoneomics overrides — PRIMARY for property zoning district/land use.
    report.zoning_overview = report.zoning_overview || {};
    if (zoneomics?.zone_code) {
      const district = zoneomics.zone_name
        ? `${zoneomics.zone_code} — ${zoneomics.zone_name}`
        : zoneomics.zone_code;
      report.zoning_overview.property_zoning_district = row(district, 'Zoneomics', 'high');
    }
    if (zoneomics?.permitted_land_uses?.length && !clean(report.zoning_overview?.property_future_land_use?.value).length) {
      report.zoning_overview.property_future_land_use = row(zoneomics.zone_type || zoneomics.zone_name, 'Zoneomics', 'medium');
    }

    // 7. Realie current usage override (only if Zoneomics/LLM didn't supply it)
    if (realie?.land_use && !clean(report?.zoning_overview?.property_current_usage?.value).length) {
      report.zoning_overview.property_current_usage = row(realie.land_use, 'Realie', 'high');
    }

    console.log(`Zoning report: user=${user.email} state=${geo.state_code} city=${city || '—'} county=${geo.county_name || '—'} zoneomics=${!!zoneomics} municode=${!!municode} notion=${!!notion?.found} scrapes=${scrapes.length} realie=${!!realie}`);

    return Response.json({
      status: 'ok',
      jurisdiction_resolved: report.jurisdiction_resolved || primaryJurisdiction || geo.county_name || '',
      coordinates: { lat, lon },
      geo,
      report,
      sources_used: {
        zoneomics: !!zoneomics,
        zoneomics_zone: zoneomics?.zone_code || null,
        municode: !!municode,
        notion: !!notion?.found,
        notion_folder: notion?.folder_title || null,
        oxylabs_scrapes: scrapes.length,
        realie: !!realie,
      },
    });
  } catch (error) {
    console.error('generateZoningPermitReport error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});