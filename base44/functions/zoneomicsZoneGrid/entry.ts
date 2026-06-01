import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * zoneomicsZoneGrid — sample the Zoneomics zoneDetail API at a grid of points
 * around Target A and return, for each cell, the resolved zone code/name/type.
 *
 * WHY: the Zoneomics raster Tiling Service (the only thing that paints zoning
 * colors directly onto the map) requires the paid tile tier, which is not
 * available on this key — so the Section 4 Zoning Map showed a bare satellite
 * with no visible classifications. zoneDetail (point lookup) DOES work on this
 * key, so we sample a grid of points, get the real district at each, and the
 * frontend draws a colored polygon cell per point + a legend built from the
 * distinct districts. All colors/data come straight from the Zoneomics API.
 *
 * Payload: { lat, lng, radius_miles? (default 0.4), grid? (odd int, default 7) }
 * Returns: { ok, cells: [{ lat, lng, zone_code, zone_name, zone_type }],
 *            districts: [{ zone_code, zone_name, zone_type }], cell_deg, count }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('ZONEOMICS_API_KEY');
    if (!apiKey) return Response.json({ error: 'ZONEOMICS_API_KEY not set' }, { status: 500 });

    const body = await req.json();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const radiusMiles = Number(body.radius_miles ?? 0.4);
    let grid = parseInt(body.grid ?? 7, 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: 'lat and lng required' }, { status: 400 });
    }
    if (!Number.isFinite(grid) || grid < 3) grid = 7;
    if (grid > 9) grid = 9;            // cap call volume (9x9 = 81 max)
    if (grid % 2 === 0) grid += 1;     // keep it odd so the center is Target A

    // Convert the radius to a degree half-span. 1 deg lat ≈ 69 miles;
    // longitude shrinks by cos(lat).
    const halfLat = radiusMiles / 69;
    const halfLng = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180) || 1);
    const stepLat = (2 * halfLat) / (grid - 1);
    const stepLng = (2 * halfLng) / (grid - 1);
    const cellLatDeg = stepLat;        // cell size (height) for the frontend squares
    const cellLngDeg = stepLng;

    // Build the sample points.
    const points = [];
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        points.push({
          lat: lat - halfLat + r * stepLat,
          lng: lng - halfLng + c * stepLng,
        });
      }
    }

    // Query zoneDetail for each point, in small concurrency batches.
    async function lookup(pt) {
      try {
        const url = new URL('https://api.zoneomics.com/v2/zoneDetail');
        url.searchParams.set('api_key', apiKey);
        url.searchParams.set('lat', String(pt.lat));
        url.searchParams.set('lng', String(pt.lng));
        url.searchParams.set('output_fields', 'zoning');
        const res = await fetch(url.toString());
        if (!res.ok) return { ...pt, zone_code: '', zone_name: '', zone_type: '', status: res.status };
        const json = await res.json();
        const zd = json?.data?.zone_details || json?.data?.data?.zone_details || null;
        return {
          ...pt,
          zone_code: zd?.zone_code || '',
          zone_name: zd?.zone_name || '',
          zone_type: zd?.zone_type || '',
          status: res.status,
        };
      } catch (_) {
        return { ...pt, zone_code: '', zone_name: '', zone_type: '', status: 0 };
      }
    }

    const cells = [];
    const BATCH = 8;
    for (let i = 0; i < points.length; i += BATCH) {
      const batch = points.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(lookup));
      cells.push(...results);
    }

    // Distinct districts (drop empties) for the legend.
    const seen = new Map();
    for (const cell of cells) {
      if (!cell.zone_code || seen.has(cell.zone_code)) continue;
      seen.set(cell.zone_code, {
        zone_code: cell.zone_code,
        zone_name: cell.zone_name,
        zone_type: cell.zone_type,
      });
    }

    const hits = cells.filter((c) => c.zone_code).length;
    console.log(`[ZONE GRID] ${grid}x${grid} samples · ${hits}/${cells.length} resolved · ${seen.size} districts`);

    return Response.json({
      ok: true,
      cells: cells.filter((c) => c.zone_code),   // only colored cells matter to the map
      districts: Array.from(seen.values()),
      cell_lat_deg: cellLatDeg,
      cell_lng_deg: cellLngDeg,
      grid,
      count: hits,
    });
  } catch (error) {
    console.error('zoneomicsZoneGrid error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});