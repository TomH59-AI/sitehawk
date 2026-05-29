import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * fccAmTowerQuery — queries the FCC AM broadcast station database for AM towers
 * near a Target A cell tower location and flags potential RF interference.
 *
 * Source: FCC AM Query (https://transition.fcc.gov/fcc-bin/amq) — pipe-delimited
 * "list=4" output. We convert the lat/lon to deg/min/sec, request stations
 * within `dist` km, parse the rows, dedupe by station call sign (keeping the
 * closest record), and return distance + an interference flag.
 *
 * Interference heuristic: AM broadcast towers radiate high power on the MF band.
 * Co-location / very close proximity (< 0.5 mi) of a tall cell tower can cause
 * reradiation/detuning issues that the FCC requires study for. We flag:
 *   - "high"   when any AM tower is within 0.5 mi (detuning study likely required)
 *   - "moderate" when within 2 mi (proximity worth noting)
 *   - "low"    otherwise (informational)
 */

// Convert decimal degrees → { d, m, s } for the FCC form.
function toDMS(dec) {
  const abs = Math.abs(dec);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = ((mFloat - m) * 60).toFixed(1);
  return { d, m, s };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, dist_km = 30 } = await req.json();
    const cLat = Number(lat);
    const cLon = Number(lon);
    if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }

    const latDMS = toDMS(cLat);
    const lonDMS = toDMS(cLon);
    const NS = cLat >= 0 ? 'N' : 'S';
    const EW = cLon >= 0 ? 'E' : 'W';

    const params = new URLSearchParams({
      state: '', call: '', arn: '', city: '',
      freq: '530', fre2: '1700', type: '0', facid: '', class: '',
      list: '4', dist: String(dist_km),
      dlat2: String(latDMS.d), mlat2: String(latDMS.m), slat2: String(latDMS.s), NS,
      dlon2: String(lonDMS.d), mlon2: String(lonDMS.m), slon2: String(lonDMS.s), EW,
      size: '9',
    });

    const url = `https://transition.fcc.gov/fcc-bin/amq?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'SiteHawk/1.0' } });
    if (!res.ok) {
      return Response.json({ error: `FCC AM query failed (HTTP ${res.status})`, towers: [] }, { status: 502 });
    }
    const text = await res.text();

    // Parse pipe-delimited rows. Columns after f = c.slice(1):
    // 0 call, 1 freq, 4 hours-code, 5 hours, 9 city, 10 state, 12 file#,
    // 13 power, 14 directional, 15 class, 18 lat-dir, 19 latD, 20 latM,
    // 21 latS, 22 lon-dir, 23 lonD, 24 lonM, 25 lonS, 26 licensee,
    // 27 km, 28 mi, 29 bearing-deg
    const towers = [];
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('|')) continue;
      const c = line.split('|').map((s) => s.trim());
      // Index 0 is empty (line starts with |), so shift by 1.
      const f = c.slice(1);
      if (f.length < 30) continue;
      const call = f[0];
      if (!call) continue;

      const latD = parseFloat(f[19]); const latM = parseFloat(f[20]); const latS = parseFloat(f[21]);
      const lonD = parseFloat(f[23]); const lonM = parseFloat(f[24]); const lonS = parseFloat(f[25]);
      const latSign = f[18] === 'S' ? -1 : 1;
      const lonSign = f[22] === 'W' ? -1 : 1;
      const tLat = latSign * (latD + latM / 60 + latS / 3600);
      const tLon = lonSign * (lonD + lonM / 60 + lonS / 3600);

      const miles = parseFloat(f[28]);

      towers.push({
        call,
        frequency: (f[1] || '').replace(/\s+/g, ' ').trim(),
        hours: f[5],
        city: f[9],
        state: f[10],
        power: (f[13] || '').replace(/\s+/g, ' ').trim(),
        directional: f[14] || 'Non-directional',
        licensee: f[26],
        latitude: Number.isFinite(tLat) ? tLat : null,
        longitude: Number.isFinite(tLon) ? tLon : null,
        distance_miles: Number.isFinite(miles) ? miles : null,
        bearing_deg: parseFloat(f[29]) || null,
      });
    }

    // Dedupe by call sign keeping the closest record (DAY/NIG produce duplicates).
    const byCall = new Map();
    for (const t of towers) {
      const prev = byCall.get(t.call);
      if (!prev || (t.distance_miles ?? Infinity) < (prev.distance_miles ?? Infinity)) {
        byCall.set(t.call, t);
      }
    }
    const unique = Array.from(byCall.values()).sort(
      (a, b) => (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity)
    );

    const nearest = unique[0] || null;
    let interference_level = 'none';
    let interference_note = 'No AM broadcast towers found within the search radius.';
    if (nearest && nearest.distance_miles != null) {
      const d = nearest.distance_miles;
      if (d < 0.5) {
        interference_level = 'high';
        interference_note = `AM tower ${nearest.call} is ${d} mi away. At this proximity, FCC §1.30002 / §73.1692 may require a detuning/reradiation study before tower construction.`;
      } else if (d < 2) {
        interference_level = 'moderate';
        interference_note = `AM tower ${nearest.call} is ${d} mi away. Proximity is close enough to warrant an RF reradiation review.`;
      } else {
        interference_level = 'low';
        interference_note = `Nearest AM tower ${nearest.call} is ${d} mi away — unlikely to interfere, but documented for the record.`;
      }
    }

    return Response.json({
      towers: unique,
      nearest,
      count: unique.length,
      interference_level,
      interference_note,
    });
  } catch (error) {
    console.log(`[ERROR] fccAmTowerQuery: ${error.message}`);
    return Response.json({ error: error.message, towers: [] }, { status: 500 });
  }
});