import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Explore Notion workspace: find a page/folder by title and list its children.
// Payload: { query?: string, parent_id?: string }
//   - If parent_id given → list direct children of that page.
//   - Else → search by query (default "FL-Zoning") and return matches + children of the top match.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('notion');
    const body = await req.json().catch(() => ({}));
    const query = body.query || 'FL-Zoning';
    const parentId = body.parent_id;

    const notionHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };

    // Helper: extract title from a Notion page/db object
    const getTitle = (obj) => {
      if (!obj) return '';
      if (obj.object === 'database') {
        return (obj.title || []).map(t => t.plain_text).join('') || '(untitled database)';
      }
      // page
      const props = obj.properties || {};
      for (const key of Object.keys(props)) {
        const p = props[key];
        if (p?.type === 'title') return (p.title || []).map(t => t.plain_text).join('') || '(untitled)';
      }
      return '(untitled)';
    };

    // Helper: list children blocks of a page (returns child_page / child_database refs)
    const listChildren = async (id) => {
      const url = `https://api.notion.com/v1/blocks/${id}/children?page_size=100`;
      const r = await fetch(url, { headers: notionHeaders });
      const j = await r.json();
      if (!r.ok) return { error: j };
      const children = [];
      for (const blk of j.results || []) {
        if (blk.type === 'child_page') {
          children.push({ id: blk.id, type: 'page', title: blk.child_page.title });
        } else if (blk.type === 'child_database') {
          children.push({ id: blk.id, type: 'database', title: blk.child_database.title });
        }
      }
      return { children };
    };

    // Mode 1: caller passed a parent_id → just list its children
    if (parentId) {
      const result = await listChildren(parentId);
      return Response.json({ parent_id: parentId, ...result });
    }

    // Mode 2: search by query
    const searchRes = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify({ query, page_size: 25 }),
    });
    const searchJson = await searchRes.json();
    if (!searchRes.ok) {
      return Response.json({ error: 'Notion search failed', detail: searchJson }, { status: 500 });
    }

    const matches = (searchJson.results || []).map(r => ({
      id: r.id,
      object: r.object,
      title: getTitle(r),
      url: r.url,
      parent: r.parent,
    }));

    // Find best match: exact title match preferred
    const best = matches.find(m => m.title.toLowerCase() === query.toLowerCase()) || matches[0];

    let childrenResult = null;
    if (best) {
      childrenResult = await listChildren(best.id);
    }

    return Response.json({
      query,
      match_count: matches.length,
      matches,
      best_match: best,
      children: childrenResult,
    });
  } catch (error) {
    console.error('notionExploreZoning error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});