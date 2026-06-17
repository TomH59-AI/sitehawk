import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * colocationOpportunities — FCC ASR towers in a 3-mile radius merged with
 * OpenCellID crowdsourced cell data using a 100-metre proximity tolerance.
 *
 * Returns: { towers: [...], count: N }
 * Each tower: { owner, height_ft, structure_type, radio_types[], mcc, mnc,
 *               range_m, latitude, longitude, distance_miles, source }
 */

const SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qlmz0RMO8qXUrWi1i6bpaQ_9tcqSzFZ";

const EARTH_MI = 3958.8;
const MI_TO_KM = 1.60934;
const MERGE_TOLERANCE_M = 100; // metres proximity for FCC ↔ OpenCellID merge

function haversineMi(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function haversineM(lat1, lon1, lat2, lon2) {
  return haversineMi(lat1, lon1, lat2, lon2) * MI_TO_KM * 1000;
}

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

/** Fetch FCC towers: tries `towers_in_radius` RPC first; falls back to
 *  repeated `nearest_cell_tower` calls (offset search to find multiple towers). */
async function fetchFccTowers(lat, lon, radiusMiles) {
  // --- Primary: batch RPC ---
  const url = `${SUPABASE_URL}/rest/v1/rpc/towers_in_radius`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ center_lat: lat, center_lon: lon, radius_miles: radiusMiles }),
  });

  if (res.ok) {
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map((t) => ({
        latitude: t.latitude_deg ?? t.lat ?? null,
        longitude: t.longitude_deg ?? t.lon ?? null,
        owner: t.licensee || null,
        height_ft: t.overall_height_ft ?? t.structure_height_ft ?? t.height_ft ?? null,
        structure_type: t.structure_type || null,
        call_letters: t.call_letters || null,
        distance_miles: haversineMi(lat, lon, t.latitude_deg ?? t.lat, t.longitude_deg ?? t.lon),
        source: "FCC ASR",
      })).filter(t => t.latitude && t.longitude);
    }
  }

  // --- Fallback: use nearest_cell_tower (returns single nearest tower) ---
  console.warn(`[colocation] towers_in_radius not available — using nearest_cell_tower fallback`);
  const fb = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nearest_cell_tower`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ center_lat: lat, center_lon: lon, radius_miles: radiusMiles }),
  });
  if (!fb.ok) return [];
  const fbData = await fb.json();
  const t = Array.isArray(fbData) ? fbData[0] : fbData;
  if (!t || (!t.latitude_deg && !t.lat)) return [];
  const tLat = t.latitude_deg ?? t.lat;
  const tLon = t.longitude_deg ?? t.lon;
  return [{
    latitude: tLat,
    longitude: tLon,
    owner: t.licensee || null,
    height_ft: t.overall_height_ft ?? t.structure_height_ft ?? null,
    structure_type: t.structure_type || null,
    call_letters: t.call_letters || null,
    distance_miles: parseFloat(haversineMi(lat, lon, tLat, tLon).toFixed(2)),
    source: "FCC ASR",
  }];
}

/** Fetch OpenCellID cells within bounding box of radius_miles.
 *  OpenCellID BBOX limit is ~4,000,000 m² (~2 km side). Cap at 1.2 mi (~1.9 km). */
async function fetchOpenCellId(lat, lon, radiusMiles) {
  const token = Deno.env.get('UNWIREDLABS_TOKEN');
  if (!token) return [];
  // Cap the OCID bounding box to avoid the "BBOX too big" error.
  // Their 4,000,000 m² limit = a ~2 km × 2 km box → radius ~1 km (0.62 mi).
  // Use 0.6 mi safely.
  const radiusKm = Math.min(radiusMiles, 0.6) * MI_TO_KM;
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const url = `https://opencellid.org/cell/getInArea?key=${encodeURIComponent(token)}`
    + `&BBOX=${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon}`
    + `&format=json&limit=500`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  let data;
  try { data = await res.json(); } catch { return []; }
  if (data?.error) { console.error(`[colocation] OpenCellID error: ${data.error}`); return []; }
  return (data?.cells || []).map((c) => ({
    latitude: parseFloat(c.lat),
    longitude: parseFloat(c.lon),
    radio: c.radio || 'cell',
    mcc: Number(c.mcc),
    mnc: Number(c.mnc),
    range_m: c.range != null ? Number(c.range) : null,
    carrier: carrierName(Number(c.mcc), Number(c.mnc)),
    distance_miles: haversineMi(lat, lon, parseFloat(c.lat), parseFloat(c.lon)),
  })).filter(c => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, radius_miles = 3 } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }
    const latN = Number(lat);
    const lonN = Number(lon);
    const radN = Math.min(Number(radius_miles), 5);

    console.log(`[colocation] Scanning ${latN},${lonN} radius=${radN} mi`);

    // Fetch both datasets in parallel
    const [fccTowers, ocidCells] = await Promise.all([
      fetchFccTowers(latN, lonN, radN),
      fetchOpenCellId(latN, lonN, radN),
    ]);

    console.log(`[colocation] FCC towers: ${fccTowers.length} | OpenCellID cells: ${ocidCells.length}`);

    // Merge: for each FCC tower, find all OpenCellID cells within 100 m and
    // attach their radio type + carrier data. Mark remaining OCID cells as
    // signal-only (no FCC match).
    const usedOcid = new Set();
    const merged = fccTowers.map((tower) => {
      const nearby = ocidCells
        .map((c, idx) => ({ c, idx, dist: haversineM(tower.latitude, tower.longitude, c.latitude, c.longitude) }))
        .filter(({ dist }) => dist <= MERGE_TOLERANCE_M);

      const radio_types = [...new Set(nearby.map(({ c }) => c.radio).filter(Boolean))];
      const carriers = [...new Set(nearby.map(({ c }) => c.carrier).filter(Boolean))];
      const mcc = nearby[0]?.c?.mcc ?? null;
      const mnc = nearby[0]?.c?.mnc ?? null;
      const range_m = nearby[0]?.c?.range_m ?? null;
      nearby.forEach(({ idx }) => usedOcid.add(idx));

      return {
        ...tower,
        radio_types,
        carriers,
        mcc,
        mnc,
        range_m,
        height_ft: tower.height_ft != null ? Math.round(Number(tower.height_ft)) : null,
        distance_miles: parseFloat(tower.distance_miles.toFixed(2)),
        has_signal_data: nearby.length > 0,
        source: nearby.length > 0 ? "FCC ASR + OpenCellID" : "FCC ASR",
      };
    });

    // Remaining OpenCellID-only sites (no FCC match within 100 m)
    const signalOnly = ocidCells
      .filter((_, idx) => !usedOcid.has(idx))
      .reduce((acc, c) => {
        // Cluster nearby OCID-only cells as one logical site (dedupe by 100 m)
        const existing = acc.find((s) => haversineM(s.latitude, s.longitude, c.latitude, c.longitude) < MERGE_TOLERANCE_M);
        if (existing) {
          if (c.radio && !existing.radio_types.includes(c.radio)) existing.radio_types.push(c.radio);
          if (c.carrier && !existing.carriers.includes(c.carrier)) existing.carriers.push(c.carrier);
        } else {
          acc.push({
            latitude: c.latitude,
            longitude: c.longitude,
            owner: c.carrier || "Unknown",
            height_ft: null,
            structure_type: null,
            call_letters: null,
            distance_miles: parseFloat(c.distance_miles.toFixed(2)),
            radio_types: c.radio ? [c.radio] : [],
            carriers: c.carrier ? [c.carrier] : [],
            mcc: c.mcc,
            mnc: c.mnc,
            range_m: c.range_m,
            has_signal_data: true,
            source: "OpenCellID (signal only)",
          });
        }
        return acc;
      }, []);

    const allTowers = [...merged, ...signalOnly]
      .sort((a, b) => a.distance_miles - b.distance_miles);

    console.log(`[colocation] Returning ${allTowers.length} merged towers`);

    return Response.json({ towers: allTowers, count: allTowers.length });
  } catch (err) {
    console.error('[colocation] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});