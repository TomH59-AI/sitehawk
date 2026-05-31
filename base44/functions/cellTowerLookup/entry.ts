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

const EARTH_MI = 3958.8;
const MI_TO_KM = 1.60934;

function haversineMi(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// MCC/MNC -> US carrier name (covers the major nationwide networks).
function carrierName(mcc, mnc) {
  if (mcc !== 310 && mcc !== 311 && mcc !== 312 && mcc !== 313) return `MCC ${mcc} / MNC ${mnc}`;
  const VZ = new Set([12, 13, 590, 890, 910, 480]);
  const ATT = new Set([410, 150, 170, 280, 380, 980, 560]);
  const TMO = new Set([260, 200, 210, 220, 230, 240, 250, 270, 310, 490, 660, 800]);
  if (VZ.has(mnc)) return 'Verizon';
  if (ATT.has(mnc)) return 'AT&T';
  if (TMO.has(mnc)) return 'T-Mobile';
  return `MNC ${mnc}`;
}

// Fallback: query OpenCellID / Unwired Labs for the nearest cell site.
// Used ONLY when the Supabase FCC database returns no tower.
async function unwiredLabsNearest(latN, lonN) {
  const token = Deno.env.get('UNWIREDLABS_TOKEN');
  if (!token) return null;
  const radiusKm = 8 * MI_TO_KM; // ~8 mi search box
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((latN * Math.PI) / 180));
  const url = `https://opencellid.org/cell/getInArea?key=${encodeURIComponent(token)}`
    + `&BBOX=${latN - dLat},${lonN - dLon},${latN + dLat},${lonN + dLon}`
    + `&format=json&limit=200`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (data?.error) {
    console.error(`[cellTower] OpenCellID error: ${data.error}`);
    return null;
  }
  const cells = (data?.cells || [])
    .map((c) => {
      const tLat = parseFloat(c.lat);
      const tLon = parseFloat(c.lon);
      return {
        lat: tLat,
        lon: tLon,
        carrier: carrierName(Number(c.mcc), Number(c.mnc)),
        radio: c.radio || 'cell',
        distance_mi: Math.round(haversineMi(latN, lonN, tLat, tLon) * 100) / 100,
      };
    })
    .filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lon));
  cells.sort((a, b) => a.distance_mi - b.distance_mi);
  return cells[0] || null;
}

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
      console.log(`[cellTower] Supabase FCC empty — falling back to UnwiredLabs for ${lat},${lon}`);
      const uw = await unwiredLabsNearest(Number(lat), Number(lon));
      if (!uw) {
        return Response.json({ nearest_tower: null, tower_line: null, towers: [] });
      }
      const uwTower = {
        call_letters: null,
        structure_type: uw.radio ? uw.radio.toUpperCase() : "Cell Site",
        licensee: uw.carrier || null,
        tower_registration_number: null,
        fcc_url: null,
        latitude_deg: uw.lat,
        longitude_deg: uw.lon,
        distance_miles: uw.distance_mi,
        line_geojson: null,
        source: "UnwiredLabs / OpenCellID",
      };
      const uwLine = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[Number(lon), Number(lat)], [uw.lon, uw.lat]] },
        properties: {},
      };
      console.log(`[cellTower] UnwiredLabs → ${uw.carrier} (${uw.radio}) ${uw.distance_mi} mi`);
      return Response.json({
        nearest_tower: uwTower,
        tower_line: uwLine,
        towers: [{
          operator: uw.carrier || "Unknown",
          operator_confidence: "opencellid",
          type: uw.radio || "cell",
          distance_miles: uw.distance_mi,
          lat: uw.lat,
          lon: uw.lon,
        }],
        source: "UnwiredLabs / OpenCellID",
      });
    }

    const distanceMiles = nearest.distance_miles != null
      ? parseFloat(Number(nearest.distance_miles).toFixed(2))
      : null;

    // Tower height — the FCC ASR record may expose overall height under a few
    // possible column names depending on the RPC view. Coalesce them so the UI
    // can show a height (was always blank before).
    const heightFt = nearest.overall_height_ft
      ?? nearest.structure_height_ft
      ?? nearest.height_ft
      ?? nearest.overall_height_above_ground
      ?? nearest.height_above_ground_ft
      ?? null;

    const nearest_tower = {
      call_letters: nearest.call_letters || null,
      structure_type: nearest.structure_type || null,
      licensee: nearest.licensee || null,
      tower_registration_number: nearest.tower_registration_number || null,
      fcc_url: nearest.fcc_url || null,
      latitude_deg: nearest.latitude_deg ?? null,
      longitude_deg: nearest.longitude_deg ?? null,
      distance_miles: distanceMiles,
      overall_height_ft: heightFt != null ? Math.round(Number(heightFt)) : null,
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