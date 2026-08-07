/**
 * parcelFrontage — road centerlines near a parcel, for TalonFit edge typing.
 *
 * Returns the mapped roads within a small buffer of the parcel so the client can
 * type each property line as front / side / rear (see src/lib/frontageDetect.ts).
 * The typing math deliberately lives client-side in one tested place rather than
 * being duplicated here — this function only fetches.
 *
 * Service roads, driveways and tracks are excluded: a driveway is not frontage,
 * and treating one as a street would apply the front setback to the wrong line.
 *
 * POST { lat, lon, radius_ft?, bbox? } -> { roads: [{ coords:[[lon,lat]...], name, klass }] }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// Road classes that can carry frontage. 'service' and 'track' are excluded on
// purpose — driveways and field tracks are not street frontage.
const FRONTAGE_CLASSES = [
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    // A parcel plus a frontage buffer. 800 ft covers a large lot and its street
    // without pulling in the whole neighbourhood.
    const radiusFt = Math.max(200, Math.min(Number(body.radius_ft) || 800, 3000));
    const degLat = radiusFt / 364000;
    const degLon = degLat / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
    const south = lat - degLat;
    const north = lat + degLat;
    const west = lon - degLon;
    const east = lon + degLon;

    const query = `[out:json][timeout:25];
way["highway"~"^(${FRONTAGE_CLASSES.join('|')})$"](${south},${west},${north},${east});
out geom;`;

    let data = null;
    let lastStatus = 0;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': 'SiteHawk/1.0 (TalonFit frontage detection)',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(30000),
        });
        lastStatus = res.status;
        if (res.ok) {
          data = await res.json();
          break;
        }
        console.warn(`[parcelFrontage] Overpass ${res.status} from ${endpoint}`);
      } catch (e) {
        console.warn(`[parcelFrontage] ${endpoint} failed: ${String(e?.message || e).slice(0, 120)}`);
      }
    }

    if (!data) {
      // A fetch failure is NOT "no roads" — the caller must fall back to
      // default_side rather than concluding the parcel has no frontage.
      return Response.json(
        { error: `Overpass unavailable (last status ${lastStatus || 'no response'})`, roads: [], available: false },
        { status: 502 }
      );
    }

    const roads = (data.elements || [])
      .filter((el) => el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2)
      .map((el) => ({
        coords: el.geometry.map((g) => [g.lon, g.lat]),
        name: el.tags?.name || null,
        klass: el.tags?.highway || null,
      }));

    console.log(`[parcelFrontage] ${roads.length} road(s) near ${lat.toFixed(5)},${lon.toFixed(5)}`);
    return Response.json({ roads, available: true, radius_ft: radiusFt, bbox: { south, west, north, east } });
  } catch (error) {
    console.error('[parcelFrontage] error:', error?.message || String(error));
    return Response.json({ error: String(error?.message || error), roads: [], available: false }, { status: 500 });
  }
}
