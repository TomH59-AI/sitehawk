// Shared telecom-ordinance matching against the Base44 TelecomOrdinance entity
// (migrated from the legacy Supabase telecom_ordinances table). Used by
// towerSiterOrdinance and zoneResolve so the matching logic never drifts.

import { countyWordPattern } from "./codehawk.ts";

export function normalizeJurisdiction(j) {
  return (j || "")
    .toUpperCase()
    .replace(/\bCITY OF\b/g, "")
    .replace(/\bTOWN OF\b/g, "")
    .replace(/\bVILLAGE OF\b/g, "")
    .replace(/\bBOROUGH OF\b/g, "")
    .replace(/\bCOUNTY\b/g, "")
    .replace(/\bPARISH\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function toLegacyShape(rec) {
  if (!rec) return null;
  return {
    height_limit_ft: rec.height_limit_ft ?? null,
    setback_ft: rec.setback_ft ?? null,
    fall_zone_ft: rec.fall_zone_ft ?? null,
    fall_zone_pct_of_height: rec.fall_zone_pct_of_height ?? null,
    permit_type: rec.permit_type ?? null,
    setback_rule: rec.setback_rule ?? null,
    pe_fall_zone_allowed: rec.pe_fall_zone_allowed ?? null,
    pe_letter_required: rec.pe_letter_required ?? null,
    residential_separation_ft: rec.residential_separation_ft ?? null,
    tower_separation_ft: rec.tower_separation_ft ?? null,
    stealth_required: rec.stealth_required ?? null,
    collocation_required: rec.collocation_required ?? null,
    source_url: rec.source_url ?? null,
    section_ref: rec.section_ref ?? null,
    jurisdiction: rec.jurisdiction ?? null,
    state: rec.state ?? null,
  };
}

// Exact jurisdiction match first, then a contains match on the normalized name.
// Returns { row, rules } — rules is null when the row has no structured cols
// (Unverified mode), matching the legacy Supabase behavior.
export async function findOrdinance(base44, state, jurisdiction) {
  const st = String(state || "").toUpperCase();
  if (!st || !jurisdiction) return { row: null, rules: null };

  let rows = await base44.entities.TelecomOrdinance.filter({ state: st, jurisdiction }, null, 1);
  let row = rows[0] || null;

  if (!row) {
    const norm = normalizeJurisdiction(jurisdiction);
    if (norm) {
      const candidates = await base44.entities.TelecomOrdinance.filter(
        { state: st, jurisdiction_normalized: { $regex: reEscape(norm), $options: "i" } },
        null,
        10
      );
      // normalizeJurisdiction strips COUNTY, so "York County" and the city of
      // "York" both normalize to YORK. Taking the first hit therefore served
      // county sites city rules (and vice versa) with a high-confidence code
      // citation. Require the county/parish-ness of the row to match the query;
      // if nothing matches, return a MISS so the report falls back to gap-fill
      // rather than citing the wrong jurisdiction's ordinance.
      //
      // The test is state-aware: Alaska's county-equivalents are Boroughs,
      // Census Areas and Municipalities, while in Pennsylvania and New Jersey a
      // Borough is a MUNICIPALITY. A fixed COUNTY|PARISH pattern silently
      // mismatched every Alaskan borough against city records.
      const countyWord = countyWordPattern(st);
      const wantCounty = countyWord.test(jurisdiction);
      const isCountyRow = (r) => countyWord.test(r.jurisdiction || "");
      row = (candidates || []).find((r) => isCountyRow(r) === wantCounty) || null;
    }
  }

  const structured = row && (row.setback_rule != null || row.setback_ft != null || row.height_limit_ft != null);
  return { row, rules: structured ? toLegacyShape(row) : null };
}