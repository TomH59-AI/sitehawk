// zoningScraperIngest — intake for the Railway "Zoning Scraper MCP"
// (github.com/TomH59-AI/mcp-zoning-scraper), fed by the Notion database
// "The United States Zoning URL" (Jurisdiction | Authority Level | URL | State).
//
// URL:  https://site-hawk-pro.base44.app/functions/zoningScraperIngest
// Auth: header  x-webhook-secret: <WEBHOOK_SECRET>
//       (Authorization: Bearer <WEBHOOK_SECRET> is accepted too)
//
// Body (one jurisdiction per call — all of its Notion URLs together):
// {
//   "jurisdiction": "Calhoun County",
//   "state": "MI",                       // 2-letter or full name
//   "run_id": "2026-08-20T14:00:00Z",    // optional
//   "polygon": {...GeoJSON...},          // optional, stored as boundary_reference
//   "sources": [
//     { "url": "https://...", "authority_level": "Building Permits",
//       "text": "<cleaned page text>", "ok": true, "method": "scrapfly" }
//   ]
// }
//
// What it writes (only fields that were actually found — never blanks existing values):
//   JurisdictionRegistry   one row per jurisdiction+state
//   JurisdictionResource   one row per Notion URL (typed from Authority Level)
//   Jurisdiction           the full SCIP template: Zoning Overview, Tower Specifics,
//                          Site Plan Overview, Building Permit Information
//   TelecomOrdinance       numeric tower rules for SiteHawk's compliance math
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const STATE_CODES = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO',
  CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID',
  ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA',
  MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
  MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR',
  PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC',
};

function toStateCode(value) {
  const s = String(value || '').trim().toUpperCase();
  if (s.length === 2) return s;
  return STATE_CODES[s] || s.slice(0, 2);
}

function normalizeJurisdiction(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/\b(CITY|TOWN|VILLAGE|TOWNSHIP|CHARTER TOWNSHIP)\s+OF\s+/g, '')
    .replace(/\bCOUNTY\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function jurisdictionType(name) {
  const n = String(name || '').toLowerCase();
  if (/\bcounty\b/.test(n)) return 'county';
  if (/\btownship\b/.test(n)) return 'township';
  if (/\bvillage\b/.test(n)) return 'village';
  if (/\bcity\b/.test(n)) return 'city';
  return 'municipality';
}

// Notion "Authority Level" -> JurisdictionResource.resource_type
function resourceTypeFor(authorityLevel, url) {
  const a = String(authorityLevel || '').toLowerCase();
  const u = String(url || '').toLowerCase();
  if (/telecom|communication|tower|wireless|antenna/.test(a)) return 'wireless_telecom_ordinance';
  if (/building permit|building department|inspection/.test(a)) return 'building_department';
  if (/fee/.test(a)) return 'fee_schedule';
  if (/site plan|planning application/.test(a)) return 'planning_application';
  if (/conditional|special (use|exception)/.test(a)) return 'conditional_use_or_special_use';
  if (/zoning map/.test(a)) return 'zoning_map';
  if (/zoning|planning|municipal authority/.test(a)) return 'zoning_ordinance';
  if (/municode|amlegal|ecode360|generalcode|codelibrary/.test(u)) return 'zoning_ordinance';
  if (/permit/.test(a) || /permit/.test(u)) return 'permit_portal';
  if (/contact|assess/.test(a) || /contact/.test(u)) return 'contact_page';
  return 'other';
}

function sourcePlatform(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('municode')) return 'municode';
  if (u.includes('amlegal')) return 'american_legal';
  if (u.includes('ecode360') || u.includes('generalcode')) return 'general_code';
  if (u.includes('zoneomics')) return 'zoneomics';
  if (u.includes('sterlingcodifiers')) return 'sterling';
  return 'municipal_site';
}

function cleanStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s && !/^(null|none|n\/a|unknown|not (stated|specified|found))$/i.test(s) ? s : null;
}
function cleanNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function cleanBool(v) {
  if (typeof v === 'boolean') return v;
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (['true', 'yes', 'y', 'required'].includes(s)) return true;
  if (['false', 'no', 'n', 'not required'].includes(s)) return false;
  return null;
}
function cleanEnum(v, allowed) {
  const s = cleanStr(v);
  if (!s) return null;
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  return hit || null;
}
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

