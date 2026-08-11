/**
 * notionAccessCheck — diagnostic: lists every page/database the Notion OAuth
 * integration can currently see, so we can confirm "On-Air HQ" team space is
 * connected.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const conn = await base44.asServiceRole.connectors.getConnection('notion');
    const token = conn?.accessToken;
    if (!token) {
      return Response.json({ connected: false, error: 'No Notion accessToken from connector' }, { status: 400 });
    }

    // Whoami
    const meRes = await fetch(`${NOTION_API}/users/me`, {
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
    });
    const me = meRes.ok ? await meRes.json() : { error: await meRes.text() };

    // List everything the integration has been added to (pages + databases)
    const accessible = [];
    let cursor = null;
    let pages = 0;
    do {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const r = await fetch(`${NOTION_API}/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const txt = await r.text();
        return Response.json({ connected: true, me, error: `search failed: ${r.status} ${txt}` }, { status: 500 });
      }
      const d = await r.json();
      for (const item of (d.results || [])) {
        let title = '(untitled)';
        try {
          if (item.object === 'database' && Array.isArray(item.title)) {
            title = item.title.map(t => t?.plain_text || '').join('') || title;
          } else if (item.properties) {
            const titleProp = Object.values(item.properties).find(p => p?.type === 'title');
            if (titleProp && Array.isArray(titleProp.title)) {
              title = titleProp.title.map(t => t?.plain_text || '').join('') || title;
            }
          }
        } catch (_) { /* keep default */ }
        accessible.push({
          object: item.object,
          id: item.id,
          title,
          parent_type: item.parent?.type,
          url: item.url,
        });
      }
      cursor = d.has_more ? d.next_cursor : null;
      pages++;
    } while (cursor && pages < 10);

    // Look for the "On-Air HQ" workspace specifically
    const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const onAirMatches = accessible.filter(a => norm(a.title).includes('ONAIRHQ') || norm(a.title).includes('ONAIR'));

    // Look for state zoning folders
    const stateFolders = accessible.filter(a => /(-Zoning|\sZoning)$/i.test(a.title));

    // Confirm the configured master Zoning Folder page and list its state folders.
    const rawMaster = Deno.env.get('NOTION_MASTER_ZONING_PAGE_ID') || '';
    const hex = (rawMaster.replace(/-/g, '').match(/[0-9a-f]{32}/i) || [])[0] || null;
    const masterId = hex
      ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      : null;
    let master = { configured: !!masterId, id: masterId, accessible: false, title: null, child_pages: [] };
    if (masterId) {
      const pRes = await fetch(`${NOTION_API}/pages/${masterId}`, {
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
      });
      if (pRes.ok) {
        const p = await pRes.json();
        master.accessible = true;
        const tp = Object.values(p.properties || {}).find(x => x?.type === 'title');
        master.title = tp ? (tp.title || []).map(t => t.plain_text).join('') : null;
        const cRes = await fetch(`${NOTION_API}/blocks/${masterId}/children?page_size=100`, {
          headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
        });
        if (cRes.ok) {
          const c = await cRes.json();
          master.child_pages = (c.results || []).filter(b => b.type === 'child_page').map(b => b.child_page.title);
        }
      } else {
        master.error = `HTTP ${pRes.status}`;
      }
    }

    return Response.json({
      connected: true,
      master_zoning_page: master,
      bot_user: { id: me.id, name: me.name, type: me.type, owner: me.bot?.owner, workspace_name: me.bot?.workspace_name },
      total_accessible: accessible.length,
      on_air_hq_matches: onAirMatches,
      state_zoning_folders: stateFolders,
      all_accessible: accessible.slice(0, 100),
    });
  } catch (error) {
    console.error('notionAccessCheck error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});