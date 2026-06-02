/**
 * notionSyncSnapshot — OPTIONAL, NON-BLOCKING Notion audit mirror for a
 * DataSourceSnapshot. Base44 stays the source of truth; Notion is only a
 * human-readable review layer.
 *
 * Behavior:
 *  - Reads the snapshot + its ScipRecord. If record.notion_snapshot_sync is
 *    off → mark snapshot notion_sync_status='skipped' and return (no Notion).
 *  - Ensures a Notion audit database exists (id cached in AppSetting
 *    'notion_snapshot_db_id'); creates it under NOTION_MASTER_ZONING_PAGE_ID
 *    or the first accessible page if missing.
 *  - Creates a new row (or updates the existing notion_page_id) with a
 *    SANITIZED summary: scip id, snapshot id, target, section, source/provider,
 *    stale status, fetched/expires, confidence, summary, key normalized values,
 *    link back to ScipDetail, source_url. NEVER secrets, keys, payment data, or
 *    raw_response.
 *  - On ANY failure, mark notion_sync_status='failed' + notion_sync_error and
 *    return 200 (success:false). It must never block SCIP generation.
 *
 * Payload: { snapshot_id: string, app_origin?: string }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DB_SETTING_KEY = 'notion_snapshot_db_id';

const SECTION_LABELS = {
  parcel_owner: 'Parcel / Owner', zoning: 'Zoning / Ordinance', rf_analysis: 'RF Analysis',
  airport: 'Airport', cell_tower: 'Cell Tower', coverage_viewshed: 'Coverage / Viewshed',
  utility_infrastructure: 'Utility Infrastructure', fiber: 'Fiber', electric_power: 'Electric / Power',
  postcard_address_verification: 'Address Verification', scorecard: 'Scorecard',
};
const TARGET_LABELS = ['Target A', 'Target B', 'Target C'];

function rt(text) { return [{ type: 'text', text: { content: String(text ?? '').slice(0, 1900) } }]; }

// Keys we will NEVER mirror to Notion (defense in depth — raw_response is also excluded entirely).
const BLOCKED_KEY = /(secret|token|api[_-]?key|password|authorization|stripe|card|cvv|payment|charge|raw_response)/i;

// Build a short, safe "key normalized values" string from normalized_result.
function keyValues(normalized) {
  if (!normalized || typeof normalized !== 'object') return '';
  const parts = [];
  for (const [k, v] of Object.entries(normalized)) {
    if (BLOCKED_KEY.test(k)) continue;
    if (v == null || typeof v === 'object') continue; // skip nested objects/arrays for the row summary
    const sv = String(v);
    if (sv.length > 120) continue;
    parts.push(`${k}: ${sv}`);
    if (parts.length >= 8) break;
  }
  return parts.join(' · ').slice(0, 1900);
}

async function notionFetch(token, path, method, body) {
  const r = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || `Notion HTTP ${r.status}`);
  return data;
}

// Find a parent page the integration can write under.
async function findParentPageId(token) {
  const search = await notionFetch(token, '/search', 'POST', { filter: { value: 'page', property: 'object' }, page_size: 5 });
  const page = (search.results || []).find((x) => x.object === 'page');
  return page?.id || null;
}

// Ensure the audit database exists; cache its id in AppSetting.
async function ensureDatabase(base44, token, user) {
  const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: DB_SETTING_KEY, created_by: user.email }).catch(() => []);
  if (existing.length && existing[0].value) {
    // Verify it still exists; if not, fall through to recreate.
    try { await notionFetch(token, `/databases/${existing[0].value}`, 'GET'); return { id: existing[0].value, setting: existing[0] }; }
    catch { /* recreate below */ }
  }
  const parentId = await findParentPageId(token);
  if (!parentId) throw new Error('No Notion page accessible to create the audit database');
  const db = await notionFetch(token, '/databases', 'POST', {
    parent: { type: 'page_id', page_id: parentId },
    title: rt('SiteHawk — SCIP Data Source Audit'),
    properties: {
      'Snapshot': { title: {} },
      'SCIP Record': { rich_text: {} },
      'Snapshot ID': { rich_text: {} },
      'Target': { select: { options: TARGET_LABELS.map((n) => ({ name: n })) } },
      'Section': { select: { options: Object.values(SECTION_LABELS).map((n) => ({ name: n })) } },
      'Source': { rich_text: {} },
      'Provider': { rich_text: {} },
      'Status': { select: { options: [
        { name: 'fresh', color: 'green' }, { name: 'aging', color: 'yellow' },
        { name: 'stale', color: 'red' }, { name: 'failed', color: 'gray' },
      ] } },
      'Confidence': { select: { options: [{ name: 'high', color: 'green' }, { name: 'medium', color: 'yellow' }, { name: 'low', color: 'orange' }] } },
      'Fetched At': { date: {} },
      'Expires At': { date: {} },
      'Summary': { rich_text: {} },
      'Key Values': { rich_text: {} },
      'Source URL': { url: {} },
      'SCIP Link': { url: {} },
      'Reviewer Notes': { rich_text: {} },
      'QA Checked': { checkbox: {} },
    },
  });
  // Persist the new db id.
  if (existing.length) {
    const setting = await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value: db.id });
    return { id: db.id, setting };
  }
  const setting = await base44.asServiceRole.entities.AppSetting.create({ key: DB_SETTING_KEY, value: db.id });
  return { id: db.id, setting };
}

