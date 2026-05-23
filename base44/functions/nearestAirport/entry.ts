import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─────────────────────────────────────────────────────────────────────────────
// Nearest Airport — Supabase RPC `nearest_airport`
// Source DB: https://vkiwvctpxhbsoeagivnl.supabase.co
//
// Returns the nearest airport row plus a `line_geojson` LineString from the
// search ring center to the airport for crow-flies rendering on Mapbox.
//
// Response shape (backward-compatible with previous FAA-based version):
//   {
//     airport_callnumber, airport_type, latitude_deg, longitude_deg,
//     distance_miles, line_geojson, airport_line,           ← new
//     iata, icao, name, lat, lon                            ← legacy aliases
//   }
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qlmz0RMO8qXUrWi1i6bpaQ_9tcqSzFZ";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, include_closed = false } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/nearest_airport`;
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        center_lat: Number(lat),
        center_lon: Number(lon),
        include_closed: Boolean(include_closed),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Supabase nearest_airport HTTP ${res.status}: ${text.slice(0, 300)}`);
      return Response.json({ error: `Airport lookup failed: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const nearest = Array.isArray(data) ? data[0] : data;

    if (!nearest) {
      console.warn(`No airport returned for ${lat},${lon}`);
      return Response.json({});
    }

    const distanceMiles = nearest.distance_miles != null
      ? parseFloat(Number(nearest.distance_miles).toFixed(2))
      : null;

    const airportLine = nearest.line_geojson
      ? { type: "Feature", geometry: nearest.line_geojson, properties: {} }
      : null;

    const response = {
      // Primary fields per spec
      airport_callnumber: nearest.airport_callnumber || null,
      airport_type: nearest.airport_type || null,
      latitude_deg: nearest.latitude_deg ?? null,
      longitude_deg: nearest.longitude_deg ?? null,
      distance_miles: distanceMiles,
      line_geojson: nearest.line_geojson || null,
      airport_line: airportLine,

      // Legacy aliases — keep downstream UI working without code changes
      iata: nearest.airport_callnumber || null,
      icao: nearest.airport_callnumber || null,
      name: nearest.airport_callnumber || null,
      lat: nearest.latitude_deg ?? null,
      lon: nearest.longitude_deg ?? null,
    };

    console.log(
      `Airport (Supabase): user=${user.email} → ${response.airport_callnumber} (${response.airport_type}) ${distanceMiles} mi`
    );
    return Response.json(response);
  } catch (error) {
    console.error('nearestAirport error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});