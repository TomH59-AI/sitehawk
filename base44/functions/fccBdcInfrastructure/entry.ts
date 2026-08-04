import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { getLatestAvailabilityDate } from "../../shared/fccBdc.js";

const FCC_VIEW = "https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/FCC_Broadband_Data_Collection_December_2024_View/FeatureServer/3/query";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { layer, bbox } = await req.json();
    if (layer !== "broadband_service") return Response.json({ error: "Unsupported FCC layer" }, { status: 400 });
    if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(Number(value)))) {
      return Response.json({ error: "bbox=[west,south,east,north] is required" }, { status: 400 });
    }
    const [west, south, east, north] = bbox.map(Number);
    const params = new URLSearchParams({
      where: "1=1",
      geometry: `${west},${south},${east},${north}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects",
      outFields: "GEOID,CountyName,StateAbbr,TotalBSLs,ServedBSLsFiber,UnderservedBSLsFiber,UnservedBSLsFiber,UniqueProvidersFiber",
      returnGeometry: "true", resultRecordCount: "500", f: "geojson",
    });
    const [viewResponse, latestDate] = await Promise.all([
      fetch(`${FCC_VIEW}?${params}`),
      getLatestAvailabilityDate(secrets.get("FCC_USERNAME"), secrets.get("FCC_TOKEN")),
    ]);
    if (!viewResponse.ok) throw new Error(`FCC coverage view failed (${viewResponse.status})`);
    const collection = await viewResponse.json();
    const features = (collection.features || []).map((feature) => {
      const p = feature.properties || {};
      const servedPct = p.TotalBSLs > 0 ? Number(((p.ServedBSLsFiber / p.TotalBSLs) * 100).toFixed(1)) : null;
      return { ...feature, properties: { ...p, served_fiber_pct: servedPct, source: "FCC BDC December 2024 block-group view" } };
    });
    return Response.json({
      geojson: { type: "FeatureCollection", features },
      count: features.length,
      metadata: {
        source: "FCC Broadband Data Collection",
        source_date: "2024-12-31",
        latest_bdc_availability_date: latestDate,
        confidence: "Official FCC block-group summary",
        limitations: "Coverage polygons summarize broadband-serviceable locations; they are not fiber routes, lit buildings, POPs, IXPs, or parcel-level service confirmations. The map view is December 2024; the latest BDC bulk-file date is reported separately.",
        queried_bbox: [west, south, east, north],
      },
    });
  } catch (error) {
    console.error("fccBdcInfrastructure error:", error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}