// ---------- LLM extraction schema: the SCIP template, section by section ----------
const STR = { type: ['string', 'null'] };
const NUM = { type: ['number', 'null'] };
const BOOL = { type: ['boolean', 'null'] };

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    zoning_overview: {
      type: 'object',
      properties: {
        zoning_jurisdiction: STR,
        zoning_contact_name: STR,
        zoning_contact_email: STR,
        zoning_contact_phone: STR,
        zoning_process: STR,
        cup_special_exception_path: STR,
        pe_self_certification: STR,
        zoning_fees: STR,
        zoning_approval_timeframe: STR,
      },
    },
    tower_specifics: {
      type: 'object',
      properties: {
        ldc_section_reference: STR,
        max_tower_height_ft: NUM,
        stealth_required: BOOL,
        required_collocations: NUM,
        residential_separation: NUM,
        residential_separation_unit: { type: ['string', 'null'], enum: ['ft', 'pct', 'multiple', null] },
        tower_separation: NUM,
        tower_separation_unit: { type: ['string', 'null'], enum: ['ft', 'pct', 'multiple', null] },
        measured_from: { type: ['string', 'null'], enum: ['base', 'center', null] },
        setback_ft: NUM,
        setback_rule: STR,
        fall_zone_ft: NUM,
        fall_zone_pct_of_height: NUM,
        fall_zone_requirements: STR,
        pe_letter_fall_zone_setback_relief: STR,
        pe_fall_zone_allowed: BOOL,
        special_tower_landscaping: BOOL,
        permit_type: STR,
      },
    },
    site_plan_overview: {
      type: 'object',
      properties: {
        site_plan_jurisdiction: STR,
        site_plan_contact_name: STR,
        site_plan_contact_email: STR,
        site_plan_contact_phone: STR,
        site_plan_fees: STR,
        site_plan_timeframe: STR,
        existing_site_plan_to_amend: BOOL,
        concurrent_to_zoning_or_bp: BOOL,
        site_plan_submittal_deadlines: STR,
        site_plan_submission_format: { type: ['string', 'null'], enum: ['electronic', 'hard_copy', 'both', null] },
      },
    },
    building_permit_information: {
      type: 'object',
      properties: {
        building_permit_jurisdiction: STR,
        building_dept_contact_name: STR,
        building_dept_contact_email: STR,
        building_dept_contact_phone: STR,
        gc_must_submit: BOOL,
        building_permit_fees: STR,
        building_permit_timeframe: STR,
        bond_required: BOOL,
        e911_address_assigned: BOOL,
      },
    },
    citations: {
      type: 'array',
      description: 'One entry per field you filled: the field name, the source URL it came from, and a short verbatim quote.',
      items: {
        type: 'object',
        properties: { field: STR, source_url: STR, quote: STR },
      },
    },
    confidence: { type: ['string', 'null'], enum: ['high', 'medium', 'low', null] },
    notes: STR,
  },
};

const MAX_CHARS_PER_SOURCE = 40000;
const MAX_CHARS_TOTAL = 140000;

