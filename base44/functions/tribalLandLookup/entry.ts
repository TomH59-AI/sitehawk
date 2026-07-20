import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Tribal land pre-screen for the NEPA "Indian Religious Site" trigger context.
// Primary: BIA Land Area Representation (LAR) — authoritative federal Indian
// reservation / trust land boundaries. Fallback: US Census TIGERweb AIANNHA.
// Checks the exact point AND a ~0.5 mile envelope (same posture as the other
// quiet compliance lookups). A hit means THPO/TCNS review is likely required —
// it is a flag, not a determination.

const BIA_LAR_URL = "https://biamaps.geoplatform.gov/server/rest/services/DivLTR/BIA_AIAN_National_LAR/MapServer/0/query";
const CENSUS_AIANNHA_IDENTIFY = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/AIANNHA/MapServer/identify";

const HALF_MILE_DEG = 0.0073; // ~0.5 mile in degrees latitude

async function queryBia(lat, lon, useEnvelope) {
  const params = new URLSearchParams({
    geometryType: useEnvelope ? "esriGeometryEnvelope" : "esriGeometryPoint",
    geometry: useEnvelope
      ? JSON.stringify({ xmin: lon - HALF_MILE_DEG, ymin: lat - HALF_MILE_DEG, xmax: lon + HALF_MILE_DEG, ymax: lat + HALF_MILE_DEG, spatialReference: { wkid: 4326 } })
      : JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
    resultRecordCount: "3",
    f: "json",
  });
  const r = await fetch(`${BIA_LAR_URL}?${params}`);
  if (!r.ok) throw new Error(`BIA LAR HTTP ${r.status}`);
  const data = await r.json();
  if (data?.error) throw new Error(`BIA LAR: ${data.error.message}`);
  const feats = data?.features || [];
  return feats.map((f) => {
    const a = f.attributes || {};
    return a.LARNAME || a.LARName || a.NAME || null;
  }).filter(Boolean);
}

async function queryCensus(lat, lon, useEnvelope) {
  const buf = useEnvelope ? HALF_MILE_DEG : 0.0002;
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: "all",
    tolerance: useEnvelope ? "50" : "2",
    mapExtent: `${lon - buf},${lat - buf},${lon + buf},${lat + buf}`,
    imageDisplay: "400,400,96",
    returnGeometry: "false",
    f: "json",
  });
  const r = await fetch(`${CENSUS_AIANNHA_IDENTIFY}?${params}`);
  if (!r.ok) throw new Error(`Census AIANNHA HTTP ${r.status}`);
  const data = await r.json();
  const results = data?.results || [];
  return [...new Set(results.map((x) => x.attributes?.NAME || x.attributes?.BASENAME).filter(Boolean))];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (lat == null || lon == null) return Response.json({ error: 'lat and lon required' }, { status: 400 });

    let source = "BIA LAR";
    let onSite = [];
    let nearby = [];
    try {
      onSite = await queryBia(Number(lat), Number(lon), false);
      nearby = onSite.length ? [] : await queryBia(Number(lat), Number(lon), true);
    } catch (biaErr) {
      console.warn('tribalLandLookup BIA failed, falling back to Census:', biaErr.message);
      source = "Census TIGERweb AIANNHA";
      onSite = await queryCensus(Number(lat), Number(lon), false);
      nearby = onSite.length ? [] : await queryCensus(Number(lat), Number(lon), true);
    }

    const present = onSite.length > 0 || nearby.length > 0;
    const names = onSite.length ? onSite : nearby;
    console.log(`tribalLandLookup: ${lat},${lon} → present=${present} on_site=${onSite.length > 0} names=${names.join('; ')} source=${source}`);

    return Response.json({
      tribal_present: present,
      on_site: onSite.length > 0,
      proximity: onSite.length > 0 ? "on-site" : (nearby.length > 0 ? "within ~0.5 mi" : null),
      names,
      source,
    });
  } catch (error) {
    console.error('tribalLandLookup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});