/**
 * sairPrecheck — S.A.I.R. Data Richness Gate.
 *
 * Checks Regrid parcel-schema coverage for a county BEFORE the SiteHawk
 * audit workflow spends Realie/OxyLabs API credits. Calls the
 * get_county_data_richness() RPC on the SkyWave Supabase project.
 *
 * Input:  { state, county, threshold? (default 70) }
 * Output: { found, proceed, richness_score, low_fields, message, pcts, ... }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { state, county, threshold = 70 } = await req.json();
    if (!state || !county) {
      return Response.json({ error: "state and county required" }, { status: 400 });
    }

    const base = Deno.env.get('HAWK_SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!base || !key) {
      return Response.json({ error: "Supabase env vars not configured" }, { status: 500 });
    }

    const url = `${base.replace(/\/$/, '')}/rest/v1/rpc/get_county_data_richness`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_state: state, p_county: county, p_threshold: threshold }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[sairPrecheck] RPC failed:", res.status, errText);
      return Response.json({ error: "richness lookup failed" }, { status: 502 });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    console.error("[sairPrecheck] error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});