function buildPrompt(jurisdiction, state, sources) {
  let budget = MAX_CHARS_TOTAL;
  const blocks = [];
  for (const s of sources) {
    if (!s.text || budget <= 0) continue;
    const slice = s.text.slice(0, Math.min(MAX_CHARS_PER_SOURCE, budget));
    budget -= slice.length;
    blocks.push(`=== SOURCE (${s.authority_level || 'unspecified'}) ${s.url} ===\n${slice}`);
  }

  return `You are filling SkyWave's SCIP (Site Candidate Information Package) zoning template for a proposed wireless telecommunications tower in ${jurisdiction}, ${state}.

Below are pages scraped from the jurisdiction's official websites and code library. Each source is labeled with its "Authority Level" (what the page is for: zoning / planning, building permits, telecom-communication towers, etc.).

Fill the four SCIP sections:
1. ZONING OVERVIEW — zoning jurisdiction (who has zoning authority), zoning contact (name/email/phone of planning & zoning dept), zoning process (permitted / administrative / CUP / SUP / special exception / variance — describe the path for a new tower), CUP or special-exception path, PE self-certification (does the code let a licensed professional engineer self-certify structural/fall-zone items), zoning fees, approval timeframe.
2. TOWER SPECIFICS — code section reference(s) for wireless/telecom towers, maximum tower height (ft), stealth/concealment required, required collocations (number), residential separation (value + unit ft/pct/multiple of height), tower-to-tower separation (value + unit), whether separation is measured from base or center, setback, fall zone (ft or % of height) and the rule text, whether a PE letter can reduce the fall zone / setback, landscaping/buffer requirements specific to towers, permit type.
3. SITE PLAN OVERVIEW — site plan jurisdiction, site plan contact, fees, approval timeframe, whether an existing site plan must be amended, whether site plan runs concurrently with zoning or building permit, submittal deadlines / cycles, electronic or hard copy submission.
4. BUILDING PERMIT INFORMATION — building permit jurisdiction, building department contact, whether the GC must submit, fees, timeframe, bond required, whether an E911 address is assigned.

STRICT RULES:
- NEVER fabricate. Only return values explicitly stated in the sources. Leave a field null if it is not stated.
- Numbers as plain numbers (feet unless the unit field says otherwise). If a separation is "300% of tower height" use value 300 and unit "pct"; if "2 times the height" use 2 and "multiple".
- Prefer the telecom/wireless ordinance for Tower Specifics; prefer the department pages for contacts, fees and timeframes.
- For every field you fill, add a citation with the source URL and a short verbatim quote.
- Set confidence: high if the core tower rules (height, setback/fall zone, permit type) are explicit; medium if partially; low if mostly missing.

${blocks.join('\n\n')}`;
}

// A full county boundary is megabytes of GeoJSON — far past Base44's field-size
// cap, and the old `.slice(0, 50000)` guard just produced invalid JSON. What the
// registry actually needs from a boundary is its extent, so store that: bbox,
// centroid and vertex count, small enough to always fit.
function summarizePolygon(geometry) {
  if (!geometry || typeof geometry !== 'object') return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
  const walk = (node) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      const [x, y] = node;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      n += 1;
      return;
    }
    for (const child of node) walk(child);
  };
  walk(geometry.coordinates);
  if (!n || !Number.isFinite(minX)) return null;
  const r = (v) => Math.round(v * 1e6) / 1e6;
  return JSON.stringify({
    type: geometry.type || 'Polygon',
    bbox: [r(minX), r(minY), r(maxX), r(maxY)],
    centroid: [r((minX + maxX) / 2), r((minY + maxY) / 2)],
    vertices: n,
    source: 'nominatim',
  });
}

// ---------- upserts ----------
// In the Notion table, Michigan township rows carry the COUNTY name in the
// "Authority Level" column (e.g. Byron Township | Kent). Recover it for the registry.
function countyFromSources(name, sources) {
  if (/\bcounty\b/i.test(name)) return name;
  const AUTH = /permit|zoning|planning|telecom|wireless|communication|tower|map|gis|fee|site plan|authority|split|inspection|code|ordinance|contact|assess/i;
  const hit = (sources || []).map((s) => cleanStr(s.authority_level)).find((a) => a && !AUTH.test(a) && a.split(' ').length <= 3);
  return hit ? (/\bcounty\b/i.test(hit) ? hit : `${hit} County`) : null;
}

async function upsertRegistry(base44, name, state, polygon, sources) {
  const svc = base44.asServiceRole.entities.JurisdictionRegistry;
  const existing = await svc.filter({ name, state });
  const patch = compact({
    name,
    state,
    jurisdiction_type: jurisdictionType(name),
    county: countyFromSources(name, sources),
    active: true,
    boundary_reference: summarizePolygon(polygon),
  });
  if (existing.length) {
    await svc.update(existing[0].id, patch);
    return { id: existing[0].id, action: 'updated' };
  }
  const rec = await svc.create(patch);
  return { id: rec.id, action: 'created' };
}

