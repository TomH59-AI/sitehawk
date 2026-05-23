import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// FAA Digital-NASR airport data via ArcGIS — free, no key
// Updated endpoint: US_Airport layer from FAA's ArcGIS Online
const FAA_URLS = [
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/US_Airport/FeatureServer/0/query",
  "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Airports_by_scale/FeatureServer/0/query",
];

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

async function tryFAAQuery(url, lat, lon, radiusMiles, whereClause, outFields) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    distance: String(radiusMiles),
    units: "esriSRUnit_StatuteMile",
    spatialRel: "esriSpatialRelIntersects",
    outFields,
    returnGeometry: "true",
    f: "geojson",
    resultRecordCount: "10",
  });
  if (whereClause) params.set("where", whereClause);

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) return null;
  const fc = await res.json();
  return fc?.features || [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, radius_miles = 40 } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon are required' }, { status: 400 });

    // FAA NASR layer mixes commercial airports, private airparks, and heliports.
    // Server-side filter to fixed-wing public airports with an ICAO ID (KRDU, KJFK, etc.) —
    // private airparks have TYPE_CODE='AD' with no ICAO; heliports have TYPE_CODE='HP'.
    let features = await tryFAAQuery(
      FAA_URLS[0], lat, lon, radius_miles,
      "TYPE_CODE = 'AD' AND ICAO_ID IS NOT NULL",
      "IDENT,ICAO_ID,NAME,SERVCITY,STATE,TYPE_CODE,LATITUDE,LONGITUDE"
    );

    // Auto-expand search radius if no public IFR airport found — RDU/KRDU might be 30-50 mi away
    if ((!features || features.length === 0) && radius_miles < 75) {
      console.log(`FAA expanding radius to 75mi for ${lat},${lon}`);
      features = await tryFAAQuery(
        FAA_URLS[0], lat, lon, 75,
        "TYPE_CODE = 'AD' AND ICAO_ID IS NOT NULL",
        "IDENT,ICAO_ID,NAME,SERVCITY,STATE,TYPE_CODE,LATITUDE,LONGITUDE"
      );
    }

    // Final fallback — drop ICAO filter, just exclude heliports
    if (!features || features.length === 0) {
      console.log(`FAA fallback without ICAO filter for ${lat},${lon}`);
      features = await tryFAAQuery(
        FAA_URLS[0], lat, lon, Math.max(radius_miles, 75),
        "TYPE_CODE = 'AD'",
        "IDENT,ICAO_ID,NAME,SERVCITY,STATE,TYPE_CODE,LATITUDE,LONGITUDE"
      );
    }

    // Try backup endpoint
    if (!features || features.length === 0) {
      console.log(`FAA trying backup endpoint for ${lat},${lon}`);
      features = await tryFAAQuery(
        FAA_URLS[1], lat, lon, radius_miles,
        null,
        "IATA,ICAO,AIRPORT_NAME,CITY,STATE_NAME,TYPE,LATITUDE,LONGITUDE"
      );
    }

    if (!features || features.length === 0) {
      console.warn(`No FAA airports found within ${radius_miles} mi of ${lat},${lon}`);
      return Response.json({});
    }

    // Compute distance for each and pick nearest public airport (exclude heliports/hospitals/private pads)
    const withDist = features.map(f => {
      const coords = f.geometry?.coordinates;
      if (!coords) return null;
      const [flon, flat] = coords;
      const p = f.properties;
      const dist = haversineMiles(lat, lon, flat, flon);

      // Handle both endpoint field name variants
      const iata = p.IDENT || p.IATA || null;
      const icao = p.ICAO_ID || p.ICAO || null;
      const name = p.NAME || p.AIRPORT_NAME || null;
      const city = p.SERVCITY || p.CITY || null;
      const state = p.STATE || p.STATE_NAME || null;
      const type = String(p.TYPE_CODE || p.TYPE || '').toLowerCase();
      const label = `${name || ''} ${type}`.toLowerCase();

      // Exclude heliports, hospitals, medical pads, seaplanes, gliderports, balloonports,
      // ultralight strips, private airparks, and closed airfields.
      if (label.includes('heliport') || label.includes('hospital') || label.includes('medical') ||
          label.includes('healthplex') || label.includes('seaplane') || label.includes('gliderport') ||
          label.includes('balloonport') || label.includes('ultralight') ||
          label.includes('airpark')) return null;
      if (label.includes('private') || label.includes('closed') || label.includes('restricted')) return null;
      // Strict FAA identifier filter — public fixed-wing airports use either:
      //   - 3-letter IATA (e.g. RDU, JFK, ATL)
      //   - 4-letter ICAO starting with K (e.g. KRDU, KJFK)
      // Heliports and private fields use IDs like 2NR4, NC11, 1A7 — reject any ID with digits.
      if (iata && /\d/.test(iata) && !/^[A-Z]{3}$/.test(iata)) return null;

      return { iata, icao, name, city, state, lat: flat, lon: flon, distance_miles: parseFloat(dist.toFixed(2)) };
    }).filter(Boolean).sort((a, b) => a.distance_miles - b.distance_miles);

    if (!withDist.length) {
      console.warn(`No public airports found within ${radius_miles} mi of ${lat},${lon}`);
      return Response.json({});
    }

    const nearest = withDist[0];
    console.log(`FAA airport: user=${user.email} → ${nearest.iata || nearest.icao} (${nearest.name}) ${nearest.distance_miles} mi`);
    return Response.json(nearest);

  } catch (error) {
    console.error('nearestAirport error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});