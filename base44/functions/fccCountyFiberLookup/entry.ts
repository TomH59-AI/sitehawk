/**
 * fccCountyFiberLookup — FCC Broadband Data Collection (Dec 2024) county-level
 * fiber coverage lookup by lat/lon.
 *
 * Queries the FCC BDC ArcGIS FeatureServer with a point-intersect to return
 * the containing county's fiber availability stats:
 *   - TotalPop, TotalBSLs (broadband-serviceable locations)
 *   - ServedBSLsFiber / Underserved / Unserved
 *   - UniqueProvidersFiber
 *   - 6- and 12-month previous served counts (trend)
 *
 * Input: { lat: number, lon: number }
 * Output: { county, state, stats: {...}, trend: {...} } or { error }
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const FCC_BDC_URL =
  "https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/FCC_Broadband_Data_Collection_December_2024_View/FeatureServer/1/query";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lat, lon } = await req.json();
    if (typeof lat !== "number" || typeof lon !== "number") {
      return Response.json({ error: "lat and lon (numbers) are required" }, { status: 400 });
    }

    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: [
        "GEOID",
        "CountyName",
        "StateName",
        "StateAbbr",
        "TotalPop",
        "TotalBSLs",
        "ServedBSLsFiber",
        "UnderservedBSLsFiber",
        "UnservedBSLsFiber",
        "UniqueProvidersFiber",
        "ServedBSLsFiber_6monthPrevious",
        "ServedBSLsFiber_12monthPrevious",
      ].join(","),
      returnGeometry: "false",
      f: "json",
    });

    const res = await fetch(`${FCC_BDC_URL}?${params.toString()}`);
    if (!res.ok) {
      return Response.json(
        { error: `FCC BDC request failed: ${res.status}` },
        { status: 502 },
      );
    }
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) {
      return Response.json({ error: "No FCC BDC county data found at this location" }, { status: 404 });
    }

    const a = feature.attributes || {};
    const served = a.ServedBSLsFiber ?? 0;
    const total = a.TotalBSLs ?? 0;
    const prev6 = a.ServedBSLsFiber_6monthPrevious ?? null;
    const prev12 = a.ServedBSLsFiber_12monthPrevious ?? null;

    return Response.json({
      geoid: a.GEOID,
      county: a.CountyName,
      state: a.StateName,
      state_abbr: a.StateAbbr,
      stats: {
        total_population: a.TotalPop,
        total_bsls: total,
        served_bsls_fiber: served,
        underserved_bsls_fiber: a.UnderservedBSLsFiber,
        unserved_bsls_fiber: a.UnservedBSLsFiber,
        unique_providers_fiber: a.UniqueProvidersFiber,
        fiber_coverage_pct: total > 0 ? +((served / total) * 100).toFixed(1) : null,
      },
      trend: {
        served_6mo_prev: prev6,
        served_12mo_prev: prev12,
        delta_6mo: prev6 != null ? served - prev6 : null,
        delta_12mo: prev12 != null ? served - prev12 : null,
      },
      source: "FCC Broadband Data Collection — December 2024",
    });
  } catch (error) {
    console.error("fccCountyFiberLookup error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});