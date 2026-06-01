import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Fetch parcels within the 1-mile ring of the entered coordinates via Realie API.
// Returns normalized parcel records: APN, owner, mailing_address, acreage, land_use, assessed_value, last_sale.

// Realie Location Search endpoint: max radius 2 miles, max 100 results.
// Docs: https://docs.realie.ai/api-reference/property/location-search.md
const REALIE_URL = "https://app.realie.ai/api/public/property/location/";

function normalize(p) {
  return {
    apn: p.apn || p.parcelId || p.parcel_id || p.parcel_number || null,
    owner_name: p.ownerName || p.owner_name || p.owner || null,
    mailing_address: p.ownerMailingAddress || [p.owner_mailing_address, p.owner_mailing_city, p.owner_mailing_state, p.owner_mailing_zip]
      .filter(Boolean)
      .join(", ") || null,
    parcel_address: p.address || p.fullAddress || p.site_address || null,
    acreage: p.acres || p.acreage || p.lotSizeAcres || null,
    // Lot dimensions when the assessor provides them (frontage x depth, ft).
    lot_frontage_ft: p.lotFrontage || p.frontage || p.lot_frontage || p.lotWidth || p.lot_width || null,
    lot_depth_ft: p.lotDepth || p.depth || p.lot_depth || null,
    lot_size_sqft: p.lotSizeSqFt || p.lotSquareFeet || p.lot_size_sqft || p.squareFeet || null,
    land_use: p.landUse || p.land_use || p.useDescription || p.zoning || null,
    assessed_value: p.totalAssessedValue || p.assessedValue || p.marketValue || null,
    last_sale_date: p.lastSaleDate || p.last_sale_date || p.saleDate || null,
    last_sale_price: p.lastSalePrice || p.last_sale_price || p.salePrice || null,
    latitude: p.latitude || p.lat || (p.location?.coordinates?.[1]) || null,
    longitude: p.longitude || p.lon || p.lng || (p.location?.coordinates?.[0]) || null,
    // GeoJSON parcel polygon (Realie returns a MultiPolygon under `geometry`).
    parcel_geometry: p.geometry || p.parcel_geometry || p.parcelGeometry || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, radius_miles = 1.0 } = await req.json();
    if (lat == null || lon == null) return Response.json({ error: "lat and lon required" }, { status: 400 });

    const apiKey = Deno.env.get("REALIE_API_KEY");
    if (!apiKey) return Response.json({ error: "REALIE_API_KEY not set" }, { status: 500 });

    // Realie caps radius at 2 miles
    const radius = Math.min(radius_miles, 2.0);
    const url = `${REALIE_URL}?latitude=${lat}&longitude=${lon}&radius=${radius}&limit=100`;

    const r = await fetch(url, { headers: { Authorization: apiKey } });
    if (!r.ok) {
      const body = await r.text();
      return Response.json({ error: `Realie HTTP ${r.status}: ${body.slice(0, 300)}` }, { status: 502 });
    }
    const data = await r.json();
    const items = data.properties || data.results || (Array.isArray(data) ? data : []);

    const parcels = items.map(normalize).filter((p) => p.apn || p.owner_name || p.parcel_address);

    return Response.json({
      count: parcels.length,
      radius_miles: radius,
      center: { lat, lon },
      parcels,
    });
  } catch (error) {
    console.error("realieParcelsInRing error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});