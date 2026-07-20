// Shared telecom-ordinance matching against the Base44 TelecomOrdinance entity
// (migrated from the legacy Supabase telecom_ordinances table). Used by
// towerSiterOrdinance and zoneResolve so the matching logic never drifts.

export function normalizeJurisdiction(j) {
  return (j || "")
    .toUpperCase()
    .replace(/\bCITY OF\b/g, "")
    .replace(/\bCOUNTY\b/g, "")
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
    permit_type: rec.permit_type ?? null,
    setback_rule: rec.setback_rule ?? null,
    pe_fall_zone_allowed: rec.pe_fall_zone_allowed ?? null,
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
      rows = await base44.entities.TelecomOrdinance.filter(
        { state: st, jurisdiction_normalized: { $regex: reEscape(norm), $options: "i" } },
        null,
        1
      );
      row = rows[0] || null;
    }
  }

  const structured = row && (row.setback_rule != null || row.setback_ft != null || row.height_limit_ft != null);
  return { row, rules: structured ? toLegacyShape(row) : null };
}