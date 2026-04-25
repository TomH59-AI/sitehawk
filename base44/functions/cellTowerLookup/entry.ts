import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// FCC HIFLD Cellular Towers — free, no API key required
const HIFLD_URL = "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Cellular_Towers/FeatureServer/0/query";

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, radius_miles = 2 } = await req.json();

    if (!lat || !lon) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      distance: String(radius_miles),
      units: "esriSRUnit_StatuteMile",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "OWNER,TYPE,STRUCTHGT,LATITUDE,LONGITUDE",
      returnGeometry: "true",
      f: "geojson",
      resultRecordCount: "10",
    });

    const res = await fetch(`${HIFLD_URL}?${params}`);
    if (!res.ok) throw new Error(`HIFLD query failed: ${res.status}`);

    const fc = await res.json();
    const features = fc.features || [];

    const towers = features
      .map(f => {
        const [tlon, tlat] = f.geometry.coordinates;
        const dist = haversineMiles(lat, lon, tlat, tlon);
        return {
          operator: f.properties.OWNER || "Unknown",
          type: f.properties.TYPE || "Tower",
          distance_miles: parseFloat(dist.toFixed(2)),
          lat: tlat,
          lon: tlon,
          height_m: f.properties.STRUCTHGT || null,
        };
      })
      .sort((a, b) => a.distance_miles - b.distance_miles)
      .slice(0, 3);

    console.log(`HIFLD tower lookup: user=${user.email} lat=${lat} lon=${lon} → ${towers.length} towers found`);
    return Response.json({ towers });

  } catch (error) {
    console.error('cellTowerLookup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});