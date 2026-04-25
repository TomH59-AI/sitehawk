import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// HIFLD Cell Towers — public ArcGIS service, no key required
// Primary + fallback endpoints in case of 400/service changes
const HIFLD_URLS = [
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Cellular_Towers/FeatureServer/0/query",
  "https://services7.arcgis.com/n1YM8pTrFmm7L4hs/arcgis/rest/services/CellTowers_Public/FeatureServer/0/query",
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

async function queryTowers(url, lat, lon, radiusMiles, outFields) {
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
  const res = await fetch(`${url}?${params}`);
  if (!res.ok) {
    console.warn(`Tower query to ${url} returned ${res.status}`);
    return null;
  }
  const fc = await res.json();
  return fc?.features || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, radius_miles = 2 } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon are required' }, { status: 400 });

    // Try primary endpoint
    let features = await queryTowers(
      HIFLD_URLS[0], lat, lon, radius_miles,
      "OWNER,TYPE,STRUCTHGT,LATITUDE,LONGITUDE"
    );

    // Try fallback endpoint if primary fails or returns empty
    if (!features || features.length === 0) {
      console.log(`Trying fallback cell tower endpoint for ${lat},${lon}`);
      features = await queryTowers(
        HIFLD_URLS[1], lat, lon, radius_miles,
        "*"
      );
    }

    if (!features || features.length === 0) {
      console.log(`No towers found within ${radius_miles} mi of ${lat},${lon}`);
      return Response.json({ towers: [] });
    }

    const towers = features
      .map(f => {
        if (!f.geometry?.coordinates) return null;
        const [tlon, tlat] = f.geometry.coordinates;
        const p = f.properties;
        const dist = haversineMiles(lat, lon, tlat, tlon);
        return {
          operator: p.OWNER || p.owner || "Unknown",
          type: p.TYPE || p.type || "Tower",
          distance_miles: parseFloat(dist.toFixed(2)),
          lat: tlat,
          lon: tlon,
          height_m: p.STRUCTHGT || p.structhgt || null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance_miles - b.distance_miles)
      .slice(0, 3);

    console.log(`Cell tower lookup: user=${user.email} lat=${lat} lon=${lon} → ${towers.length} towers found`);
    return Response.json({ towers });

  } catch (error) {
    console.error('cellTowerLookup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});