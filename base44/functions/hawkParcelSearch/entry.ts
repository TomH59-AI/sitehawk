import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/rest/v1/hawk_parcels";
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Reads parcel records from the Supabase hawk_parcels table.
// Accepts optional filters: state, county, parcel_id, owner_name, lat/lon bbox, limit.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      state,
      county,
      parcel_id,
      owner_name,
      lat_min, lat_max, lon_min, lon_max,
      limit,
    } = body || {};

    const params = new URLSearchParams({ select: "*" });
    if (state)      params.append("state", `eq.${state}`);
    if (county)     params.append("county", `ilike.*${county}*`);
    if (parcel_id)  params.append("parcel_id", `eq.${parcel_id}`);
    if (owner_name) params.append("owner_name", `ilike.*${owner_name}*`);
    if (lat_min != null) params.append("latitude", `gte.${lat_min}`);
    if (lat_max != null) params.append("latitude", `lte.${lat_max}`);
    if (lon_min != null) params.append("longitude", `gte.${lon_min}`);
    if (lon_max != null) params.append("longitude", `lte.${lon_max}`);

    const cap = Math.min(parseInt(limit) || 100, 500);
    params.append("limit", String(cap));

    const res = await fetch(`${SUPABASE_URL}?${params}`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`hawk_parcels fetch failed: HTTP ${res.status} ${text}`);
      return Response.json({ error: `Supabase error ${res.status}`, detail: text }, { status: 502 });
    }

    const records = await res.json();
    return Response.json({ count: records.length, records });

  } catch (error) {
    console.error('hawkParcelSearch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});