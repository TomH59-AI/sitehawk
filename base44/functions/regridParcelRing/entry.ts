/**
 * regridParcelRing — Fetch parcels in a radius using the Regrid API v2 /query endpoint.
 *
 * Used EXCLUSIVELY for the Section 4 Parcel Map overlay (Map #9) so Regrid
 * credits are spent only on that map, while Realie handles the SARF ring
 * scan and Target selection.
 *
 * Regrid docs: GET /api/v2/parcels/query?lat=&lon=&radius=<meters>&token=
 *
 * Input:  { lat, lon, radius_miles (default 0.5, max 1.0) }
 * Output: { parcels: [...normalized], count, center }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function normalize(feature) {
  const f = feature?.properties?.fields || feature?.properties || {};
  const geom = feature?.geometry || null;
  return {
    apn: f.parcelnumb || f.apn || f.parcel_id || null,
    owner_name: f.owner || f.owner2 || null,
    mailing_address: [f.mailadd, f.mail_city, f.mail_state2, f.mail_zip].filter(Boolean).join(", ") || null,
    parcel_address: f.address || f.siteaddr || null,
    acreage: f.ll_gisacre ?? f.gisacre ?? f.acres ?? null,
    land_use: f.usedesc || f.zoning_description || f.zoning || null,
    zoning: f.zoning || null,
    latitude: f.lat ?? (geom?.coordinates?.[1]) ?? null,
    longitude: f.lon ?? (geom?.coordinates?.[0]) ?? null,
    parcel_geometry: geom,
    county: f.county || f.scounty || null,
    state: f.state2 || null,
    assessed_value: f.parval ?? null,
    last_sale_date: f.saledatetx || f.saledate || null,
    last_sale_price: f.saleprice ?? null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const token = Deno.env.get("REGRID_API_KEY");
    if (!token) return Response.json({ error: "REGRID_API_KEY not configured" }, { status: 500 });

    const { lat, lon, radius_miles = 0.5 } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    // Regrid radius param is in meters, max 32000m (~20mi). We cap at 1mi.
    const radiusMeters = Math.min(Number(radius_miles), 1.0) * 1609.34;
    const limit = 100;

    const url = new URL("https://app.regrid.com/api/v2/parcels/query");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("radius", String(Math.round(radiusMeters)));
    url.searchParams.set("token", token);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("return_geometry", "true");

    console.log(`[regridParcelRing] lat=${lat} lon=${lon} radius=${radius_miles}mi (${Math.round(radiusMeters)}m)`);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const errText = await res.text();
      console.error("[regridParcelRing] Regrid error", res.status, errText.slice(0, 300));
      return Response.json({ error: `Regrid HTTP ${res.status}: ${errText.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    const features = data?.parcels?.features || data?.features || [];
    const parcels = features.map(normalize).filter((p) => p.apn || p.owner_name);

    console.log(`[regridParcelRing] returned ${parcels.length} parcels from ${features.length} features`);

    return Response.json({
      ok: true,
      count: parcels.length,
      center: { lat, lon },
      radius_miles: Number(radius_miles),
      parcels,
    });
  } catch (err) {
    console.error("[regridParcelRing] error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});