import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// USFWS listed (threatened/endangered) species CRITICAL HABITAT lookup.
// Spatial query against the USFWS Critical Habitat ArcGIS MapServer for any
// designated critical habitat polygon intersecting a small buffer around the
// target. Used to pre-screen the 47 CFR 1.1307 "listed species habitat" trigger.
// Score/compliance only — silent failure → trigger stays manual.

// USFWS FWS_Critical_Habitat MapServer (polygon + linear critical habitat layers).
const CH_POLY = "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Critical_Habitat/FeatureServer/0/query";
const CH_LINE = "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Critical_Habitat/FeatureServer/1/query";

async function queryLayer(url, lat, lon) {
  // ~0.5 mi envelope around the point (degrees ≈ 0.0072).
  const d = 0.0072;
  const geometry = JSON.stringify({
    xmin: lon - d, ymin: lat - d, xmax: lon + d, ymax: lat + d,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    f: "json",
    geometry,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "comname,sciname,status,listing_status",
    returnGeometry: "false",
    resultRecordCount: "50",
  });
  const res = await fetch(`${url}?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.features) ? data.features : [];
}

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

    const [poly, line] = await Promise.all([
      queryLayer(CH_POLY, la, lo).catch(() => []),
      queryLayer(CH_LINE, la, lo).catch(() => []),
    ]);
    const features = [...poly, ...line];

    const names = [];
    const seen = new Set();
    for (const f of features) {
      const a = f?.attributes || {};
      const nm = a.comname || a.sciname;
      if (nm && !seen.has(nm)) { seen.add(nm); names.push(nm); }
    }

    return Response.json({
      species_present: names.length > 0,
      species_count: names.length,
      species_names: names.slice(0, 10),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});