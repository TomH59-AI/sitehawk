/**
 * zoneResolve — proxy to the zone-resolve Supabase edge function
 * (project vkiwvctpxhbsoeagivnl). Returns the ArcGIS county zoning polygon,
 * FLU (UF GeoPlan), and telecom_ordinances rules for a {lat, lon}.
 *
 * zone-resolve enforces verify_jwt, so we authenticate server-side with that
 * project's anon key (ZONE_RESOLVE_ANON_KEY) — NOT SUPABASE_ANON_KEY /
 * HAWK_SUPABASE_ANON_KEY, which belong to a different project and would 401.
 *
 * Used by Section 4 Map 4 (Zoning polygon) and Map 5 (FLUM / flu). Replaces the
 * banned Zoneomics functions entirely.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ZONE_RESOLVE_URL = 'https://vkiwvctpxhbsoeagivnl.supabase.co/functions/v1/zone-resolve';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }

    const anonKey = Deno.env.get('ZONE_RESOLVE_ANON_KEY');
    if (!anonKey) {
      return Response.json({ error: 'ZONE_RESOLVE_ANON_KEY not set' }, { status: 500 });
    }

    const res = await fetch(ZONE_RESOLVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ lat: Number(lat), lon: Number(lon) }),
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }

    if (!res.ok) {
      console.error('zoneResolve upstream error:', res.status, text?.slice(0, 500));
      return Response.json({ error: `zone-resolve HTTP ${res.status}`, detail: text?.slice(0, 500) }, { status: 502 });
    }

    console.log('zoneResolve ok:', JSON.stringify({
      lat, lon,
      has_polygon: !!(data?.zoning_polygon || data?.zoning),
      has_flu: !!(data?.flu),
      keys: data ? Object.keys(data) : [],
    }));

    // Normalize the fields the maps consume. zone-resolve keys (verified for FL):
    //   data.flu   → { code, label, field_used, geojson: <Polygon Feature> }  (live)
    //   data.zoning→ zoning object/geojson when a zoning ArcGIS layer covers the
    //                point; currently null even in FL (no zoning_source).
    //   data.rules → telecom_ordinances registry match (null when registry_hit false)
    const zoning = data?.zoning && Object.keys(data.zoning || {}).length ? data.zoning : null;
    const zoning_polygon = zoning?.geojson ?? zoning?.polygon ?? zoning ?? null;
    const flu = data?.flu && data.flu.geojson ? data.flu : null;

    return Response.json({
      jurisdiction: data?.jurisdiction ?? null,
      county: data?.county ?? null,
      state: data?.state ?? null,
      zoning_polygon,
      flu,
      flu_polygon: flu?.geojson ?? null,
      telecom_ordinances: data?.rules ?? null,
      meta: data?.meta ?? null,
    });
  } catch (error) {
    console.error('zoneResolve error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});