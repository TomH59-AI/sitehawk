import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// USFWS National Wetlands Inventory (NWI) — official federal wetlands data
// Polygon layer: checks if a point intersects or is near mapped wetlands
const NWI_URL = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon are required' }, { status: 400 });

    // Query NWI for wetland polygons that contain the point
    // Use a small buffer (100m ≈ 0.0009 deg) to also catch adjacent wetlands
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

    const res = await fetch(`${NWI_URL}?${params}`);
    if (!res.ok) throw new Error(`NWI query failed: ${res.status}`);

    const data = await res.json();
    const features = data.features || [];

    if (!features.length) {
      // Try a slightly larger spatial envelope query as a fallback
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

      const res2 = await fetch(`${NWI_URL}?${params2}`);
      if (!res2.ok) throw new Error(`NWI fallback query failed: ${res2.status}`);
      const data2 = await res2.json();

      if (!data2.features?.length) {
        console.log(`NWI: no wetlands near ${lat},${lon} user=${user.email}`);
        return Response.json({ wetlands_present: false, wetland_types: [], wetland_count: 0 });
      }

      const types = [...new Set(data2.features.map(f => f.attributes?.["Wetlands.WETLAND_TYPE"]).filter(Boolean))];
      console.log(`NWI (envelope): ${data2.features.length} wetland(s) near ${lat},${lon} → ${types.join(', ')}`);
      return Response.json({
        wetlands_present: true,
        wetland_types: types,
        wetland_count: data2.features.length,
        wetland_proximity: "adjacent", // within ~100m but not directly on parcel
      });
    }

    const types = [...new Set(features.map(f => f.attributes?.["Wetlands.WETLAND_TYPE"]).filter(Boolean))];
    const totalAcres = features.reduce((sum, f) => sum + (f.attributes?.["Wetlands.ACRES"] || 0), 0);

    console.log(`NWI: ${features.length} wetland(s) AT ${lat},${lon} → ${types.join(', ')} user=${user.email}`);

    return Response.json({
      wetlands_present: true,
      wetland_types: types,
      wetland_count: features.length,
      wetland_acres: parseFloat(totalAcres.toFixed(2)),
      wetland_proximity: "on-site", // point is directly within a wetland polygon
    });

  } catch (error) {
    console.error('wetlandsLookup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});