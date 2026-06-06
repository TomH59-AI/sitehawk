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

    // Zoning polygon lives under one of several possible keys depending on the
    // jurisdiction's ArcGIS source — probe the common ones.
    const zoning_polygon =
      data?.zoning_polygon ?? data?.zoning ?? data?.zone ?? data?.zoning_geojson ??
      data?.zoning?.geojson ?? data?.zone?.geojson ?? null;

    // Diagnostic-only mode: return just the structure (no big geometry) so we can
    // see where the zoning polygon lives in the upstream payload.
    if (req.headers.get('x-debug-keys') === '1' || true) {
      const describe = (o) => {
        if (!o || typeof o !== 'object') return typeof o;
        const out = {};
        for (const k of Object.keys(o)) {
          const v = o[k];
          out[k] = Array.isArray(v) ? `array[${v.length}]` : (v && typeof v === 'object' ? Object.keys(v) : typeof v);
        }
        return out;
      };
      const zoningKeys = data?.zoning && typeof data.zoning === 'object' ? Object.keys(data.zoning) : null;
      const rulesKeys = data?.rules && typeof data.rules === 'object' ? Object.keys(data.rules) : null;
      const zoningSample = {};
      if (zoningKeys) for (const k of zoningKeys) {
        const v = data.zoning[k];
        zoningSample[k] = Array.isArray(v) ? `array[${v.length}]`
          : (v && typeof v === 'object' ? `object{${Object.keys(v).join(',')}}` : String(v).slice(0, 60));
      }
      return Response.json({ zoningKeys, zoningSample, rulesKeys });
    }

    // Pass the upstream payload through, normalizing the three fields the maps need.
    return Response.json({
      zoning_polygon,
      flu: data?.flu ?? null,
      telecom_ordinances: data?.telecom_ordinances ?? null,
    });
  } catch (error) {
    console.error('zoneResolve error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});