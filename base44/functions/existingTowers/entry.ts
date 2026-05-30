// existingTowers — SiteHawk "Existing Towers" layer.
// Queries the OpenCellID / Unwired Labs cell database for existing cell sites
// inside a target's search ring, then returns them with carrier, radio type
// and crow-flies distance for plotting on the Verification Map.
//
// Lazy: only called when the "📡 Existing Towers" toggle is switched on.
// Env: UNWIREDLABS_TOKEN (OpenCellID / Unwired Labs API token)
//
// Input  (JSON body): { lat, lon, radiusMiles }
// Output (JSON):       { count, towers: [{ lat, lon, carrier, radio, range_m, distance_mi }], source }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MI_TO_KM = 1.60934;
const EARTH_MI = 3958.8;

// MCC/MNC -> US carrier name (covers the major nationwide networks).
function carrierName(mcc, mnc) {
  if (mcc !== 310 && mcc !== 311 && mcc !== 312 && mcc !== 313) {
    return `MCC ${mcc} / MNC ${mnc}`;
  }
  const VZ = new Set([12, 13, 590, 890, 910, 480]);
  const ATT = new Set([410, 150, 170, 280, 380, 980, 560]);
  const TMO = new Set([260, 200, 210, 220, 230, 240, 250, 270, 310, 490, 660, 800]);
  if (VZ.has(mnc)) return 'Verizon';
  if (ATT.has(mnc)) return 'AT&T';
  if (TMO.has(mnc)) return 'T-Mobile';
  return `MNC ${mnc}`;
}

function haversineMi(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('UNWIREDLABS_TOKEN');
    if (!token) return Response.json({ error: 'UNWIREDLABS_TOKEN not set' }, { status: 500 });

    const body = await req.json();
    const { lat, lon, radiusMiles = 0.5 } = body ?? {};
    if (lat === undefined || lon === undefined) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    const radiusKm = Math.max(0.2, parseFloat(radiusMiles) * MI_TO_KM);

    // Build a bounding box around the target from the ring radius.
    const dLat = radiusKm / 111.32;
    const dLon = radiusKm / (111.32 * Math.cos((latN * Math.PI) / 180));
    const latMin = latN - dLat, latMax = latN + dLat;
    const lonMin = lonN - dLon, lonMax = lonN + dLon;

    // OpenCellID getInArea — BBOX = latmin,lonmin,latmax,lonmax
    const url = `https://opencellid.org/cell/getInArea?key=${encodeURIComponent(token)}`
      + `&BBOX=${latMin},${lonMin},${latMax},${lonMax}`
      + `&format=json&limit=200`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_e) {
      return Response.json({ error: 'OpenCellID returned a non-JSON response (check API key / bbox size)', count: 0, towers: [] }, { status: 502 });
    }
    if (data?.error) {
      return Response.json({ error: data.error, count: 0, towers: [] }, { status: 502 });
    }

    const rawCells = data?.cells || [];
    const towers = rawCells.map((c) => {
      const tLat = parseFloat(c.lat);
      const tLon = parseFloat(c.lon);
      return {
        lat: tLat,
        lon: tLon,
        carrier: carrierName(Number(c.mcc), Number(c.mnc)),
        radio: c.radio || 'cell',
        range_m: Number.isFinite(parseFloat(c.range)) ? parseFloat(c.range) : null,
        distance_mi: Math.round(haversineMi(latN, lonN, tLat, tLon) * 100) / 100,
      };
    }).filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lon));

    towers.sort((a, b) => a.distance_mi - b.distance_mi);

    return Response.json({
      count: towers.length,
      towers,
      source: 'OpenCellID / Unwired Labs',
    });
  } catch (err) {
    console.error('existingTowers error:', err);
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
});