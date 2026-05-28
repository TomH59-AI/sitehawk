import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Query a Notion database and return its pages with titles.
// Payload: { database_id: string, page_size?: number }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('notion');
    const { database_id, page_size = 100 } = await req.json();
    if (!database_id) return Response.json({ error: 'database_id required' }, { status: 400 });

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };

    // First try as database
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${database_id}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ page_size }),
    });
    const dbJson = await dbRes.json();

    if (dbRes.ok) {
      const getTitle = (page) => {
        const props = page.properties || {};
        for (const key of Object.keys(props)) {
          const p = props[key];
          if (p?.type === 'title') return (p.title || []).map(t => t.plain_text).join('') || '(untitled)';
        }
        return '(untitled)';
      };
      const pages = (dbJson.results || []).map(p => ({
        id: p.id,
        title: getTitle(p),
        url: p.url,
      }));
      return Response.json({ kind: 'database', count: pages.length, pages });
    }

    // Otherwise try retrieving as a page and check its metadata
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${database_id}`, { headers });
    const pageJson = await pageRes.json();
    return Response.json({ kind: 'page_or_unknown', db_error: dbJson, page_data: pageJson });
  } catch (error) {
    console.error('notionQueryDatabase error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});