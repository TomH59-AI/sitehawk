import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MAX_NOTION_CHARS = 12000;

async function getStateCode(lat, lon) {
  const res = await fetch(`https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`);
  const data = await res.json();
  return data?.State?.code || null;
}

function normalizeTitle(title = '') {
  return title.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function richTextToPlain(richText = []) {
  return richText.map(t => t?.plain_text || '').join('').trim();
}

async function notionRequest(path) {
  const token = Deno.env.get('NOTION_API_TOKEN');
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

async function getAllBlockChildren(blockId) {
  const blocks = [];
  let cursor = null;

  do {
    const params = new URLSearchParams({ page_size: '100' });
    if (cursor) params.set('start_cursor', cursor);
    const data = await notionRequest(`/blocks/${blockId}/children?${params}`);
    if (!data?.results) break;
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor && blocks.length < 300);

  return blocks;
}

async function findStateFolder(masterPageId, stateCode) {
  if (!masterPageId || !stateCode) return null;
  const children = await getAllBlockChildren(masterPageId);
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

async function collectNotionText(blockId, depth = 0, pageTitle = 'State Folder') {
  if (depth > 3) return { text: '', pages: [] };

  const blocks = await getAllBlockChildren(blockId);
  const lines = [];
  const pages = [{ id: blockId, title: pageTitle }];

  for (const block of blocks) {
    const line = blockToText(block);
    if (line) lines.push(line);

    if ((block.has_children || block.type === 'child_page') && lines.join('\n').length < MAX_NOTION_CHARS) {
      const childTitle = block.child_page?.title || line.replace(/^#+\s*/, '').slice(0, 80) || 'Nested Page';
      const child = await collectNotionText(block.id, depth + 1, childTitle);
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

async function getNotionZoningContext(lat, lon) {
  const masterPageId = Deno.env.get('NOTION_MASTER_ZONING_PAGE_ID');
  const stateCode = await getStateCode(lat, lon);
  const folder = await findStateFolder(masterPageId, stateCode);

  const targetId = folder?.id || masterPageId;
  const targetTitle = folder?.child_page?.title || `${stateCode || 'State'}-Zoning`;
  if (!targetId) return { state_code: stateCode, found: false, text: '', pages: [] };

  const collected = await collectNotionText(targetId, 0, targetTitle);
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, ordinance, candidates } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon are required' }, { status: 400 });

    const candidateContext = (candidates || []).slice(0, 3).map((c, i) => ({
      rank: i + 1,
      parcel_address: c.parcel_address || null,
      zoning: c.zoning || c.zoning_classification || null,
      parcel_id: c.parcel_id || null,
    }));

    const notionContext = await getNotionZoningContext(lat, lon);

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'gemini_3_flash',
      add_context_from_internet: true,
      prompt: `You are a municipal zoning research analyst for telecom site acquisition.\n\nTask: identify the local municipal/county zoning ordinance sections that govern wireless telecommunications facilities, telecom towers, communication towers, antennas, small wireless facilities, wireless support structures, collocation, stealth/concealment, setbacks, height, special use permits, conditional use permits, and related approvals for the location below.\n\nCoordinates: ${lat}, ${lon}\nExisting scan ordinance context: ${JSON.stringify(ordinance || {})}\nCandidate parcel context: ${JSON.stringify(candidateContext)}\nNotion zoning knowledge base context for state ${notionContext.state_code || 'unknown'}: ${JSON.stringify({ found: notionContext.found, folder_title: notionContext.folder_title, pages: notionContext.pages, text: notionContext.text })}\n\nCritical accuracy rules:\n- First use current public sources you can find on the internet, preferably official municipal/county ordinance/code library URLs.\n- Use the Notion zoning knowledge base as a secondary/default fallback when official search context is missing or to guide which sections to verify.\n- Do not invent section numbers, clause text, URLs, jurisdiction names, permit requirements, or height limits.\n- If a clause is supported only by Notion without an official public source URL, mark confidence as low or medium and set source_url to 'Notion: <page title>'.\n- If the relevant ordinance cannot be verified from public or Notion context, return status='not_verified' and explain what is missing.\n- For each clause, include the exact source URL when available, or the Notion page title when Notion is the only source.\n- Focus specifically on telecom tower and antenna zoning sections, not generic parcel zoning.`,
      response_json_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['verified', 'partial', 'not_verified'] },
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
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
              }
            }
          },
          height_limit_ft: { type: 'number' },
          permit_type: { type: 'string' },
          collocation_required: { type: 'boolean' },
          stealth_required: { type: 'boolean' },
          setback_summary: { type: 'string' },
          extraction_notes: { type: 'string' }
        }
      }
    });

    const sections = Array.isArray(result.telecom_sections) ? result.telecom_sections : [];
    const sourceUrls = Array.isArray(result.source_urls) ? result.source_urls : [];
    const hasVerifiedSource = sections.some(s => s.source_url) || sourceUrls.length > 0;

    const normalized = {
      ...result,
      status: hasVerifiedSource ? (result.status || 'partial') : 'not_verified',
      telecom_sections: sections,
      source_urls: sourceUrls,
      notion_context_used: notionContext.found,
      notion_state_code: notionContext.state_code,
      notion_folder_title: notionContext.folder_title || null,
      notion_pages: notionContext.pages || [],
      extracted_at: new Date().toISOString(),
      extracted_by: 'SiteHawk AI ordinance extraction',
    };

    console.log(`Ordinance extraction ${normalized.status}: user=${user.email} jurisdiction=${normalized.jurisdiction || 'unknown'} sections=${sections.length} notion=${notionContext.found ? notionContext.folder_title : 'not_found'}`);
    return Response.json({ ordinance_metadata: normalized });
  } catch (error) {
    console.error('extractTelecomOrdinance error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});