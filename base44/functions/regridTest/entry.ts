// Quick test function: fetch a single parcel from Regrid using the REGRID_API_TOKEN.
// Accepts { lat, lon } in payload, defaults to a known address (Tampa, FL).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get("REGRID_API_TOKEN");
    if (!token) return Response.json({ error: 'REGRID_API_TOKEN not set' }, { status: 500 });

    const { lat = 27.9506, lon = -82.4572 } = await req.json().catch(() => ({}));

    // Regrid Point Search API — returns the single parcel containing the point
    const url = `https://app.regrid.com/api/v2/parcels/point?lat=${lat}&lon=${lon}&token=${token}`;
    console.log(`Regrid lookup: lat=${lat} lon=${lon}`);

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      console.error(`Regrid error ${res.status}:`, JSON.stringify(data).slice(0, 500));
      return Response.json({ ok: false, status: res.status, error: data }, { status: res.status });
    }

    const feature = data?.parcels?.features?.[0];
    const fields = feature?.properties?.fields || {};

    return Response.json({
      ok: true,
      status: res.status,
      parcel_count: data?.parcels?.features?.length || 0,
      sample: feature ? {
        parcel_id: fields.parcelnumb,
        owner: fields.owner,
        address: fields.address,
        city: fields.scity,
        state: fields.state2,
        acres: fields.gisacre,
        zoning: fields.zoning,
        lat: fields.lat,
        lon: fields.lon,
      } : null,
    });
  } catch (error) {
    console.error('regridTest error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});