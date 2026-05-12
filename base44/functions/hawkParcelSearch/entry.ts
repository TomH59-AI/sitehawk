import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ────────────────────────────────────────────────────────────────────────────
// hawkParcelSearch — now backed by Realie API (single source of parcel data).
// Returns parcels in the same shape callers expect (results array with
// owner/address/acreage/zoning/lat/lon/values).
// ────────────────────────────────────────────────────────────────────────────

const REALIE_URL = "https://app.realie.ai/api/public/property/location/";
const REALIE_API_KEY = Deno.env.get("REALIE_API_KEY");

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function useCodeToZoning(code, zoningCode) {
  if (zoningCode) return zoningCode;
  const c = parseInt(code) || 0;
  if (c >= 1000 && c <= 1999) return "Residential";
  if (c >= 2000 && c <= 2999) return "Commercial";
  if (c >= 3000 && c <= 3999) return "Commercial Office";
  if (c >= 4000 && c <= 4999) return "Recreational";
  if (c >= 5000 && c <= 5999) return "Industrial";
  if (c >= 6000 && c <= 6999) return "Agricultural";
  if (c >= 7000 && c <= 7999) return "Vacant / Special";
  if (c >= 8000 && c <= 8999) return "Public / Institutional";
  if (c >= 9000 && c <= 9999) return "Government / Exempt";
  return code ? `UC-${code}` : "Unknown";
}

function isResidentialUseCode(code) {
  const c = parseInt(code) || 0;
  return c >= 1000 && c <= 1999;
}

function scoreParcel(p, distMeters) {
  const distanceScore = distMeters ? Math.max(0, 100 - (distMeters / 8)) : 70;
  const c = parseInt(p.useCode) || 0;
  let zoningScore = 60;
  if (c >= 2000 && c <= 3999) zoningScore = 100; // commercial
  else if (c >= 5000 && c <= 5999) zoningScore = 95; // industrial
  else if (c >= 7000 && c <= 7999) zoningScore = 90; // vacant
  else if (c >= 6000 && c <= 6999) zoningScore = 80; // agricultural
  const acres = parseFloat(p.acres) || 0;
  const acreageScore = acres ? Math.min(100, acres * 12) : 40;
  return Number((distanceScore * 0.4 + zoningScore * 0.4 + acreageScore * 0.2).toFixed(1));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!REALIE_API_KEY) {
      console.error("REALIE_API_KEY is not set");
      return Response.json({ error: "Parcel data service is not configured." }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { lat, lon, limit = 3, radius_miles, offset } = body || {};

    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    const cap = Math.min(parseInt(limit) || 3, 3); // hard-cap at 3 per page
    const pageOffset = Math.max(0, parseInt(offset) || 0);
    const radiusMiles = Math.min(parseFloat(radius_miles) || 0.5, 2); // Realie max 2 mi

    const url = `${REALIE_URL}?latitude=${lat}&longitude=${lon}&radius=${radiusMiles}&limit=100&offset=${pageOffset}`;

    const res = await fetch(url, { headers: { "Authorization": REALIE_API_KEY } });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`Realie HTTP ${res.status}: ${text}`);
      return Response.json({ count: 0, results: [], offset: pageOffset, next_offset: null, has_more: false, note: `realie ${res.status}` });
    }

    const data = await res.json();
    const properties = Array.isArray(data?.properties) ? data.properties : [];
    if (!properties.length) return Response.json({ count: 0, results: [], offset: pageOffset, next_offset: null, has_more: false });

    const ranked = properties
      .filter((p) => !isResidentialUseCode(p.useCode))
      .map((p) => {
        if (p.latitude == null || p.longitude == null) return null;
        const distMeters = haversineMeters(lat, lon, p.latitude, p.longitude);
        const acres = p.acres != null ? parseFloat(parseFloat(p.acres).toFixed(2)) : null;
        const zoning = useCodeToZoning(p.useCode, p.zoningCode);
        const physAddr = [p.addressRaw, p.city, p.state, p.zipCode].filter(Boolean).join(", ");
        const mailingAddr = [
          p.mailerAddress || p.ownerAddressLine1,
          p.mailingCity || p.ownerCity,
          p.mailingState || p.ownerState,
          p.mailingZip5 || p.ownerZipCode,
        ].filter(Boolean).join(", ");
        return {
          parcel_id: p.parcelId,
          owner_name: p.ownerName || null,
          parcel_address: physAddr || null,
          mailing_address: mailingAddr || null,
          acreage: acres,
          zoning,
          use_code: p.useCode || null,
          land_value: p.totalLandValue ?? p.assessedLandValue ?? null,
          improvement_value: p.assessedBuildingValue ?? null,
          total_value: p.totalAssessedValue ?? p.totalMarketValue ?? null,
          sale_date: p.transferDate || p.purchaseSaleDate || null,
          latitude: p.latitude,
          longitude: p.longitude,
          county: p.county || null,
          state: p.state || null,
          distance_meters: Math.round(distMeters),
          score: scoreParcel(p, distMeters),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const results = ranked.slice(pageOffset, pageOffset + cap);
    const nextOffset = pageOffset + results.length;
    const hasMore = nextOffset < ranked.length;

    return Response.json({
      count: results.length,
      results,
      source: "realie",
      offset: pageOffset,
      next_offset: hasMore ? nextOffset : null,
      has_more: hasMore,
    });

  } catch (error) {
    console.error('hawkParcelSearch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});