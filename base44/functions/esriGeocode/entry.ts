import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

/**
 * esriGeocode — jurisdiction resolver (name kept for caller compatibility).
 *
 * ESRI was dropped (no API key). This now resolves the governing jurisdiction
 * (county / city / state) for a coordinate using the SAME parcel sources the
 * rest of the pipeline already uses:
 *   1. Realie (realieParcelsInRing, click mode) — PRIMARY.
 *   2. ReportAll USA (reportAllParcels, point mode) — FALLBACK, and the cleaner
 *      source for county/state on rural parcels.
 *
 * Only REVERSE geocoding (coords → jurisdiction) is supported — that was the
 * job ESRI was actually needed for. Forward geocoding (address → coords) is
 * removed since the app drops coordinates directly on the map.
 *
 * Response shape (unchanged from the reverse path callers expect):
 *   { county, city, state, match_address, source }
 */

const SUPABASE_FN_URL =
  "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/regrid-parcel-search";
const REPORTALL_URL = "https://reportallusa.com/api/parcels";

// Pull the single parcel under a point from Realie via Supabase.
async function realiePoint(lat: number, lon: number, supabaseKey: string) {
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
  const city = p.situs_city || p.city || null;
  const county = p.county || p.county_name || null;
  const state = p.state || p.state_abbr || null;
  const match_address = p.site_address || p.address || p.fullAddress || null;
  if (!county && !state && !city) return null;
  return { county, city, state, match_address, source: "Realie" };
}

// Pull the single parcel under a point from ReportAll USA.
async function reportAllPoint(lat: number, lon: number, client: string) {
  const params = new URLSearchParams({
    client,
    v: "9",
    rpp: "1",
    page: "1",
    return_geometry: "false",
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
  const county = p.county_name || null;
  const state = p.state_abbr || null;
  const city = p.situs_city || null;
  const match_address = p.situs || [p.addr_number, p.addr_street_name, p.situs_city].filter(Boolean).join(" ") || null;
  if (!county && !state && !city) return null;
  return { county, city, state, match_address, source: "ReportAll USA" };
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

    // Realie first (primary), then ReportAll (fallback + cleaner rural county/state).
    let result = null;
    if (supabaseKey) {
      try { result = await realiePoint(Number(lat), Number(lon), supabaseKey); }
      catch (e) { console.error("esriGeocode Realie error:", e.message); }
    }
    if (!result && reportClient) {
      try { result = await reportAllPoint(Number(lat), Number(lon), reportClient); }
      catch (e) { console.error("esriGeocode ReportAll error:", e.message); }
    }

    if (!result) {
      return Response.json({ found: false, county: null, city: null, state: null, match_address: null });
    }
    return Response.json({ found: true, ...result });
  } catch (error) {
    console.error("esriGeocode error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});