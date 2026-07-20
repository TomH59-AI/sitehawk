import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ONE-TIME MIGRATION — copies every row of the legacy Supabase telecom_ordinances
// table into the Base44 TelecomOrdinance entity so the app no longer depends on
// Supabase for ordinance lookups. Admin-only. Safe to re-run: aborts if records
// already exist unless { force: true } is passed.

function normalizeJurisdiction(j) {
  return (j || "")
    .toUpperCase()
    .replace(/\bCITY OF\b/g, "")
    .replace(/\bCOUNTY\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const num = (v) => (v == null || v === "" ? undefined : Number(v));
const bool = (v) => {
  if (v == null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return s === "true" || s === "t" || s === "yes" || s === "y" || s === "1";
};
const str = (v) => (v == null || v === "" ? undefined : String(v));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    const { force } = await req.json().catch(() => ({}));

    const existing = await base44.asServiceRole.entities.TelecomOrdinance.list(null, 1);
    if (existing.length && !force) {
      return Response.json({ ok: false, error: "TelecomOrdinance already has records. Pass { force: true } to import anyway." });
    }

    const supaUrl = (Deno.env.get("HAWK_SUPABASE_URL") || "").replace(/^[\\'"\s]+/, "").replace(/\/+$/, "");
    const key = Deno.env.get("HAWK_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !key) return Response.json({ error: "Supabase source not configured" }, { status: 500 });

    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    let imported = 0, offset = 0;
    const PAGE = 1000;

    while (true) {
      const r = await fetch(
        `${supaUrl}/rest/v1/telecom_ordinances?select=*&order=jurisdiction.asc&limit=${PAGE}&offset=${offset}`,
        { headers }
      );
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        console.error("telecom_ordinances fetch HTTP", r.status, text.slice(0, 300));
        return Response.json({ error: `Supabase HTTP ${r.status}`, imported }, { status: 502 });
      }
      const rows = await r.json();
      if (!rows.length) break;

      const records = rows
        .filter((row) => row.jurisdiction && row.state)
        .map((row) => {
          const rec = {
            jurisdiction: String(row.jurisdiction),
            jurisdiction_normalized: normalizeJurisdiction(row.jurisdiction),
            state: String(row.state).toUpperCase(),
            height_limit_ft: num(row.height_limit_ft),
            setback_ft: num(row.setback_ft),
            fall_zone_ft: num(row.fall_zone_ft),
            residential_separation_ft: num(row.residential_separation_ft),
            tower_separation_ft: num(row.tower_separation_ft),
            permit_type: str(row.permit_type),
            setback_rule: str(row.setback_rule),
            pe_fall_zone_allowed: bool(row.pe_fall_zone_allowed),
            stealth_required: bool(row.stealth_required),
            collocation_required: bool(row.collocation_required),
            source_url: str(row.source_url),
            section_ref: str(row.section_ref),
          };
          // Drop undefined keys so schema validation stays clean.
          for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
          return rec;
        });

      // bulkCreate caps at 500 — chunk to 400.
      for (let i = 0; i < records.length; i += 400) {
        await base44.asServiceRole.entities.TelecomOrdinance.bulkCreate(records.slice(i, i + 400));
        imported += Math.min(400, records.length - i);
      }

      if (rows.length < PAGE) break;
      offset += PAGE;
    }

    console.log(`migrateTelecomOrdinances: imported ${imported} rows`);
    return Response.json({ ok: true, imported });
  } catch (error) {
    console.error("migrateTelecomOrdinances error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});