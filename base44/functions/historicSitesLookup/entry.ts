import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// NPS National Register of Historic Places (NRHP) — official federal listed-sites
// point layer (CRGIS). Used to count historic properties within 0.5 mi of a target
// for the Section 106 / NEPA compliance pre-screen (47 CFR 1.1307 historic trigger).
const NRHP_QUERY_URL =
  "https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/0/query";

// Half a mile expressed in meters for the ArcGIS distance buffer.
const HALF_MILE_METERS = 804.672;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    // Spatial query: NRHP points within 0.5 mi of the target coordinate.
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      distance: String(HALF_MILE_METERS),
      units: "esriSRUnit_Meter",
      outFields: "RESNAME,State,County,ResType",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "25",
    });

    const res = await fetch(`${NRHP_QUERY_URL}?${params}`);
    if (!res.ok) throw new Error(`NRHP query failed: ${res.status}`);

    const data = await res.json();
    const features = data.features || [];
    const sites = features
      .map((f) => f.attributes?.RESNAME)
      .filter(Boolean)
      .slice(0, 10);

    console.log(`NRHP: ${features.length} historic site(s) within 0.5 mi of ${lat},${lon} user=${user.email}`);

    return Response.json({
      historic_present: features.length > 0,
      historic_count: features.length,
      site_names: sites,
    });
  } catch (error) {
    console.error('historicSitesLookup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});