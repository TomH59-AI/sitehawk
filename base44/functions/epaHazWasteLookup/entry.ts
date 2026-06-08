import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// EPA hazardous-waste / Superfund / RCRA proximity lookup. Spatial query against
// EPA's "Cleanups in my Community" hosted point layer (Superfund NPL, RCRA
// Corrective Action, and Brownfield sites in one layer) for any cleanup site
// within ~0.5 mi of the target. Used to pre-screen the 47 CFR 1.1307
// "hazardous waste site" trigger. Score/compliance only — silent failure →
// trigger stays manual.

const CIMC = "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Cleanups_in_my_Community_Sites/FeatureServer/0/query";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    const la = Number(lat), lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }

    // ~0.5 mi envelope around the point (degrees ≈ 0.0072).
    const d = 0.0072;
    const geometry = JSON.stringify({
      xmin: lo - d, ymin: la - d, xmax: lo + d, ymax: la + d,
      spatialReference: { wkid: 4326 },
    });
    const params = new URLSearchParams({
      f: "json",
      geometry,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "PRIMARY_NAME,SF_SITE_ID,SF_NPL_CODE,RCRA_HANDLER_ID,LOCATION_ADDRESS,CITY_NAME",
      returnGeometry: "false",
      resultRecordCount: "50",
    });

    const res = await fetch(`${CIMC}?${params.toString()}`);
    if (!res.ok) return Response.json({ hazwaste_present: false, hazwaste_count: 0, npl_count: 0, site_names: [] });
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];

    const names = [];
    const seen = new Set();
    let nplCount = 0;
    for (const f of features) {
      const a = f?.attributes || {};
      // NPL code "Y" / Superfund site id present → count as a Superfund/NPL site.
      if (a.SF_NPL_CODE === "Y" || a.SF_SITE_ID) nplCount++;
      const nm = a.PRIMARY_NAME;
      if (nm && !seen.has(nm)) { seen.add(nm); names.push(nm); }
    }

    return Response.json({
      hazwaste_present: features.length > 0,
      hazwaste_count: features.length,
      npl_count: nplCount,
      site_names: names.slice(0, 10),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});