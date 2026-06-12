import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// HawkPerch ordinance lookup — Supabase telecom_ordinances.
// Exact jurisdiction match first, then ILIKE on the normalized name
// (strip "CITY OF" / "COUNTY", trim). No row or NULL structured cols → Unverified mode.

const COLS = "height_limit_ft,setback_ft,fall_zone_ft,permit_type,setback_rule,pe_fall_zone_allowed,residential_separation_ft,tower_separation_ft,stealth_required,collocation_required,source_url,section_ref,jurisdiction,state";

function normalizeJurisdiction(j) {
  return (j || "")
    .toUpperCase()
    .replace(/\bCITY OF\b/g, "")
    .replace(/\bCOUNTY\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

    const supaUrl = (Deno.env.get("HAWK_SUPABASE_URL") || "").replace(/^[\\'"\s]+/, "").replace(/\/+$/, "");
    const key = Deno.env.get("HAWK_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !key) return Response.json({ error: "Supabase not configured" }, { status: 500 });

    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const q = async (jFilter) => {
      const r = await fetch(
        `${supaUrl}/rest/v1/telecom_ordinances?select=${COLS}&state=eq.${encodeURIComponent(state.toUpperCase())}&${jFilter}&limit=1`,
        { headers }
      );
      if (!r.ok) {
        console.error("telecom_ordinances HTTP", r.status, await r.text().catch(() => ""));
        return null;
      }
      const rows = await r.json();
      return rows[0] || null;
    };

    // 1. exact match
    let row = await q(`jurisdiction=eq.${encodeURIComponent(jurisdiction)}`);
    // 2. ILIKE on normalized name
    if (!row) {
      const norm = normalizeJurisdiction(jurisdiction);
      if (norm) row = await q(`jurisdiction=ilike.${encodeURIComponent(`*${norm}*`)}`);
    }

    // Structured cols all NULL → treat as no ordinance (Unverified mode)
    const structured = row && (row.setback_rule != null || row.setback_ft != null || row.height_limit_ft != null);
    return Response.json({ rules: structured ? row : null, matchedRow: !!row });
  } catch (error) {
    console.error("towerSiterOrdinance error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});