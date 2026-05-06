import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// HIFLD Electric Retail Service Territories — live ArcGIS FeatureServer
// Hosted publicly by NBAM_Org (Aug 2025 HIFLD snapshot, Oak Ridge National Lab source).
// Covers IOUs, municipal utilities, and electric co-ops nationwide with full
// utility metadata (name, type, contact, holding company, peak demand, customers).
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
      spatialRel: "esriSpatialRelIntersects",
      outFields: "NAME,TYPE,STATE,HOLDING_CO,WEBSITE,TELEPHONE,REGULATED,CNTRL_AREA,CUSTOMERS,YEAR",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "5",
    });

    const res = await fetch(`${HIFLD_URL}?${params}`);
    if (!res.ok) {
      console.error(`HIFLD utility lookup failed: HTTP ${res.status}`);
      return Response.json({});
    }
    const data = await res.json();
    const features = data?.features || [];

    if (!features.length) {
      console.log(`HIFLD utility: no match for ${lat},${lon}`);
      return Response.json({});
    }

    // Point-in-polygon often returns multiple overlapping territories (e.g. an
    // IOU and a co-op covering the same area). Return the first as primary and
    // list the rest so the user can see all servicing utilities.
    const primary = features[0].attributes;
    const overlapping = features.slice(1).map(f => ({
      name: f.attributes.NAME,
      type: f.attributes.TYPE,
      holding_co: f.attributes.HOLDING_CO || null,
    }));

    const result = {
      utility_name: primary.NAME || null,
      utility_type: primary.TYPE || null,                     // INVESTOR OWNED, MUNICIPAL, COOPERATIVE, etc.
      holding_company: primary.HOLDING_CO || null,
      state: primary.STATE || null,
      website: primary.WEBSITE || null,
      telephone: primary.TELEPHONE || null,
      regulated: primary.REGULATED || null,
      control_area: primary.CNTRL_AREA || null,                // ERCO, MISO, PJM, etc.
      customers: primary.CUSTOMERS || null,
      data_year: primary.YEAR || null,
      source: "HIFLD (Oak Ridge National Lab)",
      overlapping_territories: overlapping.length ? overlapping : null,
    };

    console.log(`HIFLD utility: user=${user.email} → ${result.utility_name} (${result.utility_type})`);
    return Response.json(result);

  } catch (error) {
    console.error('electricUtilityLookup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});