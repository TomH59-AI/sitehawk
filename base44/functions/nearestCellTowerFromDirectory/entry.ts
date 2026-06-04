import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * nearestCellTowerFromDirectory — finds the nearest cellular site to a lat/lon
 * from the imported CellularSite entity (~4,066 US sites). Mirrors
 * nearestAirportFromDirectory: an expanding bounding-box prefilter so we never
 * scan the whole table, then exact haversine distance locally, returning the
 * closest site with distance in miles + feet.
 */

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    const cLat = Number(lat);
    const cLon = Number(lon);
    if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }

    // Expanding bbox search: start at ~0.3deg (~20mi), grow until we get hits.
    const deltas = [0.3, 0.6, 1.2, 2.5, 5.0];
    let candidates = [];
    for (const d of deltas) {
      const raw = await base44.asServiceRole.entities.CellularSite.filter({
        latitude: { $gte: cLat - d, $lte: cLat + d },
        longitude: { $gte: cLon - d, $lte: cLon + d },
      }, null, 2000);
      candidates = (raw || []).filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
      if (candidates.length > 0) break;
    }

    if (!candidates || candidates.length === 0) {
      return Response.json({ match: null });
    }

    let best = null;
    let bestMi = Infinity;
    for (const s of candidates) {
      const mi = haversineMiles(cLat, cLon, s.latitude, s.longitude);
      if (mi < bestMi) {
        bestMi = mi;
        best = s;
      }
    }

    const distance_miles = parseFloat(bestMi.toFixed(2));
    const distance_feet = Math.round(bestMi * 5280);

    return Response.json({
      match: {
        site_name: best.site_name,
        asr_number: best.asr_number,
        market: best.market,
        site_address: best.site_address,
        city: best.city,
        state: best.state,
        county: best.county,
        latitude: best.latitude,
        longitude: best.longitude,
        distance_miles,
        distance_feet,
      },
      candidates_scanned: candidates.length,
    });
  } catch (error) {
    console.log(`[ERROR] nearestCellTowerFromDirectory: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});