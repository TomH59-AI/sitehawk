import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MAX_NOTION_CHARS = 45000;
const MUNICODE_WORKER_BASE = 'https://municode-mcp.tomhodges.workers.dev';
const ZONEOMICS_API = 'https://api.zoneomics.com/v2/zoneDetail';
const SOURCE_PRIORITY = ['municode_api', 'zoneomics_api', 'notion_fallback', 'llm_inferred'];

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, text };
  } catch (error) {
    return { ok: false, status: 0, error: error?.message || String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTitle(title = '') {
  return title.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function richTextToPlain(richText = []) {
  return richText.map(t => t?.plain_text || '').join('').trim();
}

function cleanString(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const clean = cleanString(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function truncate(value, limit = 1500) {
  const text = cleanString(value);
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function sourceChainSummary(trace = []) {
  return trace
    .map(item => {
      const bits = [item.source, item.status].filter(Boolean).join(': ');
      const detail = [item.jurisdiction, item.reason, item.http_status ? `HTTP ${item.http_status}` : '']
        .filter(Boolean)
        .join(' | ');
      return detail ? `${bits} (${detail})` : bits;
    })
    .filter(Boolean)
    .join(' -> ');
}

async function getGeoContext(lat, lon) {
  const url = `https://geo.fcc.gov/api/census/block/find?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&format=json`;
  const res = await fetchJsonWithTimeout(url, { headers: { Accept: 'application/json' } }, 9000);
  const data = res.data || {};

  return {
    state_code: data?.State?.code || null,
    state_name: data?.State?.name || null,
    county_name: data?.County?.name || null,
    county_fips: data?.County?.FIPS || null,
    block_fips: data?.Block?.FIPS || null,
    lookup_ok: res.ok && data?.status !== 'ERROR',
  };
}

async function getStateCode(lat, lon) {
  const geo = await getGeoContext(lat, lon);
  return geo.state_code || null;
}

function parseCityFromAddress(address, stateCode) {
  const text = cleanString(address);
  if (!text || !stateCode) return null;
  const parts = text.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const stateIndex = parts.findIndex(part => {
    const upper = part.toUpperCase();
    return upper === stateCode || upper.startsWith(`${stateCode} `);
  });

  if (stateIndex > 0) return parts[stateIndex - 1].replace(/\d{5}.*/, '').trim();
  if (parts.length >= 3) return parts[parts.length - 2].replace(/\d{5}.*/, '').trim();
  return null;
}

function cleanJurisdictionCandidate(name) {
  const cleaned = cleanString(name)
    .replace(/^unincorporated\s+/i, '')
    .replace(/^(city|town|village|borough|county)\s+of\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || /^unknown$/i.test(cleaned)) return null;
  if (/^\d/.test(cleaned)) return null;
  if (cleaned.length < 3 || cleaned.length > 80) return null;
  return cleaned;
}

function buildJurisdictionCandidates(ordinance, candidates, geoContext) {
  const raw = [];
  const stateCode = geoContext?.state_code || ordinance?.state || ordinance?.state_code;

  raw.push(
    ordinance?.jurisdiction,
    ordinance?.municipality,
    ordinance?.city,
    ordinance?.county,
    ordinance?.county_name,
  );

  if (geoContext?.county_name) raw.push(geoContext.county_name);

  for (const candidate of asArray(candidates).slice(0, 5)) {
    raw.push(candidate?.jurisdiction, candidate?.municipality, candidate?.city, candidate?.county, candidate?.county_name);
    raw.push(parseCityFromAddress(candidate?.parcel_address, stateCode));
    raw.push(parseCityFromAddress(candidate?.site_name, stateCode));
  }

  return uniqueStrings(raw.map(cleanJurisdictionCandidate)).slice(0, 8);
}

function towerSpecValueCount(towerSpecs = {}) {
  return [
    towerSpecs.maxHeightFt,
    towerSpecs.setbackPropertyLine,
    towerSpecs.setbackResidential,
    towerSpecs.fallZone,
    towerSpecs.stealthRequired,
    towerSpecs.collocationRequired,
    towerSpecs.buildingPermit,
    asArray(towerSpecs.ldcSections).length ? towerSpecs.ldcSections.join(', ') : '',
  ].filter(value => cleanString(value)).length;
}

function isMunicodeMiss(result) {
  const data = result?.data || {};
  return result.status === 404 ||
    data.status === 404 ||
    data?.source === 'municode_api' && data?.status === 404 ||
    /could not resolve municode client|missing required query param|not found/i.test(data?.error || result?.text || result?.error || '');
}

async function fetchMunicodeForJurisdiction(name, state) {
  const url = `${MUNICODE_WORKER_BASE}/api/zoning?name=${encodeURIComponent(name)}&state=${encodeURIComponent(state)}&maxSections=8`;
  const res = await fetchJsonWithTimeout(url, { headers: { Accept: 'application/json' } }, 18000);

  if (res.ok && res.data) {
    const data = res.data;
    const hasSections = asArray(data.telecomSections).length > 0;
    const hasSpecs = towerSpecValueCount(data.towerSpecs || {}) > 0;
    if (hasSections || hasSpecs) {
      return {
        data,
        trace: {
          source: 'municode_api',
          status: 'hit',
          jurisdiction: name,
          http_status: res.status,
          confidence: data.confidence || 'unknown',
        },
      };
    }
  }

  return {
    data: null,
    trace: {
      source: 'municode_api',
      status: isMunicodeMiss(res) ? 'miss' : 'error',
      jurisdiction: name,
      http_status: res.status || null,
      reason: res.data?.error || res.error || 'no telecom sections returned',
    },
  };
}

async function fetchMunicodeZoning(jurisdictionCandidates, state) {
  const trace = [];
  if (!state) {
    trace.push({ source: 'municode_api', status: 'skipped', reason: 'missing state code' });
    return { data: null, trace };
  }

  if (!jurisdictionCandidates.length) {
    trace.push({ source: 'municode_api', status: 'skipped', reason: 'no jurisdiction candidate' });
    return { data: null, trace };
  }

  for (const jurisdiction of jurisdictionCandidates) {
    const result = await fetchMunicodeForJurisdiction(jurisdiction, state);
    trace.push(result.trace);
    if (result.data) return { data: result.data, trace, jurisdiction };
  }

  return { data: null, trace };
}

function parseFeetNumber(value) {
  const match = cleanString(value).match(/(\d{1,4})/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

function firstSectionRefFromTitle(title) {
  const text = cleanString(title);
  const match = text.match(/(?:sec\.?|section)\s*([0-9A-Za-z.-]+)/i);
  return match ? match[1].replace(/\.$/, '') : '';
}

function buildSetbackSummary(towerSpecs = {}) {
  const parts = [];
  if (towerSpecs.setbackPropertyLine) parts.push(`Property line: ${towerSpecs.setbackPropertyLine}`);
  if (towerSpecs.setbackResidential) parts.push(`Residential/dwelling: ${towerSpecs.setbackResidential}`);
  if (towerSpecs.fallZone) parts.push(`Fall zone: ${towerSpecs.fallZone}`);
  return parts.join('; ');
}

function sectionSourceRef(sectionRefs, sections, sourceUrl) {
  if (sectionRefs.length) return `Sec. ${sectionRefs[0]}`;
  if (sections[0]?.section_ref) return sections[0].section_ref;
  if (sections[0]?.section_title) return sections[0].section_title;
  return sourceUrl || 'Municode Library';
}

function buildComplianceSummaryFromSpecs(towerSpecs, sections, sourceRef) {
  const keyLimits = [
    towerSpecs.maxHeightFt ? `${towerSpecs.maxHeightFt} ft max height` : '',
    buildSetbackSummary(towerSpecs),
    towerSpecs.stealthRequired ? `Stealth/concealment: ${towerSpecs.stealthRequired}` : '',
    towerSpecs.collocationRequired ? `Collocation: ${towerSpecs.collocationRequired}` : '',
  ].filter(Boolean).join('; ');

  const permitPath = towerSpecs.buildingPermit || 'Review local communications facility permit path';
  const sectionText = JSON.stringify(sections).toLowerCase();
  const hasSmallWireless = /small wireless|small cell/.test(sectionText);
  const hasRooftop = /rooftop|roof|attached antenna|building/.test(sectionText);
  const hasTemporary = /temporary/.test(sectionText);

  return [
    {
      tower_type: 'Macro tower / monopole',
      status: towerSpecs.buildingPermit ? 'conditional' : 'not_addressed',
      zones_or_context: 'Communications facility ordinance',
      permit_path: permitPath,
      key_limits: keyLimits || 'Tower-specific limits require ordinance review',
      user_summary: 'New freestanding tower proposals require ordinance review before parcel ranking is treated as build-ready.',
      source_ref: sourceRef,
      confidence: towerSpecValueCount(towerSpecs) >= 3 ? 'high' : 'medium',
    },
    {
      tower_type: 'Collocation',
      status: towerSpecs.collocationRequired ? 'conditional' : 'not_addressed',
      zones_or_context: 'Existing towers, structures, or antenna support facilities',
      permit_path: towerSpecs.collocationRequired ? 'Collocation prioritized before new tower approval' : 'Review ordinance',
      key_limits: towerSpecs.collocationRequired || 'Not addressed in extracted specs',
      user_summary: towerSpecs.collocationRequired ? 'Existing structures should be evaluated before proposing a new tower.' : 'No collocation rule was extracted.',
      source_ref: sourceRef,
      confidence: towerSpecs.collocationRequired ? 'high' : 'low',
    },
    {
      tower_type: 'Concealed / stealth facility',
      status: towerSpecs.stealthRequired ? 'conditional' : 'not_addressed',
      zones_or_context: 'Visual impact and concealment standards',
      permit_path: permitPath,
      key_limits: towerSpecs.stealthRequired || 'Not addressed in extracted specs',
      user_summary: towerSpecs.stealthRequired ? 'Expect camouflage or concealment review as part of the local approval path.' : 'No stealth requirement was extracted.',
      source_ref: sourceRef,
      confidence: towerSpecs.stealthRequired ? 'high' : 'low',
    },
    {
      tower_type: 'Rooftop / attached antenna',
      status: hasRooftop ? 'conditional' : 'not_addressed',
      zones_or_context: hasRooftop ? 'Attached antenna provisions referenced' : 'No attached antenna clause extracted',
      permit_path: hasRooftop ? permitPath : 'Review ordinance',
      key_limits: hasRooftop ? keyLimits || 'See attached antenna section' : 'Not addressed in extracted specs',
      user_summary: hasRooftop ? 'Attached antennas appear to have their own review standards.' : 'No rooftop or attached antenna rule was extracted.',
      source_ref: sourceRef,
      confidence: hasRooftop ? 'medium' : 'low',
    },
    {
      tower_type: 'Small wireless facility',
      status: hasSmallWireless ? 'conditional' : 'not_addressed',
      zones_or_context: hasSmallWireless ? 'Small wireless provisions referenced' : 'No small wireless clause extracted',
      permit_path: hasSmallWireless ? permitPath : 'Review ordinance',
      key_limits: hasSmallWireless ? keyLimits || 'See small wireless section' : 'Not addressed in extracted specs',
      user_summary: hasSmallWireless ? 'Small wireless facilities appear in the extracted ordinance context.' : 'No small wireless rule was extracted.',
      source_ref: sourceRef,
      confidence: hasSmallWireless ? 'medium' : 'low',
    },
    {
      tower_type: 'Temporary tower',
      status: hasTemporary ? 'conditional' : 'not_addressed',
      zones_or_context: hasTemporary ? 'Temporary communications facility provisions referenced' : 'No temporary tower clause extracted',
      permit_path: hasTemporary ? permitPath : 'Review ordinance',
      key_limits: hasTemporary ? 'Temporary use standards appear in the extracted ordinance context' : 'Not addressed in extracted specs',
      user_summary: hasTemporary ? 'Temporary communications facilities may be allowed only under specific conditions.' : 'No temporary tower rule was extracted.',
      source_ref: sourceRef,
      confidence: hasTemporary ? 'medium' : 'low',
    },
  ];
}

function municodeToOrdinanceMetadata(municodeData, sourceTrace) {
  const towerSpecs = municodeData?.towerSpecs || {};
  const rawSections = asArray(municodeData?.telecomSections);
  const ldcSections = asArray(towerSpecs.ldcSections).map(cleanString).filter(Boolean);

  const sections = rawSections.slice(0, 8).map(section => {
    const content = asArray(section.content);
    const firstContent = content[0] || {};
    const ref = firstSectionRefFromTitle(firstContent.title) || firstSectionRefFromTitle(section.heading);
    const contentTitles = content.map(item => cleanString(item.title)).filter(Boolean);
    const excerpt = content
      .map(item => `${cleanString(item.title)}: ${cleanString(item.excerpt)}`)
      .filter(Boolean)
      .join(' ');

    return {
      section_ref: ref || cleanString(section.nodeId),
      section_title: cleanString(section.heading || contentTitles[0]),
      topic: asArray(section.path).join(' > ') || 'Telecom tower and antenna zoning',
      clause_summary: truncate(excerpt || section.heading, 1200),
      source_url: section.sourceUrl || municodeData.libraryUrl || '',
      confidence: municodeData.confidence || 'medium',
    };
  });

  const sectionRefs = ldcSections.length ? ldcSections : uniqueStrings(sections.map(s => s.section_ref)).slice(0, 8);
  const sourceUrls = uniqueStrings([
    municodeData.libraryUrl,
    ...rawSections.map(section => section.sourceUrl),
  ]);
  const sourceRef = sectionSourceRef(sectionRefs, sections, municodeData.libraryUrl);
  const specCount = towerSpecValueCount(towerSpecs);
  const height = parseFeetNumber(towerSpecs.maxHeightFt);
  const status = specCount >= 3 ? 'verified' : 'partial';

  return {
    status,
    jurisdiction: municodeData.jurisdiction || '',
    state: municodeData.state || '',
    ordinance_title: `${municodeData.jurisdiction || 'Local'} Code of Ordinances`,
    source_urls: sourceUrls,
    ldc_display: sectionRefs.slice(0, 3).join(', '),
    section_ref: sectionRefs[0] || sections[0]?.section_ref || '',
    section_title: sections.map(s => s.section_title).filter(Boolean).join(' | '),
    telecom_sections: sections,
    max_tower_height_ft: height,
    permit_type: towerSpecs.buildingPermit || '',
    collocation_required: /^required/i.test(cleanString(towerSpecs.collocationRequired)),
    stealth_required: /^required/i.test(cleanString(towerSpecs.stealthRequired)),
    setback_summary: buildSetbackSummary(towerSpecs),
    compliance_summary: buildComplianceSummaryFromSpecs(towerSpecs, sections, sourceRef),
    extraction_notes: `Official Municode API match via SiteHawk Worker. Confidence: ${municodeData.confidence || 'unknown'}. Empty fields mean the Worker did not extract a reliable value from the ordinance text.`,
    selected_source: 'municode_api',
    data_source: 'municode_api',
    source_attribution: 'Municode Library API via SiteHawk municode-mcp Worker',
    source_confidence: municodeData.confidence || 'unknown',
    source_count: municodeData.sourceCount || rawSections.length,
    source_priority: SOURCE_PRIORITY.join(' > '),
    source_chain: sourceChainSummary(sourceTrace),
    retrieved_at: municodeData.retrievedAt || new Date().toISOString(),
    notion_context_used: false,
    notion_state_code: null,
    notion_folder_title: null,
    notion_pages: [],
    extracted_at: new Date().toISOString(),
    extracted_by: 'SiteHawk AI ordinance extraction',
  };
}

async function fetchZoneomicsData(lat, lon) {
  const key = Deno.env.get('ZONEOMICS_API_KEY') || Deno.env.get('ZONEOMICS_API_TOKEN') || Deno.env.get('ZONEOMICS_TOKEN');
  if (!key) {
    return {
      data: null,
      trace: { source: 'zoneomics_api', status: 'skipped', reason: 'missing ZONEOMICS_API_KEY' },
    };
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lon),
    output_fields: 'zoning,plu,controls,gde-controls,parcels',
    api_key: key,
  });

  const res = await fetchJsonWithTimeout(`${ZONEOMICS_API}?${params}`, {
    headers: {
      Accept: 'application/json',
      'X-API-Key': key,
    },
  }, 15000);

  if (res.ok && res.data) {
    return {
      data: res.data,
      trace: { source: 'zoneomics_api', status: 'hit', http_status: res.status },
    };
  }

  return {
    data: null,
    trace: {
      source: 'zoneomics_api',
      status: res.status === 404 ? 'miss' : 'error',
      http_status: res.status || null,
      reason: res.data?.message || res.data?.error || res.error || 'zoneDetail did not return zoning data',
    },
  };
}

async function notionRequest(path, accessToken) {
  const token = accessToken || Deno.env.get('NOTION_API_TOKEN');
  if (!token) return null;

  const res = await fetch(`${NOTION_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    },
  });

  if (!res.ok) {
    console.warn(`Notion request failed ${res.status}: ${path}`);
    return null;
  }

  return res.json();
}

async function getAllBlockChildren(blockId, accessToken) {
  const blocks = [];
  let cursor = null;

  do {
    const params = new URLSearchParams({ page_size: '100' });
    if (cursor) params.set('start_cursor', cursor);
    const data = await notionRequest(`/blocks/${blockId}/children?${params}`, accessToken);
    if (!data?.results) break;
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor && blocks.length < 800);

  return blocks;
}

async function findStateFolder(masterPageId, stateCode, accessToken) {
  if (!masterPageId || !stateCode) return null;
  const children = await getAllBlockChildren(masterPageId, accessToken);
  const normalizedState = normalizeTitle(stateCode);

  return children.find(block => {
    const title = block.child_page?.title || '';
    const normalized = normalizeTitle(title);
    return block.type === 'child_page' && (
      normalized === `${normalizedState}FOLDER` ||
      normalized.startsWith(`${normalizedState}FOLDER`) ||
      normalized.startsWith(normalizedState)
    );
  }) || null;
}

function blockToText(block) {
  const type = block.type;
  const value = block[type];
  if (!value) return '';

  if (type === 'child_page') return `# ${value.title}`;
  const text = richTextToPlain(value.rich_text);
  if (!text) return '';
  if (type.startsWith('heading_')) return `## ${text}`;
  return text;
}

async function collectNotionText(blockId, depth = 0, pageTitle = 'State Folder', accessToken = null) {
  if (depth > 3) return { text: '', pages: [] };

  const blocks = await getAllBlockChildren(blockId, accessToken);
  const lines = [];
  const pages = [{ id: blockId, title: pageTitle }];

  for (const block of blocks) {
    const line = blockToText(block);
    if (line) lines.push(line);

    if ((block.has_children || block.type === 'child_page') && lines.join('\n').length < MAX_NOTION_CHARS) {
      const childTitle = block.child_page?.title || line.replace(/^#+\s*/, '').slice(0, 80) || 'Nested Page';
      const child = await collectNotionText(block.id, depth + 1, childTitle, accessToken);
      if (child.text) lines.push(child.text);
      pages.push(...child.pages);
    }

    if (lines.join('\n').length >= MAX_NOTION_CHARS) break;
  }

  return {
    text: lines.join('\n').slice(0, MAX_NOTION_CHARS),
    pages,
  };
}

async function getNotionZoningContext(lat, lon, accessToken, stateCodeHint = null) {
  const masterPageId = Deno.env.get('NOTION_MASTER_ZONING_PAGE_ID');
  const stateCode = stateCodeHint || await getStateCode(lat, lon);
  const folder = await findStateFolder(masterPageId, stateCode, accessToken);

  const targetId = folder?.id || masterPageId;
  const targetTitle = folder?.child_page?.title || `${stateCode || 'State'}-Zoning`;
  if (!targetId) return { state_code: stateCode, found: false, text: '', pages: [] };

  const collected = await collectNotionText(targetId, 0, targetTitle, accessToken);
  const found = collected.text.length > 0;

  return {
    state_code: stateCode,
    found,
    folder_id: targetId,
    folder_title: targetTitle,
    text: collected.text,
    pages: collected.pages.slice(0, 25),
  };
}

async function getNotionAccessToken(base44) {
  try {
    const connection = await base44.asServiceRole.connectors.getConnection('notion');
    return connection?.accessToken || null;
  } catch (error) {
    console.warn(`Notion connection unavailable: ${error?.message || String(error)}`);
    return null;
  }
}

function pickFallbackSource(result, zoneomicsData, notionContext) {
  if (SOURCE_PRIORITY.includes(result?.source_stage)) return result.source_stage;
  if (zoneomicsData) return 'zoneomics_api';
  if (notionContext?.found) return 'notion_fallback';
  return 'llm_inferred';
}

function normalizeFallbackResult(result, sourceTrace, zoneomicsData, notionContext) {
  const sections = asArray(result.telecom_sections);
  const sourceUrls = asArray(result.source_urls).filter(Boolean);
  const complianceSummary = asArray(result.compliance_summary);
  const hasOfficialUrl = sections.some(s => s.source_url && !/^notion:/i.test(s.source_url)) ||
    sourceUrls.some(url => !/^notion:/i.test(url));
  const selectedSource = pickFallbackSource(result, zoneomicsData, notionContext);
  const hasFallbackContext = Boolean(zoneomicsData || notionContext?.found);

  return {
    ...result,
    status: hasOfficialUrl ? (result.status || 'partial') : hasFallbackContext ? (result.status || 'partial') : 'not_verified',
    telecom_sections: sections,
    compliance_summary: complianceSummary,
    source_urls: sourceUrls,
    selected_source: selectedSource,
    data_source: selectedSource,
    source_attribution: selectedSource === 'zoneomics_api'
      ? 'Zoneomics zoneDetail API plus SiteHawk AI extraction'
      : selectedSource === 'notion_fallback'
        ? 'Notion zoning knowledge base plus SiteHawk AI extraction'
        : 'SiteHawk AI public-source research/inference',
    source_priority: SOURCE_PRIORITY.join(' > '),
    source_chain: sourceChainSummary(sourceTrace),
    notion_context_used: notionContext?.found || false,
    notion_state_code: notionContext?.state_code || null,
    notion_folder_title: notionContext?.folder_title || null,
    notion_pages: notionContext?.pages || [],
    extracted_at: new Date().toISOString(),
    extracted_by: 'SiteHawk AI ordinance extraction',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, ordinance, candidates } = await req.json();
    if (lat === undefined || lat === null || lon === undefined || lon === null) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    const geoContext = await getGeoContext(lat, lon);
    const candidateContext = asArray(candidates).slice(0, 3).map((c, i) => ({
      rank: i + 1,
      parcel_address: c.parcel_address || null,
      zoning: c.zoning || c.zoning_classification || null,
      parcel_id: c.parcel_id || null,
      inferred_city: parseCityFromAddress(c.parcel_address || c.site_name, geoContext.state_code),
    }));

    const jurisdictionCandidates = buildJurisdictionCandidates(ordinance || {}, candidates || [], geoContext);
    const sourceTrace = [];

    const municode = await fetchMunicodeZoning(jurisdictionCandidates, geoContext.state_code);
    sourceTrace.push(...municode.trace);
    if (municode.data) {
      const normalized = municodeToOrdinanceMetadata(municode.data, sourceTrace);
      console.log(`Ordinance extraction ${normalized.status}: user=${user.email} source=municode_api jurisdiction=${normalized.jurisdiction || municode.jurisdiction || 'unknown'} sections=${normalized.telecom_sections.length}`);
      return Response.json({ ordinance_metadata: normalized });
    }

    const zoneomics = await fetchZoneomicsData(lat, lon);
    sourceTrace.push(zoneomics.trace);

    const accessToken = await getNotionAccessToken(base44);
    const notionContext = await getNotionZoningContext(lat, lon, accessToken, geoContext.state_code);
    sourceTrace.push({
      source: 'notion_fallback',
      status: notionContext.found ? 'hit' : 'miss',
      reason: notionContext.found ? notionContext.folder_title : 'no Notion zoning context found',
    });

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      add_context_from_internet: true,
      prompt: `You are a municipal zoning research analyst for telecom site acquisition.

Task: identify the local municipal/county zoning ordinance sections that govern wireless telecommunications facilities, telecom towers, communication towers, antennas, small wireless facilities, wireless support structures, collocation, stealth/concealment, setbacks, height, special use permits, conditional use permits, and related approvals for the location below. Generate a simplified user-facing Compliance Summary table that highlights which tower types are permitted, prohibited, conditional, or not addressed.

Coordinates: ${lat}, ${lon}
FCC coordinate context: ${JSON.stringify(geoContext)}
Jurisdiction candidates already tried against Municode: ${JSON.stringify(jurisdictionCandidates)}
Existing scan ordinance context: ${JSON.stringify(ordinance || {})}
Candidate parcel context: ${JSON.stringify(candidateContext)}
Source trace so far: ${JSON.stringify(sourceTrace)}
Zoneomics zoneDetail API context: ${JSON.stringify({ found: Boolean(zoneomics.data), data: zoneomics.data || null }).slice(0, 30000)}
Notion zoning knowledge base context for state ${notionContext.state_code || 'unknown'}: ${JSON.stringify({ found: notionContext.found, folder_title: notionContext.folder_title, pages: notionContext.pages, text: notionContext.text })}

Source priority and attribution rules:
- Municode was already attempted first through the SiteHawk Worker. Since it did not return a verified payload, do not claim Municode support unless you independently find an exact Municode source URL.
- If Zoneomics context is present, use it before Notion and set source_stage='zoneomics_api' for facts grounded in that API.
- Use Notion only as a fallback. Set source_stage='notion_fallback' when official public sources are not available and Notion is the best supporting source.
- Use internet/public-source research or model inference only as the final fallback. Set source_stage='llm_inferred' unless every key clause has an official public source URL.
- Do not invent section numbers, clause text, URLs, jurisdiction names, permit requirements, setbacks, or height limits.
- If a clause is supported only by Notion without an official public source URL, mark confidence as low or medium and set source_url to 'Notion: <page title>'.
- If the relevant ordinance cannot be verified from public, Zoneomics, or Notion context, return status='not_verified' and explain what is missing.
- For each clause, include the exact source URL when available, or the Notion page title when Notion is the only source.
- Focus specifically on telecom tower and antenna zoning sections, not generic parcel zoning.
- For compliance_summary, use plain language for non-lawyers and include common tower types such as macro tower, monopole, lattice tower, guyed tower, rooftop antenna, small wireless facility, collocation, concealed/stealth facility, and temporary tower when addressed.
- Mark a tower type as prohibited only when the ordinance clearly prohibits it; otherwise use conditional or not_addressed.
- Every compliance_summary row must cite a section_ref or source_ref from the ordinance, Zoneomics context, Notion context, or official public source.`,
      response_json_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['verified', 'partial', 'not_verified'] },
          source_stage: { type: 'string', enum: ['zoneomics_api', 'notion_fallback', 'llm_inferred'] },
          jurisdiction: { type: 'string' },
          ordinance_title: { type: 'string' },
          source_urls: { type: 'array', items: { type: 'string' } },
          ldc_display: { type: 'string' },
          section_ref: { type: 'string' },
          section_title: { type: 'string' },
          telecom_sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                section_ref: { type: 'string' },
                section_title: { type: 'string' },
                topic: { type: 'string' },
                clause_summary: { type: 'string' },
                source_url: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              },
            },
          },
          max_tower_height_ft: { type: 'number' },
          permit_type: { type: 'string' },
          collocation_required: { type: 'boolean' },
          stealth_required: { type: 'boolean' },
          setback_summary: { type: 'string' },
          compliance_summary: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tower_type: { type: 'string' },
                status: { type: 'string', enum: ['permitted', 'prohibited', 'conditional', 'not_addressed'] },
                zones_or_context: { type: 'string' },
                permit_path: { type: 'string' },
                key_limits: { type: 'string' },
                user_summary: { type: 'string' },
                source_ref: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              },
            },
          },
          extraction_notes: { type: 'string' },
        },
      },
    });

    sourceTrace.push({ source: 'llm_inferred', status: result?.status || 'partial' });
    const normalized = normalizeFallbackResult(result || {}, sourceTrace, zoneomics.data, notionContext);

    console.log(`Ordinance extraction ${normalized.status}: user=${user.email} source=${normalized.selected_source} jurisdiction=${normalized.jurisdiction || 'unknown'} sections=${normalized.telecom_sections.length} notion=${notionContext.found ? notionContext.folder_title : 'not_found'}`);
    return Response.json({ ordinance_metadata: normalized });
  } catch (error) {
    console.error('extractTelecomOrdinance error:', error?.message || String(error));
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});