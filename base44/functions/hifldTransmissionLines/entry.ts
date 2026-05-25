/**
 * hifldTransmissionLines — Query the HIFLD US Electric Power Transmission Lines
 * FeatureServer for line segments inside a map viewport, optionally filtered
 * by OWNER. Returns GeoJSON ready to drop into Mapbox/Leaflet.
 *
 * Source: https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/HIFLD_US_Electric_Power_Transmission_Lines/FeatureServer/0
 *
 * Payload:
 *   { bbox: [west, south, east, north],   // WGS84
 *     owner?: string,                      // case-insensitive contains
 *     limit?: number }                     // default 2000
 *
 * Response:
 *   { type: "FeatureCollection", features: [...], count }
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const SERVICE_URL =
  "https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/HIFLD_US_Electric_Power_Transmission_Lines/FeatureServer/0/query";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { bbox, owner, limit = 2000 } = await req.json();
    if (!Array.isArray(bbox) || bbox.length !== 4) {
      return Response.json({ error: "bbox=[w,s,e,n] required" }, { status: 400 });
    }
    const [w, s, e, n] = bbox.map(Number);

    // Build WHERE clause
    let where = "1=1";
    if (owner && owner.trim()) {
      const safe = owner.replace(/'/g, "''").toUpperCase();
      where = `UPPER(OWNER) LIKE '%${safe}%'`;
    }

    const params = new URLSearchParams({
      where,
      geometry: JSON.stringify({
        xmin: w, ymin: s, xmax: e, ymax: n,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "OBJECTID,OWNER,VOLTAGE,VOLT_CLASS,SUB_1,SUB_2,TYPE,STATUS,SHAPE__Length",
      returnGeometry: "true",
      f: "geojson",
      resultRecordCount: String(Math.min(limit, 5000)),
    });

    const resp = await fetch(`${SERVICE_URL}?${params.toString()}`);
    if (!resp.ok) {
      const text = await resp.text();
      console.error("HIFLD query failed:", resp.status, text.slice(0, 500));
      return Response.json({ error: `HIFLD ${resp.status}` }, { status: 502 });
    }
    const fc = await resp.json();
    if (fc.error) {
      console.error("HIFLD error payload:", fc.error);
      return Response.json({ error: fc.error.message || "HIFLD error" }, { status: 502 });
    }

    return Response.json({
      type: "FeatureCollection",
      features: fc.features || [],
      count: (fc.features || []).length,
    });
  } catch (err) {
    console.error("hifldTransmissionLines error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});