async function upsertResources(base44, jurisdictionId, sources, nowIso) {
  const svc = base44.asServiceRole.entities.JurisdictionResource;
  const out = [];
  for (const s of sources) {
    if (!s.url) continue;
    const patch = compact({
      jurisdiction_id: jurisdictionId,
      resource_type: resourceTypeFor(s.authority_level, s.url),
      title: cleanStr(s.authority_level) || 'Zoning source',
      url: s.url,
      source_platform: sourcePlatform(s.url),
      status: s.ok && (s.text || '').length > 200 ? 'verified' : 'broken',
      verified_on: s.ok ? nowIso.slice(0, 10) : null,
      last_checked_at: nowIso,
      notes: s.ok ? `fetched via ${s.method || 'scraper'}, ${(s.text || '').length} chars` : `fetch failed: ${s.error || 'no content'}`,
      active: true,
    });
    const existing = await svc.filter({ jurisdiction_id: jurisdictionId, url: s.url });
    if (existing.length) {
      await svc.update(existing[0].id, patch);
      out.push({ url: s.url, action: 'updated' });
    } else {
      await svc.create(patch);
      out.push({ url: s.url, action: 'created' });
    }
  }
  return out;
}

function flattenExtraction(x) {
  const z = x?.zoning_overview || {};
  const t = x?.tower_specifics || {};
  const sp = x?.site_plan_overview || {};
  const bp = x?.building_permit_information || {};
  // Booleans/enums are easy for the model to "default" (stealth_required=false,
  // measured_from=base) without any source. Only keep them when the model also
  // produced a citation for that field, or when a companion value is present.
  const cited = new Set((Array.isArray(x?.citations) ? x.citations : []).map((c) => String(c?.field || '').trim()).filter(Boolean));
  const boolIfCited = (v, field) => (cited.has(field) ? cleanBool(v) : null);
  const resSep = cleanNum(t.residential_separation);
  const twrSep = cleanNum(t.tower_separation);
  const out = {
    // Zoning overview
    zoning_jurisdiction: cleanStr(z.zoning_jurisdiction),
    zoning_contact_name: cleanStr(z.zoning_contact_name),
    zoning_contact_email: cleanStr(z.zoning_contact_email),
    zoning_contact_phone: cleanStr(z.zoning_contact_phone),
    zoning_process: [cleanStr(z.zoning_process), cleanStr(z.cup_special_exception_path) && `CUP / Special Exception: ${cleanStr(z.cup_special_exception_path)}`, cleanStr(z.pe_self_certification) && `PE Self-Certification: ${cleanStr(z.pe_self_certification)}`].filter(Boolean).join(' | ') || null,
    zoning_fees: cleanStr(z.zoning_fees),
    zoning_approval_timeframe: cleanStr(z.zoning_approval_timeframe),
    // Tower specifics
    ldc_section_reference: cleanStr(t.ldc_section_reference),
    max_tower_height_ft: cleanNum(t.max_tower_height_ft),
    stealth_required: boolIfCited(t.stealth_required, 'stealth_required'),
    required_collocations: cleanNum(t.required_collocations),
    residential_separation: resSep,
    residential_separation_unit: resSep !== null ? cleanEnum(t.residential_separation_unit, ['ft', 'pct', 'multiple']) : null,
    tower_separation: twrSep,
    tower_separation_unit: twrSep !== null ? cleanEnum(t.tower_separation_unit, ['ft', 'pct', 'multiple']) : null,
    measured_from: (resSep !== null || twrSep !== null || cited.has('measured_from')) ? cleanEnum(t.measured_from, ['base', 'center']) : null,
    setback_ft: cleanNum(t.setback_ft),
    fall_zone_ft: cleanNum(t.fall_zone_ft),
    fall_zone_requirements: [cleanStr(t.fall_zone_requirements), cleanStr(t.pe_letter_fall_zone_setback_relief) && `PE letter relief: ${cleanStr(t.pe_letter_fall_zone_setback_relief)}`].filter(Boolean).join(' | ') || null,
    special_tower_landscaping: boolIfCited(t.special_tower_landscaping, 'special_tower_landscaping'),
    // Site plan
    site_plan_jurisdiction: cleanStr(sp.site_plan_jurisdiction),
    site_plan_contact_name: cleanStr(sp.site_plan_contact_name),
    site_plan_contact_email: cleanStr(sp.site_plan_contact_email),
    site_plan_contact_phone: cleanStr(sp.site_plan_contact_phone),
    site_plan_fees: cleanStr(sp.site_plan_fees),
    site_plan_timeframe: cleanStr(sp.site_plan_timeframe),
    existing_site_plan_to_amend: boolIfCited(sp.existing_site_plan_to_amend, 'existing_site_plan_to_amend'),
    concurrent_to_zoning_or_bp: boolIfCited(sp.concurrent_to_zoning_or_bp, 'concurrent_to_zoning_or_bp'),
    site_plan_submittal_deadlines: cleanStr(sp.site_plan_submittal_deadlines),
    site_plan_submission_format: cleanEnum(sp.site_plan_submission_format, ['electronic', 'hard_copy', 'both']),
    // Building permit
    building_permit_jurisdiction: cleanStr(bp.building_permit_jurisdiction),
    building_dept_contact_name: cleanStr(bp.building_dept_contact_name),
    building_dept_contact_email: cleanStr(bp.building_dept_contact_email),
    building_dept_contact_phone: cleanStr(bp.building_dept_contact_phone),
    gc_must_submit: boolIfCited(bp.gc_must_submit, 'gc_must_submit'),
    building_permit_fees: cleanStr(bp.building_permit_fees),
    building_permit_timeframe: cleanStr(bp.building_permit_timeframe),
    bond_required: boolIfCited(bp.bond_required, 'bond_required'),
    e911_address_assigned: boolIfCited(bp.e911_address_assigned, 'e911_address_assigned'),
  };
  return out;
}

