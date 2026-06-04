import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Fetch parcels within the 1-mile ring of the entered coordinates via Realie API.
// Returns normalized parcel records: APN, owner, mailing_address, acreage,
// zoning classification, land use, assessed value, last sale, and ring distance.

// Realie Location Search endpoint: max radius 2 miles, max 100 results.
// Docs: https://docs.realie.ai/api-reference/property/location-search.md
const REALIE_URL = "https://app.realie.ai/api/public/property/location/";

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalize(p, centerLat, centerLon) {
  const latitude = num(p.latitude ?? p.lat);
  const longitude = num(p.longitude ?? p.lon ?? p.lng);
  const acreage = num(p.acres ?? p.acreage ?? p.lotSizeAcres);
  const zoningClassification =
    p.zoning ||
    p.zoningCode ||
    p.zoning_code ||
    p.zoning_classification ||
    p.landUse ||
    p.land_use ||
    p.useDescription ||
    null;

  return {
    apn: p.apn || p.parcelId || p.parcel_id || p.parcel_number || null,
    parcel_id: p.parcelId || p.apn || p.parcel_id || p.parcel_number || null,
    owner_name: p.ownerName || p.owner_name || p.owner || null,
    mailing_address: p.ownerMailingAddress || [p.owner_mailing_address, p.owner_mailing_city, p.owner_mailing_state, p.owner_mailing_zip]
      .filter(Boolean)
      .join(", ") || null,
    parcel_address: p.address || p.addressRaw || p.fullAddress || p.site_address || null,
    acreage,
    parcel_size_acres: acreage,
    zoning_classification: zoningClassification,
    land_use: p.landUse || p.land_use || p.useDescription || null,
    use_code: p.useCode || p.use_code || null,
    county: p.county || p.countyName || null,
    state: p.state || null,
    assessed_value: p.totalAssessedValue || p.assessedValue || p.marketValue || null,
    last_sale_date: p.lastSaleDate || p.last_sale_date || p.saleDate || null,
    last_sale_price: p.lastSalePrice || p.last_sale_price || p.salePrice || null,
    latitude,
    longitude,
    distance_miles: latitude != null && longitude != null
      ? Number(haversineMiles(Number(centerLat), Number(centerLon), latitude, longitude).toFixed(2))
      : null,
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

    const parcels = items
      .map((item) => normalize(item, lat, lon))
      .filter((p) => p.apn || p.owner_name || p.parcel_address)
      .sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999));

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
