import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Authenticated proxy to the Supabase `regrid-parcel-search` (v43, Realie-primary)
// edge function. Base44 NEVER calls the Realie API directly — all Realie traffic
// flows through Supabase so usage metering / the api_call_ledger stays accurate.
//
// Supports two modes (spec body shape):
//   - ring:  { mode:"ring",  lat, lon, radius_miles (≤2), min_acres, max_acres }
//   - click: { mode:"click", lat, lon }   ← single parcel under a map click
//
// Returns the Supabase response largely unchanged, with a normalized `parcels`
// array layered on top so existing Section 4 renderers keep working. Every v43
// field (tax, deed, transfers, geometry) is preserved on each normalized parcel.

const SUPABASE_FN_URL =
  "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/regrid-parcel-search";

// Map a raw v43 parcel onto the shape the frontend already consumes, while
// passing through every new tax / deed / title field untouched.
function normalize(p) {
  return {
    apn: p.apn || p.parcelId || p.parcel_id || p.parcel_number || null,
    owner_name: p.owner_name || p.ownerName || p.owner || null,
    mailing_address: p.mailing_address || p.ownerMailingAddress || null,
    parcel_address: p.site_address || p.address || p.fullAddress || null,
    acreage: p.acres ?? p.acreage ?? p.lotSizeAcres ?? null,
    acres_formatted: p.acres_formatted || null,
    lot_frontage_ft: p.lotFrontage || p.frontage || p.lot_frontage || null,
    lot_depth_ft: p.lotDepth || p.depth || p.lot_depth || null,
    lot_size_sqft: p.lotSizeSqFt || p.lot_size_sqft || null,
    land_use: p.land_use || p.landUse || p.useDescription || p.zoning || null,
    // ── Tax assessment (v43) ──
    assessed_value: p.total_assessed ?? p.totalAssessedValue ?? p.assessedValue ?? null,
    total_assessed: p.total_assessed ?? null,
    land_value: p.land_value ?? null,
    improvement_value: p.improvement_value ?? null,
    market_value: p.market_value ?? null,
    annual_tax: p.annual_tax ?? null,
    tax_year: p.tax_year ?? null,
    // ── Sale / deed (v43) ──
    last_sale_date: p.last_sale_date || p.lastSaleDate || null,
    last_sale_price: p.last_sale_price ?? p.lastSalePrice ?? null,
    deed_type: p.deed_type || null,
    deed_doc_num: p.deed_doc_num || null,
    deed_book: p.deed_book || null,
    ownership_start: p.ownership_start || null,
    // ── Chain of title (v43) ──
    transfers: Array.isArray(p.transfers) ? p.transfers : [],
    legal_description: p.legal_description || null,
    plss_formatted: p.plss_formatted || null,
    data_source: p.data_source || null,
    latitude: p.latitude ?? p.lat ?? (p.location?.coordinates?.[1]) ?? null,
    longitude: p.longitude ?? p.lon ?? p.lng ?? (p.location?.coordinates?.[0]) ?? null,
    // GeoJSON parcel polygon (Realie returns a MultiPolygon under `geometry`).
    parcel_geometry: p.geometry || p.parcel_geometry || p.parcelGeometry || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { lat, lon, mode } = body;
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    // Supabase anon/publishable key for the `apikey` header (HAWK project first).
    const supabaseKey =
      Deno.env.get("HAWK_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseKey) {
      return Response.json({ error: "Supabase anon key not set" }, { status: 500 });
    }

    // Build the spec body. Default to ring mode for backward compatibility with
    // existing callers that only send { lat, lon, radius_miles }.
    const reqMode = mode === "click" ? "click" : "ring";
    const payload = { mode: reqMode, lat, lon };
    if (reqMode === "ring") {
      payload.radius_miles = Math.min(Number(body.radius_miles ?? 1.0), 2.0);
      if (body.min_acres != null) payload.min_acres = body.min_acres;
      if (body.max_acres != null) payload.max_acres = body.max_acres;
    }

    const r = await fetch(SUPABASE_FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: supabaseKey },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const text = await r.text();
      console.error("regrid-parcel-search HTTP", r.status, text.slice(0, 300));
      return Response.json({ error: `Supabase HTTP ${r.status}: ${text.slice(0, 300)}` }, { status: 502 });
    }

    const data = await r.json();
    const items = data.parcels || data.properties || data.results || (Array.isArray(data) ? data : []);
    const parcels = items.map(normalize).filter((p) => p.apn || p.owner_name || p.parcel_address);

    // Return the Supabase response shape, with a normalized parcels array on top.
    return Response.json({
      ...data,
      ok: data.ok ?? true,
      mode: reqMode,
      // `clicked` distinguishes an exact polygon hit from a nearest-parcel match.
      clicked: reqMode === "click" ? !!data.clicked : undefined,
      count: parcels.length,
      radius_miles: reqMode === "ring" ? payload.radius_miles : undefined,
      center: { lat, lon },
      parcels,
    });
  } catch (error) {
    console.error("realieParcelsInRing error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});