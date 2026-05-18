import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// USFWS National Wetlands Inventory (NWI) — official federal wetlands data
const NWI_QUERY_URL = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query";
const NWI_IDENTIFY_URL = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/identify";
const NWI_EXPORT_URL = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export";
const NWI_TOPO_EXPORT_URL = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/WetlandsTopo/Wetlands_Topo_Service/MapServer/export";

// Build a static map export URL for a given bbox buffer (in degrees)
function buildExportUrl(baseUrl, lat, lon, bufferDeg) {
  const params = new URLSearchParams({
    bbox: `${lon - bufferDeg},${lat - bufferDeg},${lon + bufferDeg},${lat + bufferDeg}`,
    bboxSR: "4326",
    imageSR: "3857",
    size: "1700,2200",
    dpi: "200",
    format: "png32",
    transparent: "false",
    f: "image",
  });
  return `${baseUrl}?${params}`;
}

// Run NWI Identify to extract wetland_type / wetland_code / wetland_acres at a point
async function identifyAtPoint(lat, lon) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: "all",
    tolerance: "2",
    mapExtent: "-180,-90,180,90",
    imageDisplay: "600,400,96",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${NWI_IDENTIFY_URL}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const results = data.results || [];
  if (!results.length) return null;
  const a = results[0].attributes || {};
  return {
    wetland_type: a.WETLAND_TYPE || a["WETLAND_TYPE"] || null,
    wetland_code: a.ATTRIBUTE || a["ATTRIBUTE"] || null,
    wetland_acres: a.ACRES ? parseFloat(parseFloat(a.ACRES).toFixed(2)) : null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon are required' }, { status: 400 });

    // Always compute the three map URLs — they're parameterized exports and free to generate
    const wetlands_map_url = buildExportUrl(NWI_EXPORT_URL, lat, lon, 0.0145);          // ~1 mile
    const wetlands_topo_map_url = buildExportUrl(NWI_TOPO_EXPORT_URL, lat, lon, 0.0145); // ~1 mile, topo base
    const wetlands_detail_map_url = buildExportUrl(NWI_EXPORT_URL, lat, lon, 0.00145);   // ~500 ft

    // Query NWI for wetland polygons that contain or are near the point
    const bufferDeg = 0.0009; // ~100 meters
    const envelope = `${lon - bufferDeg},${lat - bufferDeg},${lon + bufferDeg},${lat + bufferDeg}`;

    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "Wetlands.WETLAND_TYPE,Wetlands.ATTRIBUTE,Wetlands.ACRES",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "5",
    });

    const res = await fetch(`${NWI_QUERY_URL}?${params}`);
    if (!res.ok) throw new Error(`NWI query failed: ${res.status}`);

    const data = await res.json();
    const features = data.features || [];

    // No point-intersect hit — try envelope fallback
    if (!features.length) {
      const params2 = new URLSearchParams({
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "Wetlands.WETLAND_TYPE,Wetlands.ATTRIBUTE,Wetlands.ACRES",
        returnGeometry: "false",
        f: "json",
        resultRecordCount: "5",
      });

      const res2 = await fetch(`${NWI_QUERY_URL}?${params2}`);
      if (!res2.ok) throw new Error(`NWI fallback query failed: ${res2.status}`);
      const data2 = await res2.json();

      if (!data2.features?.length) {
        console.log(`NWI: no wetlands near ${lat},${lon} user=${user.email}`);
        return Response.json({
          wetlands_present: false,
          wetland_types: [],
          wetland_count: 0,
          wetlands_map_url,
          wetlands_topo_map_url,
          wetlands_detail_map_url,
        });
      }

      const types = [...new Set(data2.features.map(f => f.attributes?.["Wetlands.WETLAND_TYPE"]).filter(Boolean))];
      const first = data2.features[0]?.attributes || {};
      console.log(`NWI (envelope): ${data2.features.length} wetland(s) near ${lat},${lon} → ${types.join(', ')}`);
      return Response.json({
        wetlands_present: true,
        wetland_types: types,
        wetland_count: data2.features.length,
        wetland_proximity: "adjacent",
        wetland_type: first["Wetlands.WETLAND_TYPE"] || null,
        wetland_code: first["Wetlands.ATTRIBUTE"] || null,
        wetland_acres: first["Wetlands.ACRES"] ? parseFloat(parseFloat(first["Wetlands.ACRES"]).toFixed(2)) : null,
        wetlands_map_url,
        wetlands_topo_map_url,
        wetlands_detail_map_url,
      });
    }

    // On-site hit
    const types = [...new Set(features.map(f => f.attributes?.["Wetlands.WETLAND_TYPE"]).filter(Boolean))];
    const totalAcres = features.reduce((sum, f) => sum + (f.attributes?.["Wetlands.ACRES"] || 0), 0);
    const first = features[0]?.attributes || {};

    // Also run Identify as a confirmation/enrichment pass
    const identify = await identifyAtPoint(lat, lon);

    console.log(`NWI: ${features.length} wetland(s) AT ${lat},${lon} → ${types.join(', ')} user=${user.email}`);

    return Response.json({
      wetlands_present: true,
      wetland_types: types,
      wetland_count: features.length,
      wetland_acres: parseFloat(totalAcres.toFixed(2)),
      wetland_proximity: "on-site",
      wetland_type: identify?.wetland_type || first["Wetlands.WETLAND_TYPE"] || null,
      wetland_code: identify?.wetland_code || first["Wetlands.ATTRIBUTE"] || null,
      wetlands_map_url,
      wetlands_topo_map_url,
      wetlands_detail_map_url,
    });

  } catch (error) {
    console.error('wetlandsLookup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});