async function upsertJurisdiction(base44, name, state, fields, meta) {
  const svc = base44.asServiceRole.entities.Jurisdiction;
  const existing = await svc.filter({ name, state });
  const patch = compact({ name, state, ...fields, ...meta });
  if (existing.length) {
    await svc.update(existing[0].id, patch);
    return { id: existing[0].id, action: 'updated', fields_written: Object.keys(patch).length };
  }
  const rec = await svc.create(patch);
  return { id: rec.id, action: 'created', fields_written: Object.keys(patch).length };
}

async function upsertTelecomOrdinance(base44, jurisdiction, state, x, fields, citations, sourceUrl, runId, nowIso) {
  const t = x?.tower_specifics || {};
  const svc = base44.asServiceRole.entities.TelecomOrdinance;
  const jurisdiction_normalized = normalizeJurisdiction(jurisdiction);

  const toFt = (value, unit, height) => {
    if (value === null) return null;
    if (unit === 'pct' && height) return (value / 100) * height;
    if (unit === 'multiple' && height) return value * height;
    if (unit === 'ft' || !unit) return value;
    return null;
  };

  const payload = compact({
    jurisdiction,
    state,
    jurisdiction_normalized,
    height_limit_ft: fields.max_tower_height_ft,
    setback_ft: fields.setback_ft,
    fall_zone_ft: fields.fall_zone_ft,
    fall_zone_pct_of_height: cleanNum(t.fall_zone_pct_of_height),
    residential_separation_ft: toFt(fields.residential_separation, fields.residential_separation_unit, fields.max_tower_height_ft),
    tower_separation_ft: toFt(fields.tower_separation, fields.tower_separation_unit, fields.max_tower_height_ft),
    permit_type: cleanStr(t.permit_type),
    setback_rule: cleanStr(t.setback_rule),
    pe_fall_zone_allowed: citations?.some((c) => c?.field === 'pe_fall_zone_allowed') ? cleanBool(t.pe_fall_zone_allowed) : null,
    stealth_required: fields.stealth_required,
    collocation_required: fields.required_collocations !== null ? fields.required_collocations > 0 : null,
    source_url: sourceUrl,
    section_ref: fields.ldc_section_reference,
    field_citations: citations?.length ? Object.fromEntries(citations.filter((c) => c?.field).map((c) => [c.field, { source_url: c.source_url, quote: c.quote }])) : null,
    verification_status: 'unverified',
    last_source_method: 'mcp-zoning-scraper',
    review_required: (x?.confidence || 'low') !== 'high',
    codehawk_run_id: runId,
    extraction_notes: [x?.confidence && `confidence=${x.confidence}`, cleanStr(x?.notes)].filter(Boolean).join(' | ') || null,
    last_verified_date: nowIso.slice(0, 10),
  });

  const numericKeys = ['height_limit_ft', 'setback_ft', 'fall_zone_ft', 'fall_zone_pct_of_height', 'residential_separation_ft', 'tower_separation_ft', 'permit_type', 'section_ref'];
  const filled = numericKeys.filter((k) => payload[k] !== undefined).length;
  if (filled === 0) return { action: 'skipped', reason: 'no tower rules found' };
  payload.completeness_score = Math.round((filled / numericKeys.length) * 100);

  let existing = await svc.filter({ jurisdiction_normalized, state });
  if (!existing.length && /\bCOUNTY\b/i.test(jurisdiction)) {
    existing = await svc.filter({ jurisdiction_normalized: `${jurisdiction_normalized} COUNTY`, state });
  }
  if (existing.length) {
    await svc.update(existing[0].id, payload);
    return { id: existing[0].id, action: 'updated', completeness_score: payload.completeness_score };
  }
  const rec = await svc.create(payload);
  return { id: rec.id, action: 'created', completeness_score: payload.completeness_score };
}

