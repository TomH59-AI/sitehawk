/**
 * esriZoningFallback — nationwide zoning / land-use fallback via ESRI Living Atlas.
 *
 * Called when both Realie (parcel zoning field) and zoneResolve come up empty.
 * Queries the ArcGIS "USA Zoning" (Living Atlas) FeatureServer at a {lat, lon}
 * and returns the covering zoning polygon + code/description when one exists.
 *
 * Body: { lat, lon }
 * Returns: { found, zone_code, zone_name, zone_type, jurisdiction, zoning_polygon }
 *          zoning_polygon is a GeoJSON Feature the Section 4 zoning map can draw.
 *
 * Authenticates with ESRI_API_KEY. Best-effort: returns { found: false } (200)
 * when no zoning layer covers the point, so callers can fall through cleanly.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

// ESRI Living Atlas "USA Zoning" nationwide layer (public, token-authenticated).
const USA_ZONING_URL =
  "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Zoning/FeatureServer/0/query";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = Deno.env.get("ESRI_API_KEY");
    if (!apiKey) return Response.json({ error: "ESRI_API_KEY not set" }, { status: 500 });

    const { lat, lon } = await req.json().catch(() => ({}));
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const params = new URLSearchParams({
      geometry: `${Number(lon)},${Number(lat)}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "true",
      f: "geojson",
      token: apiKey,
    });

    const res = await fetch(`${USA_ZONING_URL}?${params.toString()}`);
    const data = await res.json().catch(() => null);

    if (!res.ok || data?.error) {
      console.error("esriZoningFallback upstream error:", res.status, JSON.stringify(data?.error || "")?.slice(0, 400));
      return Response.json({ error: "ESRI zoning query failed", detail: data?.error ?? null }, { status: 502 });
    }

    const feature = Array.isArray(data?.features) ? data.features[0] : null;
    if (!feature) {
      console.log("esriZoningFallback: no zoning polygon at point", lat, lon);
      return Response.json({ found: false });
    }

    // Field names vary by contributing layer — probe the common ones.
    const p = feature.properties || {};
    const zoneCode = p.ZONE_CODE || p.zone_code || p.ZONING || p.Zone || p.ZONE || p.zoning || null;
    const zoneName = p.ZONE_NAME || p.zone_name || p.DESCRIPTION || p.Description || p.LABEL || null;
    const zoneType = p.ZONE_TYPE || p.zone_type || p.TYPE || p.CATEGORY || null;
    const jurisdiction = p.JURISDICTION || p.CITY || p.PLACE || p.COUNTY || null;

    return Response.json({
      found: true,
      zone_code: zoneCode,
      zone_name: zoneName,
      zone_type: zoneType,
      jurisdiction,
      zoning_polygon: { type: "Feature", geometry: feature.geometry, properties: { zoning: zoneCode || "—", zone_name: zoneName } },
      source: "ESRI Living Atlas (USA Zoning)",
    });
  } catch (error) {
    console.error("esriZoningFallback error:", error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});