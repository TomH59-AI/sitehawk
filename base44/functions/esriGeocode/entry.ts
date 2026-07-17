import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

/**
 * esriGeocode — jurisdiction resolver.
 *
 * Resolves the governing jurisdiction (county / city / state) for a coordinate
 * using, in order:
 *   1. Realie (realieParcelsInRing, click mode) — PRIMARY.
 *   2. ReportAll USA (reportAllParcels, point mode) — FALLBACK.
 *   3. ESRI World Geocoding reverseGeocode (ESRI_API_KEY) — FINAL FALLBACK,
 *      the verified nationwide source for rural / non-parcel coordinates.
 *
 * Only REVERSE geocoding (coords → jurisdiction) is supported.
 *
 * Response shape: { found, county, city, state, match_address, source }.
 */

const SUPABASE_FN_URL =
  "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/regrid-parcel-search";
const REPORTALL_URL = "https://reportallusa.com/api/parcels";
const ESRI_REVERSE_URL =
  "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode";

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

// ESRI World Geocoding reverse lookup — verified nationwide jurisdiction.
async function esriReverse(lat: number, lon: number, apiKey: string) {
  const params = new URLSearchParams({
    location: `${lon},${lat}`,
    f: "json",
    token: apiKey,
    outFields: "*",
  });
  const r = await fetch(`${ESRI_REVERSE_URL}?${params.toString()}`);
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  if (data?.error) {
    console.error("esriGeocode reverse error:", JSON.stringify(data.error));
    return null;
  }
  const a = data?.address;
  if (!a) return null;
  const county = a.Subregion ? String(a.Subregion).replace(/ County$/i, "") : null;
  const city = a.City || null;
  const state = a.RegionAbbr || a.Region || null;
  const match_address = a.Match_addr || a.LongLabel || null;
  if (!county && !state && !city) return null;
  return { county, city, state, match_address, source: "ESRI" };
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
      try { result = await realiePoint(Number(lat), Number(lon), supabaseKey); }
      catch (e) { console.error("esriGeocode Realie error:", e.message); }
    }
    if (!result && reportClient) {
      try { result = await reportAllPoint(Number(lat), Number(lon), reportClient); }
      catch (e) { console.error("esriGeocode ReportAll error:", e.message); }
    }
    if (!result && esriKey) {
      try { result = await esriReverse(Number(lat), Number(lon), esriKey); }
      catch (e) { console.error("esriGeocode ESRI error:", e.message); }
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