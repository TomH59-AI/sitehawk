// n8nOrdinanceScraper — kicks off the n8n ordinance-scraper workflow.
// Posts the jurisdiction context for a SCIP to the n8n PRODUCTION webhook
// (N8N_ORDINANCE_SCRAPER_WEBHOOK_URL — must be a /webhook/ URL, not /webhook-test/).
// Called by the "n8n — New SCIP Generated" workflow on ScipRecord create, or
// directly with flat fields.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const authed = await base44.auth.isAuthenticated();
    if (!authed) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const webhookUrl = secrets.get('N8N_ORDINANCE_SCRAPER_WEBHOOK_URL');
    if (!webhookUrl) {
      return Response.json({ error: 'N8N_ORDINANCE_SCRAPER_WEBHOOK_URL not configured' }, { status: 500 });
    }
    if (webhookUrl.includes('/webhook-test/')) {
      return Response.json(
        { error: 'N8N_ORDINANCE_SCRAPER_WEBHOOK_URL is a /webhook-test/ URL — use the production /webhook/ URL.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    // Workflow shape: { event: {...}, data: <ScipRecord> }. Direct shape: flat fields.
    const d = body?.event && body?.data ? body.data : body;

    const payload = {
      event: 'ordinance_scrape_requested',
      scip_record_id: d.id || '',
      site_name: d.site_name || '',
      // Coordinates pass through untouched — never rounded (compliance-critical).
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      county: d.county || '',
      state: d.state || '',
      zoning_jurisdiction: d.zoning_jurisdiction || '',
      requested_at: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('n8n ordinance scraper webhook failed:', res.status, text.slice(0, 300));
      return Response.json({ error: `n8n webhook HTTP ${res.status}` }, { status: 502 });
    }
    console.log('n8n ordinance scraper started:', payload.zoning_jurisdiction || payload.county, res.status);
    return Response.json({ ok: true, n8n_status: res.status });
  } catch (error) {
    console.error('n8nOrdinanceScraper error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}