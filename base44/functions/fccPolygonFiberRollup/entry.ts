// functions/fccPolygonFiberRollup.js
//
// Rollup of FCC fiber stats across all Block Groups intersecting a GeoJSON polygon.
// Input body: { polygon: <GeoJSON Polygon or MultiPolygon> }
// Output: { found, summary: { bgCount, totalBSLs, fiberServed, fiberUnserved,
//            fiberUnderserved, fiberServedPct, underservedOpportunity, maxFiberProvidersInAnyBG } }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const FCC_BASE =
  "https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/" +
  "FCC_Broadband_Data_Collection_December_2024_View/FeatureServer";

const LAYER_BG = 3;

const pct = (n, d) => (!d || d <= 0 ? null : Math.round((n / d) * 1000) / 10);

// GeoJSON Polygon/MultiPolygon → Esri rings format.
function geoJsonToEsri(poly) {
  if (poly.type === "Polygon") {
    return { rings: poly.coordinates, spatialReference: { wkid: 4326 } };
  }
  if (poly.type === "MultiPolygon") {
    // Esri rings are a flat array; for MultiPolygon flatten all outer+inner rings.
    const rings = [];
    for (const p of poly.coordinates) for (const r of p) rings.push(r);
    return { rings, spatialReference: { wkid: 4326 } };
  }
  throw new Error("polygon must be a GeoJSON Polygon or MultiPolygon");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST" },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return json({ found: false, error: "Unauthorized" }, 401);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ found: false, error: "body must be JSON" }, 400);
    }
    if (!body || !body.polygon) {
      return json({ found: false, error: "missing { polygon }" }, 400);
    }

    let esriGeom;
    try {
      esriGeom = geoJsonToEsri(body.polygon);
    } catch (err) {
      return json({ found: false, error: err.message }, 400);
    }

    const geometry = encodeURIComponent(JSON.stringify(esriGeom));
    const stats = encodeURIComponent(
      JSON.stringify([
        { statisticType: "sum",   onStatisticField: "TotalBSLs",            outStatisticFieldName: "sumTotalBSLs" },
        { statisticType: "sum",   onStatisticField: "ServedBSLsFiber",      outStatisticFieldName: "sumServedFiber" },
        { statisticType: "sum",   onStatisticField: "UnservedBSLsFiber",    outStatisticFieldName: "sumUnservedFiber" },
        { statisticType: "sum",   onStatisticField: "UnderservedBSLsFiber", outStatisticFieldName: "sumUnderservedFiber" },
        { statisticType: "max",   onStatisticField: "UniqueProvidersFiber", outStatisticFieldName: "maxProvidersFiber" },
        { statisticType: "count", onStatisticField: "OBJECTID",             outStatisticFieldName: "bgCount" },
      ])
    );

    const url =
      `${FCC_BASE}/${LAYER_BG}/query` +
      `?geometry=${geometry}` +
      `&geometryType=esriGeometryPolygon` +
      `&inSR=4326` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&outStatistics=${stats}` +
      `&f=json`;

    const r = await fetch(url);
    if (!r.ok) return json({ found: false, error: `FCC HTTP ${r.status}` }, 502);
    const j = await r.json();
    if (j.error) return json({ found: false, error: `FCC API: ${j.error.message}` }, 502);
    const a = j.features && j.features[0] ? j.features[0].attributes : null;
    if (!a || !a.bgCount) {
      return json({ found: false, reason: "no_block_groups_in_polygon" });
    }

    const totalBSLs = a.sumTotalBSLs || 0;
    const fiberServed = a.sumServedFiber || 0;
    const fiberUnserved = a.sumUnservedFiber || 0;
    const fiberUnderserved = a.sumUnderservedFiber || 0;
    // "Underserved opportunity" = locations the tower can RF-cover but lack fiber today.
    const underservedOpportunity = fiberUnserved + fiberUnderserved;

    return json({
      found: true,
      summary: {
        bgCount: a.bgCount,
        totalBSLs,
        fiberServed,
        fiberUnserved,
        fiberUnderserved,
        fiberServedPct: pct(fiberServed, totalBSLs),
        underservedOpportunity,
        underservedOpportunityPct: pct(underservedOpportunity, totalBSLs),
        maxFiberProvidersInAnyBG: a.maxProvidersFiber ?? null,
      },
      source: {
        dataset: "FCC Broadband Data Collection (Dec 2024 view)",
        layerId: LAYER_BG,
        method: "polygon-intersect rollup",
      },
    });
  } catch (err) {
    console.error("fccPolygonFiberRollup error:", err);
    return json({ found: false, error: err.message || String(err) }, 502);
  }
});