import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─────────────────────────────────────────────────────────────────────────────
// SkyHawk Intelligence — proxies to Supabase Edge Function `run-rf-analysis`.
//
// The Supabase function combines:
//   • Nearest airport (with line_geojson)
//   • Nearest FCC-registered tower (with line_geojson)
//   • CloudRF path/coverage verdict (strong / marginal / blocked / error)
//
// Service role key is used SERVER-SIDE ONLY here — never exposed to the browser.
// CloudRF API key stays inside the edge function — never sent to the client.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
const EDGE_FUNCTION = "run-rf-analysis";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, radius_miles = 5, heights_ft, force_refresh } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY not set");
      return Response.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const url = `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTION}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "x-supabase-service-role-key": serviceKey,
      },
      body: JSON.stringify({
        lat: Number(lat),
        lon: Number(lon),
        radius_miles: Number(radius_miles),
        ...(Array.isArray(heights_ft) ? { heights_ft } : {}),
        ...(force_refresh != null ? { force_refresh } : {}),
        base44_user_id: user.id,
      }),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`run-rf-analysis non-JSON HTTP ${res.status}: ${text.slice(0, 500)}`);
      return Response.json({ error: `RF analysis returned non-JSON: ${res.status}`, detail: text.slice(0, 300) }, { status: 502 });
    }

    // "No cell tower found" is a NORMAL business case, not an error. The upstream
    // edge function sometimes signals it with a 404. Normalize that to HTTP 200:
    // keep any airport data, set tower:null, and surface an rf.error verdict so
    // the airport map still renders and the UI shows a friendly tower message.
    if (res.status === 404 || (data && data.tower == null && (data.error || data.rf == null))) {
      const radiusLabel = Number(radius_miles);
      return Response.json({
        airport: data?.airport || null,
        tower: null,
        rf: {
          ...(data?.rf || {}),
          status: "error",
          verdict: data?.rf?.verdict || data?.error || `No cell tower found within ${radiusLabel} miles`,
        },
        cached: data?.cached === true,
      });
    }

    if (!res.ok && !data?.airport && !data?.tower && !data?.rf) {
      console.error(`run-rf-analysis HTTP ${res.status}: ${text.slice(0, 500)}`);
      return Response.json({ error: `RF analysis failed: ${res.status}`, detail: text.slice(0, 300) }, { status: 502 });
    }
    console.log(
      `[runRFAnalysis] user=${user.email} (${lat},${lon}) r=${radius_miles}mi → ` +
      `airport=${data?.airport?.call_letters || "—"} tower=${data?.tower?.call_letters || "—"} ` +
      `rf=${data?.rf?.status || "—"} cached=${data?.cached === true}`
    );

    return Response.json(data);
  } catch (error) {
    console.error('runRFAnalysis error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});