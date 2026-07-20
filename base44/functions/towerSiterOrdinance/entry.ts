import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// HawkPerch ordinance lookup — now served from the Base44 TelecomOrdinance
// entity (migrated from Supabase telecom_ordinances; Supabase no longer used).
// Exact jurisdiction match first, then a contains match on the normalized name.
// No row or NULL structured cols → Unverified mode. Response shape unchanged.

function normalizeJurisdiction(j) {
  return (j || "")
    .toUpperCase()
    .replace(/\bCITY OF\b/g, "")
    .replace(/\bCOUNTY\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Escape regex metacharacters in the jurisdiction name before building a $regex.
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function toLegacyShape(rec) {
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { state, jurisdiction } = await req.json();
    if (!state || !jurisdiction) {
      return Response.json({ error: "state and jurisdiction required" }, { status: 400 });
    }
    const st = String(state).toUpperCase();

    // 1. exact match
    let rows = await base44.entities.TelecomOrdinance.filter({ state: st, jurisdiction }, null, 1);
    let row = rows[0] || null;

    // 2. contains match on the normalized name
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

    // Structured cols all NULL → treat as no ordinance (Unverified mode)
    const structured = row && (row.setback_rule != null || row.setback_ft != null || row.height_limit_ft != null);
    return Response.json({ rules: structured ? toLegacyShape(row) : null, matchedRow: !!row });
  } catch (error) {
    console.error("towerSiterOrdinance error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});