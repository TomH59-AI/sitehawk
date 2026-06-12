import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// HawkPerch residential separation check (HawkVision+).
// ONE Realie Location Search (residential=true) per CONFIRM — never per drag tick.
// Logged to api_call_ledger like every Realie call.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, separationFt } = await req.json();
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !separationFt) {
      return Response.json({ error: "lat, lon, separationFt required" }, { status: 400 });
    }

    const apiKey = Deno.env.get("REALIE_API_KEY");
    if (!apiKey) return Response.json({ error: "REALIE_API_KEY not configured" }, { status: 500 });

    const radiusMi = Math.min(separationFt / 5280, 2);
    const url = `https://app.realie.ai/api/public/property/location/?latitude=${lat}&longitude=${lon}&radius=${radiusMi}&residential=true&includeUnassignedAddress=false&limit=5`;
    const r = await fetch(url, { headers: { Authorization: apiKey } });

    // ledger (best-effort)
    try {
      const supaUrl = (Deno.env.get("HAWK_SUPABASE_URL") || "").replace(/^[\\'"\s]+/, "").replace(/\/+$/, "");
      const key = Deno.env.get("HAWK_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supaUrl && key) {
        await fetch(`${supaUrl}/rest/v1/api_call_ledger`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=minimal" },
          body: JSON.stringify({
            provider: "realie", endpoint: "public/property/location",
            params: { lat, lon, radius: radiusMi, residential: true },
            status_code: r.status, user_email: user.email, source: "tower_siter_residential",
          }),
        });
      }
    } catch (e) { console.error("ledger log failed:", e.message); }

    if (r.status === 404) return Response.json({ properties: [] });
    if (!r.ok) return Response.json({ error: `Realie HTTP ${r.status}` }, { status: 502 });

    const data = await r.json();
    const props = (data.properties || []).map((p) => ({ address: p.addressFull || p.address || null }));
    return Response.json({ properties: props });
  } catch (error) {
    console.error("towerSiterResidential error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});