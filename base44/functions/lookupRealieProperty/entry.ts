import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// HawkFit Map — Realie property lookup by address, parcel ID, or coordinates.
// REALIE_API_KEY stays backend-only; the frontend only receives normalized data.
const REALIE_BASE = "https://app.realie.ai/api";

function normalize(p, state) {
  const lat = p.latitude ?? p.lat ?? p.location?.coordinates?.[1] ?? null;
  const lon = p.longitude ?? p.lon ?? p.lng ?? p.location?.coordinates?.[0] ?? null;
  const city = p.city || p.situsCity || null;
  const county = p.county || null;
  const st = p.state || state || null;
  return {
    address: p.address || p.fullAddress || p.situsAddress || null,
    parcel_id: p.parcelId || p.parcelNumber || p.apn || null,
    owner: p.ownerName || p.owner || p.owner_name || null,
    acreage: p.lotSizeAcres ?? p.acres ?? p.acreage ?? null,
    zoning: p.zoningCode || p.zoning || p.useDescription || null,
    jurisdiction: [city || county, st].filter(Boolean).join(", ") || null,
    latitude: lat != null ? Number(lat) : null,
    longitude: lon != null ? Number(lon) : null,
    parcel_geometry: p.geometry || null,
    source: "realie",
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get("REALIE_API_KEY");
    if (!apiKey) return Response.json({ error: "REALIE_API_KEY not set" }, { status: 500 });

    const body = await req.json();
    const { address, city, county, state, parcelId, lat, lon } = body || {};

    let url, queryType, query;
    if (parcelId) {
      if (!state || !county) return Response.json({ error: "state and county are required for parcel ID lookup" }, { status: 400 });
      queryType = "parcel_id";
      query = { parcelId, state, county };
      url = `${REALIE_BASE}/public/property/parcelId/?${new URLSearchParams({ state, county, parcelId })}`;
    } else if (address) {
      if (!state) return Response.json({ error: "state is required for address lookup" }, { status: 400 });
      queryType = "address";
      const params = new URLSearchParams({ state, address });
      if (city && county) { params.set("city", city); params.set("county", county); }
      query = { address, city, county, state };
      url = `${REALIE_BASE}/public/property/address/?${params}`;
    } else if (lat != null && lon != null) {
      queryType = "coordinates";
      query = { lat, lon };
      url = `${REALIE_BASE}/public/property/location/?${new URLSearchParams({
        latitude: String(lat), longitude: String(lon), radius: "0.05", limit: "1", includeUnassignedAddress: "true",
      })}`;
    } else {
      return Response.json({ error: "Provide address+state, parcelId+state+county, or lat+lon" }, { status: 400 });
    }

    const r = await fetch(url, { headers: { Authorization: apiKey } });

    if (r.status === 404) {
      await base44.entities.RealieLookupLog.create({ query_type: queryType, query, status: "not_found" });
      return Response.json({ found: false, error: "No property found for that query." }, { status: 404 });
    }
    if (!r.ok) {
      const text = await r.text();
      console.error("Realie HTTP", r.status, text.slice(0, 300));
      await base44.entities.RealieLookupLog.create({ query_type: queryType, query, status: "error", error_message: `HTTP ${r.status}` });
      return Response.json({ error: `Realie HTTP ${r.status}` }, { status: 502 });
    }

    const data = await r.json();
    const raw = data.property || (Array.isArray(data.properties) ? data.properties[0] : null);
    if (!raw) {
      await base44.entities.RealieLookupLog.create({ query_type: queryType, query, status: "not_found" });
      return Response.json({ found: false, error: "No property found for that query." }, { status: 404 });
    }

    let target = normalize(raw, state);
    // Persist a SiteTarget (live schema fields only) when coordinates resolved.
    if (target.latitude != null && target.longitude != null) {
      const data = {};
      for (const [k, v] of Object.entries(target)) {
        if (v != null && v !== "") data[k] = v;
      }
      target = await base44.entities.SiteTarget.create(data);
    }
    await base44.entities.RealieLookupLog.create({
      query_type: queryType, query, status: "found", matched_address: target.address || undefined,
    });

    return Response.json({ found: true, target });
  } catch (error) {
    console.error("lookupRealieProperty error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});