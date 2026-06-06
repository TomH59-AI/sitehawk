/**
 * zoneomicsFlumDetails — Zoneomics /flumDetails point lookup. Returns the Future
 * Land Use (FLUM) designation at the SARF/Target A point so the Section 4 FLUM
 * map can show a banner of the actual land-use designation. Read-only.
 *
 * Payload: { lat, lng|lon }
 * Returns: { ok, http_status, flum: { code, name, type, description }, raw, error }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function clean(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s || s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return '';
  return s;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ⛔ BANNED: Zoneomics paid Point API (api.zoneomics.com / flumDetails) disabled
    // after a billing incident. FLUM is sourced from UF GeoPlan via zone-resolve.
    return Response.json({ ok: false, http_status: 0, disabled: true, flum: null, error: 'Zoneomics paid API disabled (banned)' }, { status: 200 });

    // eslint-disable-next-line no-unreachable
    const apiKey = Deno.env.get('ZONEOMICS_API_KEY');
    if (!apiKey) return Response.json({ ok: false, http_status: 500, error: 'ZONEOMICS_API_KEY not set' }, { status: 200 });

    const body = await req.json();
    const lat = body.lat;
    const lng = body.lng ?? body.lon;
    if (lat == null || lng == null) return Response.json({ error: 'lat and lng required' }, { status: 400 });

    const url = new URL('https://api.zoneomics.com/v2/flumDetails');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    const redacted = url.toString().replace(apiKey, '***');

    let r, text;
    try {
      r = await fetch(url.toString());
      text = await r.text();
    } catch (e) {
      console.log(`[FLUM DIAG] url=${redacted} status=network_error err=${e?.message}`);
      return Response.json({ ok: false, http_status: 0, error: `network: ${e?.message}` }, { status: 200 });
    }

    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!r.ok) {
      console.log(`[FLUM DIAG] url=${redacted} status=${r.status}`);
      return Response.json({
        ok: false,
        http_status: r.status,
        error: r.status === 401 || r.status === 403
          ? 'Zoneomics FLUM auth failed (401/403) — check ZONEOMICS_API_KEY / FLUM tier.'
          : `Zoneomics FLUM HTTP ${r.status}`,
      }, { status: 200 });
    }

    // Shape varies — dig for the FLUM detail block.
    const root = json?.data?.data || json?.data || json;
    const d = root?.flum_details || root?.flum || root?.future_land_use || root || {};
    const flum = {
      code: clean(d.flum_code || d.code || d.future_land_use_code),
      name: clean(d.flum_name || d.name || d.future_land_use || d.future_land_use_name),
      type: clean(d.flum_type || d.type),
      description: clean(d.description || d.flum_description),
    };

    console.log(`[FLUM DIAG] url=${redacted} status=${r.status} code=${flum.code || '—'} name=${flum.name || '—'}`);
    return Response.json({ ok: true, http_status: r.status, flum });
  } catch (error) {
    console.error('zoneomicsFlumDetails error:', error?.message || error);
    return Response.json({ ok: false, http_status: 500, error: error?.message || String(error) }, { status: 200 });
  }
});