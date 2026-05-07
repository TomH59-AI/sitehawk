import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// HIFLD Electric Retail Service Territories — returns geometry for map overlay.
// Same FeatureServer used by electricUtilityLookup, but with returnGeometry=true
// and geojson output so Mapbox can render the polygons directly.
const HIFLD_URL = "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon are required' }, { status: 400 });

    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "NAME,TYPE,HOLDING_CO,WEBSITE,TELEPHONE,CNTRL_AREA,CUSTOMERS",
      returnGeometry: "true",
      f: "geojson",
      resultRecordCount: "10",
    });

    const res = await fetch(`${HIFLD_URL}?${params}`);
    if (!res.ok) {
      console.error(`HIFLD territory fetch failed: HTTP ${res.status}`);
      return Response.json({ type: "FeatureCollection", features: [] });
    }
    const fc = await res.json();
    const features = fc?.features || [];

    console.log(`HIFLD territory: user=${user.email} → ${features.length} polygon(s) at ${lat},${lon}`);
    return Response.json({ type: "FeatureCollection", features });

  } catch (error) {
    console.error('electricUtilityTerritory error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});