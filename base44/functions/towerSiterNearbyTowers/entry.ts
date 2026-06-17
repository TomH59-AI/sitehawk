import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * towerSiterNearbyTowers — Returns existing FCC ASR towers within a radius
 * of a parcel centroid. Used by the Tower Siter for the tower-separation check
 * and for drawing exclusion buffers on the map.
 *
 * Input: { lat, lon, radius_miles? (default 2) }
 * Output: { towers: [...], count, source }
 *
 * Primary source: Supabase FCC ASR (nearest_cell_tower RPC used iteratively
 * via a bounding-box REST query if a towers_in_ring RPC doesn't exist).
 * Fallback: OpenCellID bounding-box query via Unwired Labs.
 */

const FCC_SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
const FCC_ANON_KEY = "sb_publishable_qlmz0RMO8qXUrWi1i6bpaQ_9tcqSzFZ";
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

function carrierName(mcc, mnc) {
  if (mcc !== 310 && mcc !== 311 && mcc !== 312 && mcc !== 313) return `MCC ${mcc}`;
  const VZ = new Set([12, 13, 590, 890, 910, 480]);
  const ATT = new Set([410, 150, 170, 280, 380, 980, 560]);
  const TMO = new Set([260, 200, 210, 220, 230, 240, 250, 270, 310, 490, 660, 800]);
  if (VZ.has(mnc)) return 'Verizon';
  if (ATT.has(mnc)) return 'AT&T';
  if (TMO.has(mnc)) return 'T-Mobile';
  return `MNC ${mnc}`;
}

async function queryFccBbox(latN, lonN, radiusMiles) {
  const radiusKm = radiusMiles * MI_TO_KM;
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((latN * Math.PI) / 180));
  const latMin = latN - dLat, latMax = latN + dLat;
  const lonMin = lonN - dLon, lonMax = lonN + dLon;

  // Query FCC ASR table via Supabase PostgREST bbox filter
  const cols = "tower_registration_number,callsign,licensee,structure_type,latitude_deg,longitude_deg,total_structure_count,site_address,city,state,fcc_url";
  const url = `${FCC_SUPABASE_URL}/rest/v1/cell_towers?select=${cols}`
    + `&latitude_deg=gte.${latMin}&latitude_deg=lte.${latMax}`
    + `&longitude_deg=gte.${lonMin}&longitude_deg=lte.${lonMax}`
    + `&license_status=eq.A`
    + `&limit=100`;

  const r = await fetch(url, {
    headers: {
      apikey: FCC_ANON_KEY,
      Authorization: `Bearer ${FCC_ANON_KEY}`,
    },
  });

  if (!r.ok) {
    const txt = await r.text();
    console.error("[towerSiterNearbyTowers] FCC bbox query failed:", r.status, txt.slice(0, 200));
    return null;
  }

  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return rows.map((t) => ({
    source: "FCC ASR",
    asrn: t.tower_registration_number || null,
    call_letters: t.callsign || null,
    owner: t.licensee || null,
    structure_type: t.structure_type || null,
    height_ft: t.total_structure_count != null ? Math.round(Number(t.total_structure_count)) : null,
    latitude: parseFloat(t.latitude_deg),
    longitude: parseFloat(t.longitude_deg),
    city: t.city || null,
    state: t.state || null,
    fcc_url: t.fcc_url || null,
    distance_miles: Math.round(haversineMi(latN, lonN, parseFloat(t.latitude_deg), parseFloat(t.longitude_deg)) * 100) / 100,
  })).filter((t) => Number.isFinite(t.latitude) && Number.isFinite(t.longitude));
}

async function queryOpenCellId(latN, lonN, radiusMiles, token) {
  const radiusKm = radiusMiles * MI_TO_KM;
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((latN * Math.PI) / 180));
  const url = `https://opencellid.org/cell/getInArea?key=${encodeURIComponent(token)}`
    + `&BBOX=${latN - dLat},${lonN - dLon},${latN + dLat},${lonN + dLon}`
    + `&format=json&limit=200`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  if (data?.error) { console.error("[towerSiterNearbyTowers] OpenCellID:", data.error); return []; }
  const cells = (data?.cells || []);
  // Deduplicate by lat/lon proximity (100m ~ 0.001 deg)
  const seen = new Set();
  const towers = [];
  for (const c of cells) {
    const tLat = parseFloat(c.lat), tLon = parseFloat(c.lon);
    if (!Number.isFinite(tLat) || !Number.isFinite(tLon)) continue;
    const key = `${tLat.toFixed(3)},${tLon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    towers.push({
      source: "OpenCellID",
      owner: carrierName(Number(c.mcc), Number(c.mnc)),
      structure_type: c.radio ? c.radio.toUpperCase() : "Cell",
      height_ft: null,
      latitude: tLat,
      longitude: tLon,
      distance_miles: Math.round(haversineMi(latN, lonN, tLat, tLon) * 100) / 100,
    });
  }
  return towers;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, radius_miles = 2 } = await req.json();
    if (lat == null || lon == null) return Response.json({ error: "lat and lon required" }, { status: 400 });

    const latN = Number(lat), lonN = Number(lon);
    const radiusMiles = Math.min(Number(radius_miles) || 2, 5);

    // 1. Try FCC ASR from Supabase bbox query
    const fccTowers = await queryFccBbox(latN, lonN, radiusMiles).catch(() => null);

    // 2. OpenCellID fallback/supplement
    const uwToken = Deno.env.get("UNWIREDLABS_TOKEN");
    const ocidTowers = uwToken ? await queryOpenCellId(latN, lonN, radiusMiles, uwToken).catch(() => []) : [];

    // Merge: prefer FCC, supplement with OpenCellID points >100m from any FCC tower
    let allTowers = [];
    if (fccTowers && fccTowers.length > 0) {
      allTowers = [...fccTowers];
      for (const oc of ocidTowers) {
        const tooClose = allTowers.some((f) => haversineMi(f.latitude, f.longitude, oc.latitude, oc.longitude) < 0.062);
        if (!tooClose) allTowers.push(oc);
      }
    } else {
      allTowers = ocidTowers;
    }

    // Filter to radius and sort by distance
    allTowers = allTowers
      .filter((t) => t.distance_miles <= radiusMiles)
      .sort((a, b) => a.distance_miles - b.distance_miles);

    return Response.json({
      count: allTowers.length,
      towers: allTowers,
      source: fccTowers ? "FCC ASR + OpenCellID" : "OpenCellID",
    });
  } catch (err) {
    console.error("towerSiterNearbyTowers error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});