/**
 * notionSaveOrdinance — archive an extracted telecom ordinance to the Notion
 * zoning knowledge base so it "comes up quick" on future lookups.
 *
 * POST { jurisdiction, state, summary, sections?, source_url?, section_ref? }
 *  - Parent resolution: NOTION_MASTER_ZONING_PAGE_ID env → state folder child
 *    page (e.g. "FL Folder") → master page itself. If the env var is missing,
 *    falls back to a Notion search for a page titled "Zoning".
 *  - Creates a child page "{jurisdiction}, {state} — Telecom Ordinance".
 *
 * Notion access via the app's Notion connector. Failures return a clear error;
 * the in-app TelecomOrdinance registry remains the source of truth.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function para(text: string) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: String(text).slice(0, 1900) } }] },
  };
}
function heading(text: string) {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: String(text).slice(0, 200) } }] },
  };
}

async function notionFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

// Find a child page of the master page whose title starts with the state code.
async function findStateFolder(masterId: string, state: string, token: string) {
  const res = await notionFetch(`/blocks/${masterId}/children?page_size=100`, token);
  if (!res.ok) return null;
  const st = String(state).toUpperCase();
  const hit = (res.data?.results || []).find((b: any) =>
    b.type === 'child_page' && String(b.child_page?.title || '').toUpperCase().replace(/[^A-Z0-9]/g, '').startsWith(st)
  );
  return hit?.id || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { jurisdiction, state, summary, sections, source_url, section_ref } = await req.json();
    if (!jurisdiction || !state) {
      return Response.json({ error: 'jurisdiction and state required' }, { status: 400 });
    }

    const connection = await base44.asServiceRole.connectors.getConnection('notion');
    const token = connection?.accessToken;
    if (!token) return Response.json({ error: 'Notion is not connected' }, { status: 500 });

    // Resolve parent page
    let parentId: string | null = null;
    const masterId = Deno.env.get('NOTION_MASTER_ZONING_PAGE_ID');
    if (masterId) {
      parentId = (await findStateFolder(masterId, state, token)) || masterId;
    } else {
      const search = await notionFetch('/search', token, {
        method: 'POST',
        body: JSON.stringify({ query: 'Zoning', filter: { property: 'object', value: 'page' }, page_size: 1 }),
      });
      parentId = search.data?.results?.[0]?.id || null;
    }
    if (!parentId) {
      return Response.json({ error: 'No Notion destination page found — set NOTION_MASTER_ZONING_PAGE_ID or create a "Zoning" page shared with the integration.' }, { status: 500 });
    }

    const title = `${jurisdiction}, ${String(state).toUpperCase()} — Telecom Ordinance`;
    const children: any[] = [heading('Summary'), para(summary || 'No summary provided.')];
    if (section_ref) children.push(para(`Code section: ${section_ref}`));
    if (source_url) children.push(para(`Source: ${source_url}`));
    for (const s of (Array.isArray(sections) ? sections : []).slice(0, 15)) {
      children.push(heading(`${s.section_ref || ''} ${s.section_title || ''}`.trim() || 'Section'));
      children.push(para(s.clause_summary || s.summary || ''));
    }
    children.push(para(`Archived by SiteHawk Ordinance Hunter on ${new Date().toISOString().slice(0, 10)} by ${user.email}.`));

    const create = await notionFetch('/pages', token, {
      method: 'POST',
      body: JSON.stringify({
        parent: { page_id: parentId },
        properties: { title: { title: [{ type: 'text', text: { content: title.slice(0, 200) } }] } },
        children: children.slice(0, 90),
      }),
    });
    if (!create.ok) {
      console.error('notionSaveOrdinance create failed:', create.status, JSON.stringify(create.data)?.slice(0, 300));
      return Response.json({ error: `Notion page create failed (HTTP ${create.status})` }, { status: 502 });
    }

    console.log(`notionSaveOrdinance: saved "${title}" for ${user.email}`);
    return Response.json({ ok: true, page_id: create.data?.id, page_url: create.data?.url || null });
  } catch (error) {
    console.error('notionSaveOrdinance error:', error?.message || String(error));
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});