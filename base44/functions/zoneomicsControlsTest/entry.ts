import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Pure inspection endpoint — calls Zoneomics with output_fields=controls and
// returns the RAW controls object untouched, plus a flat list of every key
// found under it. No normalization, no defaults, no fallback.
//
// Payload: { lat, lng, output_fields? }  (output_fields defaults to "controls")

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('ZONEOMICS_API_KEY');
    if (!apiKey) return Response.json({ error: 'ZONEOMICS_API_KEY not set' }, { status: 500 });

    const { lat, lng, output_fields = 'controls' } = await req.json();
    if (lat == null || lng == null) {
      return Response.json({ error: 'lat and lng required' }, { status: 400 });
    }

    const url = new URL('https://api.zoneomics.com/v2/zoneDetail');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    url.searchParams.set('output_fields', output_fields);

    const r = await fetch(url.toString());
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    // Try to surface the controls object regardless of where Zoneomics puts it.
    // Do NOT rename or transform anything inside it.
    const data = json?.data || json;
    const controls_raw =
      data?.controls ??
      data?.zone?.controls ??
      data?.zoning?.controls ??
      null;

    // Flat list of every key under controls (one level deep).
    const controls_keys = controls_raw && typeof controls_raw === 'object' && !Array.isArray(controls_raw)
      ? Object.keys(controls_raw)
      : [];

    // Best-effort zone code surface for labeling the result
    const zone =
      data?.zone?.zone_code ||
      data?.zoning?.code ||
      data?.zone_code ||
      data?.code ||
      null;

    return Response.json({
      zone,
      controls_raw,
      controls_keys,
      top_level_keys: json && typeof json === 'object' ? Object.keys(json) : [],
      data_keys: data && typeof data === 'object' ? Object.keys(data) : [],
      http_status: r.status,
      ok: r.ok,
      full_response: json,
      _meta: { lat, lng, duration_ms: Date.now() - t0, requested_fields: output_fields },
    });
  } catch (error) {
    console.error('zoneomicsControlsTest error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});