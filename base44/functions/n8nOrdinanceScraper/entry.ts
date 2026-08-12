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

    // The intake workflow's production webhook — used when the secret is
    // missing, malformed (e.g. a pasted NAME=VALUE line), or unreachable.
    const FALLBACK_WEBHOOK = 'https://sourcat.app.n8n.cloud/webhook/ordinance-scraper';

    // Secrets have historically contained paste errors (whole "NAME=https://..."
    // lines, stray quotes), so extract the first real URL rather than trusting
    // the raw value — a broken doorbell here silently kills every SCIP's
    // ordinance scrape.
    const rawSecret = String(secrets.get('N8N_ORDINANCE_SCRAPER_WEBHOOK_URL') || '');
    const extracted = (rawSecret.match(/https:\/\/[^\s'"]+/) || [])[0] || '';
    let webhookUrl = extracted && !extracted.includes('/webhook-test/') ? extracted : FALLBACK_WEBHOOK;

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

    let res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // The configured URL may point at the wrong (or deactivated) workflow —
    // e.g. a SCIP-notification webhook — so on any failure ring the known
    // production intake webhook before giving up.
    if (!res.ok && webhookUrl !== FALLBACK_WEBHOOK) {
      console.warn(`n8n webhook ${webhookUrl} returned HTTP ${res.status}; retrying fallback ${FALLBACK_WEBHOOK}`);
      webhookUrl = FALLBACK_WEBHOOK;
      res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    const text = await res.text();
    if (!res.ok) {
      console.error('n8n ordinance scraper webhook failed:', res.status, text.slice(0, 300));
      return Response.json({ error: `n8n webhook HTTP ${res.status}` }, { status: 502 });
    }
    console.log('n8n ordinance scraper started:', payload.zoning_jurisdiction || payload.county, res.status, 'via', webhookUrl);
    return Response.json({ ok: true, n8n_status: res.status, webhook_used: webhookUrl });
  } catch (error) {
    console.error('n8nOrdinanceScraper error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}