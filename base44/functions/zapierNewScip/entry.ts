// zapierNewScip — fires the "New SCIP generated" event to Zapier.
// Posts a JSON payload (agent, site, coordinates, submittal date, SCIP file
// link) to the user's Zapier Catch Hook. Called two ways:
//   1. Frontend invoke right after a pipeline SCIP is generated (direct fields).
//   2. Entity automation on ScipRecord create (event/data payload shape).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const ZAPIER_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/16913860/445ssew/';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const authed = await base44.auth.isAuthenticated();
    if (!authed) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    // Automation shape: { event: {...}, data: <ScipRecord> }. Direct shape: flat fields.
    const d = body?.event && body?.data ? body.data : body;

    const lat = d.latitude ?? null;
    const lon = d.longitude ?? null;
    const payload = {
      event: 'new_scip_generated',
      agent_name: d.agent_name || '',
      agent_email: d.agent_email || '',
      site_name: d.site_name || '',
      latitude: lat,
      longitude: lon,
      coordinates: lat != null && lon != null ? `${lat}, ${lon}` : '',
      submittal_date: d.submittal_date || d.generated_at || new Date().toISOString().slice(0, 10),
      scip_file_url: d.scip_file_url || d.map_image_url || '',
      county: d.county || '',
      state: d.state || '',
      source: body?.event ? 'scip_record_created' : 'pipeline_scip_generated',
      sent_at: new Date().toISOString(),
    };

    const res = await fetch(ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('Zapier webhook failed:', res.status, text.slice(0, 300));
      return Response.json({ error: `Zapier webhook HTTP ${res.status}` }, { status: 502 });
    }
    console.log('Zapier webhook delivered:', payload.site_name, res.status);
    return Response.json({ ok: true, zapier_status: res.status });
  } catch (error) {
    console.error('zapierNewScip error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});