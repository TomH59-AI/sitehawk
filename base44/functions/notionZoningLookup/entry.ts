import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─────────────────────────────────────────────────────────────────────────────
// Zoning lookup — proxies the Supabase Edge Function `zoning-lookup`.
//
// Endpoint: https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/zoning-lookup
// Returns: { lat, lon, state, city, county, ordinance: {...}, matches, all_matches }
//
// Function name preserved (notionZoningLookup) so Section2 / SCIPPreview keep
// working without frontend changes. Response is reshaped to the existing
// { geocode, zoning } contract that Section2 already consumes.
// ─────────────────────────────────────────────────────────────────────────────

const ZONING_LOOKUP_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/zoning-lookup";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const url = `${ZONING_LOOKUP_URL}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text();
      console.error(`zoning-lookup HTTP ${r.status}: ${body.slice(0, 300)}`);
      return Response.json({ error: `Zoning lookup failed: ${r.status}` }, { status: 502 });
    }
    const result = await r.json();

    const geocode = {
      city: result.city || null,
      county: result.county || null,
      state: result.state || null,
    };

    const o = result.ordinance;
    const zoning = o
      ? {
          jurisdiction: o.jurisdiction,
          code_section: o.ldc_display || o.section_ref || null,
          section_title: o.section_title || null,
          permit_type: o.permit_type || null,
          zoning_process: o.permit_type || null,
          max_tower_height: o.height_limit_ft != null ? `${o.height_limit_ft} ft` : null,
          height_limit_ft: o.height_limit_ft,
          setback_ft: o.setback_ft,
          fall_zone: o.fall_zone_ft != null ? `${o.fall_zone_ft} ft` : null,
          fall_zone_ft: o.fall_zone_ft,
          residential_separation: o.setback_ft != null ? `${o.setback_ft} ft` : null,
          allowable_zones: o.allowable_zones || [],
          collocation_required: o.collocation_required == null ? null : (o.collocation_required ? "Yes" : "No"),
          stealth_required: o.stealth_required == null ? null : (o.stealth_required ? "Yes" : "No"),
          ordinance_summary: o.ordinance_summary || null,
          source: "Supabase · zoning-lookup",
        }
      : null;

    return Response.json({
      geocode,
      zoning,
      matches: result.matches,
      all_matches: result.all_matches,
      message: zoning ? null : `No ordinance match for ${result.city || result.county}, ${result.state}`,
    });
  } catch (error) {
    console.error("notionZoningLookup (Supabase edge) error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});