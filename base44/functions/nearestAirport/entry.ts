import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// FAA Aeronautical Information Services via ArcGIS — free, no key, updated every 8 weeks
// Fields: IDENT (FAA/call letters), ICAO_ID, NAME, SERVCITY, STATE, TYPE_CODE, LATITUDE, LONGITUDE
const FAA_AIRPORT_URL = "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/US_Airport/FeatureServer/0/query";

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Parse FAA DMS coordinate strings like "28-25-30.0000N" → decimal degrees
function parseDMS(dms) {
  if (!dms) return null;
  const match = dms.match(/(\d+)-(\d+)-([\d.]+)([NSEW])/);
  if (!match) return null;
  const [, deg, min, sec, dir] = match;
  let decimal = parseFloat(deg) + parseFloat(min) / 60 + parseFloat(sec) / 3600;
  if (dir === 'S' || dir === 'W') decimal = -decimal;
  return decimal;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, radius_miles = 30 } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon are required' }, { status: 400 });

    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      distance: String(radius_miles),
      units: "esriSRUnit_StatuteMile",
      spatialRel: "esriSpatialRelIntersects",
      // Only operational, public-use airports (exclude private, military, closed)
      where: "OPERSTATUS = 'O' AND PRIVATEUSE = 0",
      outFields: "IDENT,ICAO_ID,NAME,SERVCITY,STATE,TYPE_CODE,LATITUDE,LONGITUDE",
      returnGeometry: "true",
      f: "geojson",
      resultRecordCount: "10",
    });

    const res = await fetch(`${FAA_AIRPORT_URL}?${params}`);
    if (!res.ok) throw new Error(`FAA airport query failed: ${res.status}`);

    const fc = await res.json();
    const features = fc.features || [];

    if (!features.length) {
      console.warn(`No FAA airports found within ${radius_miles} mi of ${lat},${lon}`);
      return Response.json({});
    }

    // Compute distance for each and pick nearest
    const withDist = features.map(f => {
      const [flon, flat] = f.geometry.coordinates;
      const p = f.properties;
      const dist = haversineMiles(lat, lon, flat, flon);

      // Parse DMS coords from attributes (more precise than geometry for FAA data)
      const precLat = parseDMS(p.LATITUDE) ?? flat;
      const precLon = parseDMS(p.LONGITUDE) ?? flon;

      return {
        iata: p.IDENT || null,
        icao: p.ICAO_ID || null,
        name: p.NAME || null,
        city: p.SERVCITY || null,
        state: p.STATE || null,
        type: p.TYPE_CODE || null,
        lat: precLat,
        lon: precLon,
        distance_miles: parseFloat(dist.toFixed(2)),
        address: [p.SERVCITY, p.STATE].filter(Boolean).join(', '),
      };
    }).sort((a, b) => a.distance_miles - b.distance_miles);

    const nearest = withDist[0];
    console.log(`FAA airport: user=${user.email} → ${nearest.iata} (${nearest.name}) ${nearest.distance_miles} mi`);

    return Response.json(nearest);

  } catch (error) {
    console.error('nearestAirport error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});