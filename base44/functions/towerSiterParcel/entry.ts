import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// HawkPerch Tier 1 — Realie boundary acquisition.
// Modes: apn (Parcel ID Lookup), address (Property Search), location (Location Search).
// Realie auth: raw key in Authorization header (NO "Bearer" prefix). Param is `lon`-style
// (Realie uses longitude/latitude query names). Every call is logged to api_call_ledger.

const REALIE_BASE = "https://app.realie.ai/api";

async function logLedger({ endpoint, params, status, userEmail }) {
  // Best-effort — ledger failures must never break a siting.
  try {
    const url = (Deno.env.get("HAWK_SUPABASE_URL") || "").replace(/^[\\'"\s]+/, "").replace(/\/+$/, "");
    const key = Deno.env.get("HAWK_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/api_call_ledger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        provider: "realie",
        endpoint,
        params,
        status_code: status,
        user_email: userEmail,
        source: "tower_siter",
      }),
    });
  } catch (e) {
    console.error("api_call_ledger log failed:", e.message);
  }
}

function normalize(p) {
  return {
    parcelId: p.parcelId || p.parcel_id || null,
    ownerName: p.ownerName || p.owner_name || null,
    addressFull: p.addressFull || p.address || null,
    city: p.city || null,
    county: p.county || null,
    state: p.state || null,
    acres: p.acres ?? null,
    zoningCode: p.zoningCode || null,
    legalDesc: p.legalDesc || p.legal_description || null,
    geometry: p.geometry || null,           // GeoJSON MultiPolygon
    location: p.location || null,           // GeoJSON Point
    // jurisdiction guess: incorporated city first, else county
    jurisdiction: p.city ? p.city : p.county ? p.county : null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = Deno.env.get("REALIE_API_KEY");
    if (!apiKey) return Response.json({ error: "REALIE_API_KEY not configured" }, { status: 500 });

    const body = await req.json();
    const { mode } = body;

    let url, endpoint, params;
    if (mode === "apn") {
      const { apn, state, county } = body;
      if (!apn || !state) return Response.json({ error: "apn and state required" }, { status: 400 });
      params = { parcelId: apn, state, county: county || "" };
      endpoint = "public/property/parcelId";
      url = `${REALIE_BASE}/public/property/parcelId/?state=${encodeURIComponent(state)}&county=${encodeURIComponent(county || "")}&parcelId=${encodeURIComponent(apn)}`;
    } else if (mode === "address") {
      const { address, state, county } = body;
      if (!address || !state) return Response.json({ error: "address and state required" }, { status: 400 });
      params = { address, state, county };
      endpoint = "public/property/search";
      url = `${REALIE_BASE}/public/property/search/?state=${encodeURIComponent(state)}&address=${encodeURIComponent(address)}&limit=5${county ? `&county=${encodeURIComponent(county)}` : ""}`;
    } else if (mode === "location") {
      const { lat, lon } = body;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return Response.json({ error: "lat and lon required" }, { status: 400 });
      }
      params = { lat, lon };
      endpoint = "public/property/location";
      url = `${REALIE_BASE}/public/property/location/?latitude=${lat}&longitude=${lon}&radius=0.03&limit=5&includeUnassignedAddress=true`;
    } else {
      return Response.json({ error: "mode must be apn | address | location" }, { status: 400 });
    }

    const r = await fetch(url, { headers: { Authorization: apiKey } });
    await logLedger({ endpoint, params, status: r.status, userEmail: user.email });

    if (r.status === 404) return Response.json({ parcels: [], notFound: true });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("Realie HTTP", r.status, text.slice(0, 300));
      return Response.json({ error: `Realie HTTP ${r.status}` }, { status: 502 });
    }

    const data = await r.json();
    const raw = data.property ? [data.property] : data.properties || [];
    const parcels = raw.map(normalize);
    return Response.json({ parcels });
  } catch (error) {
    console.error("towerSiterParcel error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});