function buildProps(snap, record, dbId, appOrigin) {
  const targetLabel = TARGET_LABELS[snap.target_index || 0] || `Target ${(snap.target_index || 0) + 1}`;
  const sectionLabel = SECTION_LABELS[snap.section_key] || snap.section_key;
  const scipLink = appOrigin ? `${appOrigin.replace(/\/$/, '')}/scip/${snap.scip_record_id}` : null;
  const props = {
    'Snapshot': { title: rt(`${record?.site_name || 'SCIP'} · ${sectionLabel} · ${targetLabel}`) },
    'SCIP Record': { rich_text: rt(record?.site_name || snap.scip_record_id) },
    'Snapshot ID': { rich_text: rt(snap.id) },
    'Target': { select: { name: targetLabel } },
    'Section': { select: { name: sectionLabel } },
    'Source': { rich_text: rt(snap.source_name || '') },
    'Provider': { rich_text: rt(snap.provider || '') },
    'Status': { select: { name: snap.stale_status || 'fresh' } },
    'Confidence': { select: { name: snap.confidence || 'medium' } },
    'Summary': { rich_text: rt(snap.summary || (snap.error_message ? `Refresh failed: ${snap.error_message}` : '')) },
    'Key Values': { rich_text: rt(keyValues(snap.normalized_result)) },
  };
  if (snap.fetched_at) props['Fetched At'] = { date: { start: snap.fetched_at } };
  if (snap.expires_at) props['Expires At'] = { date: { start: snap.expires_at } };
  if (snap.source_url && /^https?:\/\//i.test(snap.source_url)) props['Source URL'] = { url: snap.source_url };
  if (scipLink) props['SCIP Link'] = { url: scipLink };
  return props;
}

Deno.serve(async (req) => {
  let base44, snap;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { snapshot_id, app_origin } = await req.json();
    if (!snapshot_id) return Response.json({ error: 'snapshot_id is required' }, { status: 400 });

    snap = await base44.entities.DataSourceSnapshot.get(snapshot_id);
    if (!snap) return Response.json({ error: 'Snapshot not found' }, { status: 404 });

    const record = await base44.entities.ScipRecord.get(snap.scip_record_id).catch(() => null);

    // Toggle off → skip cleanly, never touch Notion.
    if (!record?.notion_snapshot_sync) {
      await base44.entities.DataSourceSnapshot.update(snap.id, { notion_sync_status: 'skipped' });
      return Response.json({ success: true, synced: false, reason: 'toggle_off' });
    }

    const conn = await base44.asServiceRole.connectors.getConnection('notion');
    const token = conn?.accessToken;
    if (!token) throw new Error('Notion not connected');

    const { id: dbId } = await ensureDatabase(base44, token, user);
    const props = buildProps(snap, record, dbId, app_origin);

    let pageId = snap.notion_page_id;
    if (pageId) {
      try { await notionFetch(token, `/pages/${pageId}`, 'PATCH', { properties: props }); }
      catch { pageId = null; } // page gone → recreate
    }
    if (!pageId) {
      const page = await notionFetch(token, '/pages', 'POST', { parent: { database_id: dbId }, properties: props });
      pageId = page.id;
    }

    await base44.entities.DataSourceSnapshot.update(snap.id, {
      notion_sync_status: 'synced',
      notion_page_id: pageId,
      notion_synced_at: new Date().toISOString(),
      notion_sync_error: '',
    });
    return Response.json({ success: true, synced: true, notion_page_id: pageId });
  } catch (error) {
    console.error('notionSyncSnapshot error:', error.message);
    // NON-BLOCKING: record the failure on the snapshot, return 200 so callers
    // (fire-and-forget) never break SCIP generation.
    try {
      if (base44 && snap) {
        await base44.entities.DataSourceSnapshot.update(snap.id, {
          notion_sync_status: 'failed',
          notion_sync_error: String(error.message).slice(0, 400),
        });
      }
    } catch (_) { /* ignore */ }
    return Response.json({ success: false, synced: false, error: error.message });
  }
});