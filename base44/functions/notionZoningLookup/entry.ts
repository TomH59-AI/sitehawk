import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { findOrdinance } from '../../shared/telecomOrdinance.ts';

// Zoning lookup — reads the Base44 TelecomOrdinance entity (the source of truth).
// The legacy Supabase `zoning-lookup` edge proxy has been removed.
// Function name preserved (notionZoningLookup) so Section2 / SCIPPreview keep
// working without frontend changes; response keeps the { geocode, zoning } shape.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    // Reverse geocode via the FCC Area API (reliable for US state + county).
    const fccRes = await fetch(
      `https://geo.fcc.gov/api/census/area?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=json`
    ).catch(() => null);
    const fccData = fccRes?.ok ? await fccRes.json() : null;
    const area = Array.isArray(fccData?.results) ? fccData.results[0] : null;
    const state = (area?.state_code || area?.state_name || "").toUpperCase() || null;
    const countyRaw = area?.county_name || null;
    const county = countyRaw ? countyRaw.replace(/\s+County$/i, "").trim() : null;

    if (!state || !county) {
      return Response.json({
        geocode: { city: null, county: countyRaw, state },
        zoning: null,
        matches: 0,
        all_matches: [],
        message: "Could not determine jurisdiction from coordinates",
      });
    }

    const { row, rules } = await findOrdinance(base44, state, `${county} County`);

    const zoning = rules
      ? {
          jurisdiction: row.jurisdiction,
          code_section: row.section_ref || null,
          section_title: null,
          permit_type: rules.permit_type || null,
          zoning_process: rules.permit_type || null,
          max_tower_height: rules.height_limit_ft != null ? `${rules.height_limit_ft} ft` : null,
          max_tower_height_ft: rules.height_limit_ft,
          setback_ft: rules.setback_ft,
          fall_zone: rules.fall_zone_ft != null ? `${rules.fall_zone_ft} ft` : null,
          fall_zone_ft: rules.fall_zone_ft,
          residential_separation:
            rules.residential_separation_ft != null ? `${rules.residential_separation_ft} ft` : null,
          allowable_zones: [],
          collocation_required:
            rules.collocation_required == null ? null : rules.collocation_required ? "Yes" : "No",
          stealth_required: rules.stealth_required == null ? null : rules.stealth_required ? "Yes" : "No",
          ordinance_summary: null,
          source: "Base44 · TelecomOrdinance",
        }
      : null;

    return Response.json({
      geocode: { city: null, county: countyRaw, state },
      zoning,
      matches: zoning ? 1 : 0,
      all_matches: [],
      message: zoning ? null : `No ordinance match for ${county} County, ${state}`,
    });
  } catch (error) {
    console.error("notionZoningLookup error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}