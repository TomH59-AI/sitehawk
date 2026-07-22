import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";
import { esriZoning } from "../../shared/esriZoning.ts";

/**
 * esriZoningFallback — nationwide zoning resolver.
 *
 * Returns zoning for a coordinate using, in order:
 *   1. Realie (realieParcelsInRing, click mode) — PRIMARY.
 *   2. ReportAll USA (reportAllParcels, point mode) — FALLBACK.
 *   3. ESRI Living Atlas "USA Zoning" layer (ESRI_API_KEY) — FINAL FALLBACK.
 *
 * Best-effort: returns { found: false } (200) when no source has a zoning
 * value, so callers fall through cleanly.
 *
 * Response shape: { found, zoning, land_use, jurisdiction, zoning_polygon,
 *   source }.  zoning_polygon is a GeoJSON Feature the Section 4 zoning map
 *   can draw.
 */

const SUPABASE_FN_URL =
  "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/regrid-parcel-search";
const REPORTALL_URL = "https://reportallusa.com/api/parcels";
const USA_ZONING_URL =
  "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Zoning/FeatureServer/0/query";

function feature(geom: unknown, props: Record<string, unknown>) {
  if (!geom) return null;
  return { type: "Feature", geometry: geom, properties: props };
}

async function realieZoning(lat: number, lon: number, supabaseKey: string) {
  const r = await fetch(SUPABASE_FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabaseKey },
    body: JSON.stringify({ mode: "click", lat, lon }),
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  const items = data?.parcels || data?.properties || data?.results || (Array.isArray(data) ? data : []);
  const p = items?.[0];
  if (!p) return null;
  const zoning = p.zoning || p.zoningCode || p.zoning_code || null;
  const land_use = p.land_use || p.landUse || p.useDescription || null;
  if (!zoning && !land_use) return null;
  const geom = p.geometry || p.parcel_geometry || p.parcelGeometry || null;
  return {
    zoning,
    land_use,
    jurisdiction: p.county || p.county_name || null,
    zoning_polygon: feature(geom, { zoning: zoning || land_use || "—", apn: p.apn || p.parcelId || "" }),
    source: "Realie",
  };
}

async function reportAllZoning(lat: number, lon: number, client: string) {
  const params = new URLSearchParams({
    client,
    v: "9",
    rpp: "1",
    page: "1",
    return_geometry: "true",
    si_srid: "4326",
    spatial_intersect: `POINT(${lon} ${lat})`,
  });
  const r = await fetch(REPORTALL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  const p = data?.results?.[0];
  if (!p) return null;
  const zoning = p.zoning || null;
  const land_use = p.land_use_class || p.land_use_code || null;
  if (!zoning && !land_use) return null;
  return {
    zoning,
    land_use,
    jurisdiction: p.county_name || null,
    zoning_polygon: null,
    source: "ReportAll USA",
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon } = await req.json().catch(() => ({}));
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const supabaseKey =
      Deno.env.get("HAWK_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
    const reportClient = Deno.env.get("REPORT_API_TOKEN");
    const esriKey = Deno.env.get("ESRI_API_KEY");

    // Realie → ReportAll → ESRI.
    let result = null;
    if (supabaseKey) {
      try { result = await realieZoning(Number(lat), Number(lon), supabaseKey); }
      catch (e) { console.error("esriZoningFallback Realie error:", e.message); }
    }
    if (!result && reportClient) {
      try { result = await reportAllZoning(Number(lat), Number(lon), reportClient); }
      catch (e) { console.error("esriZoningFallback ReportAll error:", e.message); }
    }
    if (!result && esriKey) {
      try { result = await esriZoning(Number(lat), Number(lon), esriKey); }
      catch (e) { console.error("esriZoningFallback ESRI error:", e.message); }
    }

    if (!result) {
      return Response.json({ found: false, zoning: null, land_use: null, jurisdiction: null, zoning_polygon: null });
    }
    return Response.json({ found: true, ...result });
  } catch (error) {
    console.error("esriZoningFallback error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});