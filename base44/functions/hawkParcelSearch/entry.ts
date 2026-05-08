import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/rest/v1/hawk_parcels";
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const RADIUS_MILES = 0.5;
const RADIUS_METERS = 804.672;

// Residential zoning patterns to exclude (SQL ILIKE style, case-insensitive)
const RES_FILTERS = [
  "R%",
  "%RES%",
  "%RESI%",
  "%SFR%",
  "%MFR%",
  "%APT%",
  "%CONDO%",
];

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isResidential(zoning) {
  if (!zoning) return false;
  const z = zoning.toUpperCase();
  return RES_FILTERS.some((pattern) => z.includes(pattern.replace(/%/g, "")));
}

function scoreParcel(p) {
  const distanceScore = p.distance_meters
    ? Math.max(0, 100 - (p.distance_meters / 8))
    : 70;

  const zoningScore = p.zoning?.startsWith("C") ? 100 :
                      p.zoning?.startsWith("I") ? 95 :
                      60;

  const acreageScore = p.acreage
    ? Math.min(100, p.acreage * 12)
    : 40;

  return Number(
    (distanceScore * 0.4 +
     zoningScore   * 0.4 +
     acreageScore  * 0.2).toFixed(1)
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { state, county, lat, lon, limit = 5 } = body || {};

    if (!state) {
      return Response.json({ error: "State is required" }, { status: 400 });
    }

    const cap = Math.min(parseInt(limit) || 5, 100);

    // Build PostgREST query
    const params = new URLSearchParams({ select: "*" });
    params.append("state", `eq.${state}`);
    if (county) params.append("county", `ilike.*${county}*`);

    // Bounding box pre-filter (~0.5 mi) — refined with haversine below
    if (lat != null && lon != null) {
      const latMin = lat - 0.00725;
      const latMax = lat + 0.00725;
      const lonMin = lon - 0.00725;
      const lonMax = lon + 0.00725;
      params.append("latitude", `gte.${latMin}`);
      params.append("latitude", `lte.${latMax}`);
      params.append("longitude", `gte.${lonMin}`);
      params.append("longitude", `lte.${lonMax}`);
    }

    // Pull a wider page so post-filtering still yields `limit` rows
    params.append("limit", String(Math.max(cap * 10, 50)));

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

    let rows = await res.json();

    // Exclude residential zoning
    rows = rows.filter((p) => !isResidential(p.zoning));

    // Refine to true half-mile radius
    if (lat != null && lon != null) {
      rows = rows
        .map((p) => {
          if (p.latitude == null || p.longitude == null) return null;
          const d = haversineMeters(lat, lon, p.latitude, p.longitude);
          if (d > RADIUS_METERS) return null;
          return { ...p, distance_meters: Math.round(d) };
        })
        .filter(Boolean);
    }

    // Score
    const scored = rows.map((p) => ({ ...p, score: scoreParcel(p) }));

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, cap);

    return Response.json({ count: results.length, results });

  } catch (error) {
    console.error('hawkParcelSearch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});