// ---------- handler ----------
export default async function (req) {
  try {
    const expected = secrets.get('WEBHOOK_SECRET');
    if (!expected) return Response.json({ error: 'WEBHOOK_SECRET not configured' }, { status: 500 });
    const viaHeader = req.headers.get('x-webhook-secret') || '';
    const viaBearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (viaHeader !== expected && viaBearer !== expected) {
      console.error('zoningScraperIngest: bad or missing secret');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return Response.json({ error: 'Body must be a JSON object' }, { status: 400 });

    const jurisdiction = cleanStr(body.jurisdiction);
    const state = toStateCode(body.state);
    if (!jurisdiction || !state) return Response.json({ error: 'jurisdiction and state are required' }, { status: 400 });

    const sources = Array.isArray(body.sources) ? body.sources.map((s) => ({
      url: cleanStr(s?.url),
      authority_level: cleanStr(s?.authority_level),
      text: typeof s?.text === 'string' ? s.text : '',
      ok: s?.ok !== false && typeof s?.text === 'string' && s.text.length > 0,
      method: cleanStr(s?.method),
      error: cleanStr(s?.error),
    })).filter((s) => s.url) : [];

    const nowIso = new Date().toISOString();
    const runId = cleanStr(body.run_id) || `mcp-zoning-scraper:${nowIso}`;
    const base44 = createClientFromRequest(req);

    const registry = await upsertRegistry(base44, jurisdiction, state, body.polygon, sources);
    const resources = await upsertResources(base44, registry.id, sources, nowIso);

    const withText = sources.filter((s) => s.ok && s.text.length > 200);
    if (withText.length === 0 || body.skip_extraction === true) {
      return Response.json({
        ok: true, jurisdiction, state, registry, resources,
        extraction: { action: 'skipped', reason: withText.length === 0 ? 'no source text' : 'skip_extraction' },
      });
    }

    const extraction = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      prompt: buildPrompt(jurisdiction, state, withText),
      response_json_schema: EXTRACTION_SCHEMA,
    });

    const fields = flattenExtraction(extraction);
    const citations = Array.isArray(extraction?.citations) ? extraction.citations : [];
    const primaryUrl = (withText.find((s) => resourceTypeFor(s.authority_level, s.url) === 'wireless_telecom_ordinance') || withText[0]).url;

    const meta = {
      source_url: primaryUrl,
      last_researched_at: nowIso,
      research_notes: [
        `mcp-zoning-scraper run ${runId}`,
        `confidence=${extraction?.confidence || 'unknown'}`,
        `sources: ${withText.map((s) => `${s.authority_level || 'source'} <${s.url}>`).join('; ')}`,
        cleanStr(extraction?.notes),
        citations.length ? `citations: ${JSON.stringify(citations).slice(0, 6000)}` : null,
      ].filter(Boolean).join('\n'),
    };

    const jur = await upsertJurisdiction(base44, jurisdiction, state, fields, meta);
    const ord = await upsertTelecomOrdinance(base44, jurisdiction, state, extraction, fields, citations, primaryUrl, runId, nowIso);

    const filledCount = Object.values(fields).filter((v) => v !== null).length;
    console.log(`zoningScraperIngest: ${jurisdiction}, ${state} — ${filledCount} SCIP fields, confidence=${extraction?.confidence}`);

    return Response.json({
      ok: true, jurisdiction, state, registry, resources,
      extraction: { action: 'done', confidence: extraction?.confidence || null, scip_fields_filled: filledCount },
      jurisdiction_record: jur,
      telecom_ordinance: ord,
    });
  } catch (error) {
    console.error('zoningScraperIngest error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
