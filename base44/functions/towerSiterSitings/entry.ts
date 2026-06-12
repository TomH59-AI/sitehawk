import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// HawkPerch — tower_sitings (Supabase, RLS owner-scoped; we write with service
// role and scope by user explicitly). Actions:
//   count  → rows this calendar month for the current user (quota check)
//   insert → save a confirmed siting (Send to SCIP); crusher/skill-scip pulls from there

// tower_sitings.user_id is a Postgres uuid; Base44 user ids are 24-char hex.
// Derive a deterministic uuid by zero-padding so the same user always maps
// to the same uuid (queries and inserts stay consistent).
function toUuid(id) {
  const hex = (String(id).replace(/[^0-9a-f]/gi, "") + "0".repeat(32)).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const supaUrl = (Deno.env.get("HAWK_SUPABASE_URL") || "").replace(/^[\\'"\s]+/, "").replace(/\/+$/, "");
    const key = Deno.env.get("HAWK_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !key) return Response.json({ error: "Supabase not configured" }, { status: 500 });
    const headers = { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` };

    const body = await req.json();

    if (body.action === "count") {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const r = await fetch(
        `${supaUrl}/rest/v1/tower_sitings?select=id&user_id=eq.${toUuid(user.id)}&created_at=gte.${monthStart.toISOString()}`,
        { headers: { ...headers, Prefer: "count=exact", Range: "0-0" } }
      );
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        console.error("tower_sitings count HTTP", r.status, detail.slice(0, 300));
        return Response.json({ count: 0, unavailable: true, status: r.status, detail: detail.slice(0, 300) });
      }
      const range = r.headers.get("content-range") || "";
      const total = parseInt(range.split("/")[1], 10);
      return Response.json({ count: Number.isFinite(total) ? total : 0 });
    }

    if (body.action === "insert") {
      const { parcel_apn, state, jurisdiction, geojson, params, checks } = body;
      const r = await fetch(`${supaUrl}/rest/v1/tower_sitings`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: toUuid(user.id),
          parcel_apn: parcel_apn || null,
          state: state || null,
          jurisdiction: jurisdiction || null,
          geojson: geojson || null,
          params: params || null,
          checks: checks || null,
        }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        console.error("tower_sitings insert HTTP", r.status, text.slice(0, 300));
        return Response.json({ error: `Supabase HTTP ${r.status}` }, { status: 502 });
      }
      const rows = await r.json();
      return Response.json({ ok: true, id: rows[0]?.id ?? null });
    }

    return Response.json({ error: "action must be count | insert" }, { status: 400 });
  } catch (error) {
    console.error("towerSiterSitings error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});