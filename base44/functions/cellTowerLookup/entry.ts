import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─────────────────────────────────────────────────────────────────────────────
// Nearest Cell Tower — Supabase RPC `nearest_cell_tower`
// Source DB: https://vkiwvctpxhbsoeagivnl.supabase.co
//
// Returns the nearest FCC-registered tower plus a `line_geojson` LineString
// from the search ring center to the tower for crow-flies rendering on Mapbox.
//
// Response shape:
//   {
//     nearest_tower: { call_letters, structure_type, licensee,
//                      tower_registration_number, fcc_url,
//                      latitude_deg, longitude_deg,
//                      distance_miles, line_geojson },
//     tower_line:    { type:"Feature", geometry:LineString, properties:{} },
//     towers:        [ legacy-shape rows for the existing UI ]
//   }
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qlmz0RMO8qXUrWi1i6bpaQ_9tcqSzFZ";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ towers: [] });

    const { lat, lon, radius_miles } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }

    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/nearest_cell_tower`;
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
        radius_miles: radius_miles == null ? null : Number(radius_miles),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Supabase nearest_cell_tower HTTP ${res.status}: ${text.slice(0, 300)}`);
      return Response.json({ towers: [], error: `Tower lookup failed: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const nearest = Array.isArray(data) ? data[0] : data;

    if (!nearest) {
      console.log(`[cellTower] no towers within ${radius_miles ?? "unlimited"} mi of ${lat},${lon}`);
      return Response.json({ nearest_tower: null, tower_line: null, towers: [] });
    }

    const distanceMiles = nearest.distance_miles != null
      ? parseFloat(Number(nearest.distance_miles).toFixed(2))
      : null;

    const nearest_tower = {
      call_letters: nearest.call_letters || null,
      structure_type: nearest.structure_type || null,
      licensee: nearest.licensee || null,
      tower_registration_number: nearest.tower_registration_number || null,
      fcc_url: nearest.fcc_url || null,
      latitude_deg: nearest.latitude_deg ?? null,
      longitude_deg: nearest.longitude_deg ?? null,
      distance_miles: distanceMiles,
      line_geojson: nearest.line_geojson || null,
    };

    const tower_line = nearest.line_geojson
      ? { type: "Feature", geometry: nearest.line_geojson, properties: {} }
      : null;

    // Legacy shape — keep existing UI components rendering without changes
    const legacyTower = {
      operator: nearest.licensee || "Unknown",
      operator_confidence: nearest.licensee ? "fcc" : "none",
      type: nearest.structure_type || "Tower",
      distance_miles: distanceMiles,
      lat: nearest.latitude_deg ?? null,
      lon: nearest.longitude_deg ?? null,
      asrn: nearest.tower_registration_number || null,
      call_letters: nearest.call_letters || null,
      fcc_url: nearest.fcc_url || null,
    };

    console.log(
      `[cellTower] Supabase → ${nearest_tower.call_letters} (${nearest_tower.licensee}) ${distanceMiles} mi`
    );

    return Response.json({
      nearest_tower,
      tower_line,
      towers: [legacyTower],
    });
  } catch (error) {
    console.error('cellTowerLookup error:', error.message);
    return Response.json({ towers: [], error: error.message });
  }
});