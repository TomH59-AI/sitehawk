import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Test Zoneomics API to see what data is returned for a given lat/lng.
// Payload: { lat, lng, output_fields? }
//   output_fields options: "zoning", "plu", "plu-tags", "controls", "gde-controls", "parcels"

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ⛔ BANNED: Zoneomics paid Point API (api.zoneomics.com) disabled after a
    // billing incident. This endpoint no longer calls the paid API.
    return Response.json({ ok: false, disabled: true, error: 'Zoneomics paid API disabled (banned)' }, { status: 200 });

    // eslint-disable-next-line no-unreachable
    const apiKey = Deno.env.get('ZONEOMICS_API_KEY');
    if (!apiKey) return Response.json({ error: 'ZONEOMICS_API_KEY not set' }, { status: 500 });

    const { lat, lng, output_fields = 'zoning,plu,controls,parcels' } = await req.json();
    if (!lat || !lng) return Response.json({ error: 'lat and lng required' }, { status: 400 });

    const url = new URL('https://api.zoneomics.com/v2/zoneDetail');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    url.searchParams.set('output_fields', output_fields);

    const r = await fetch(url.toString());
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return Response.json({
      status: r.status,
      ok: r.ok,
      requested_fields: output_fields,
      data: json,
      // Summary of top-level keys for quick inspection
      top_level_keys: json && typeof json === 'object' ? Object.keys(json) : [],
    });
  } catch (error) {
    console.error('zoneomicsTest error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});