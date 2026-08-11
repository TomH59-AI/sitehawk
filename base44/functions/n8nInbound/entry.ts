// n8nInbound — the front door. n8n POSTs here to read SiteHawk SCIP data.
//
// URL:  https://site-hawk-pro.base44.app/functions/n8nInbound
// Auth: header  x-webhook-secret: <WEBHOOK_SECRET>   (shared secret, verified every call)
//
// Body:
//   { "action": "list_scips", "limit": 25 }
//   { "action": "get_scip", "id": "<ScipRecord id>" }
//
// Read-only by design — n8n cannot write SCIP records through this door.
import { createClient } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const expected = secrets.get('WEBHOOK_SECRET');
    if (!expected) {
      return Response.json({ error: 'WEBHOOK_SECRET not configured' }, { status: 500 });
    }
    const provided = req.headers.get('x-webhook-secret') || '';
    if (provided !== expected) {
      console.error('n8nInbound: bad or missing x-webhook-secret');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClient({ appId: secrets.get('BASE44_APP_ID') });
    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'list_scips';

    if (action === 'list_scips') {
      const limit = Math.min(Number(body?.limit) || 25, 100);
      const records = await base44.asServiceRole.entities.ScipRecord.list('-created_date', limit);
      return Response.json({
        ok: true,
        count: records.length,
        scips: records.map((r) => ({
          id: r.id,
          site_name: r.site_name,
          latitude: r.latitude,
          longitude: r.longitude,
          county: r.county,
          state: r.state,
          zoning_jurisdiction: r.zoning_jurisdiction,
          status: r.status,
          created_date: r.created_date,
        })),
      });
    }

    if (action === 'get_scip') {
      if (!body?.id) return Response.json({ error: 'id is required' }, { status: 400 });
      const record = await base44.asServiceRole.entities.ScipRecord.get(body.id);
      if (!record) return Response.json({ error: 'SCIP not found' }, { status: 404 });
      return Response.json({ ok: true, scip: record });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('n8nInbound error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}