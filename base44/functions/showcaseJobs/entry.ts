import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Site Showcase — showcase_jobs (Supabase). Actions:
//   insert → queue a new showcase PDF job for a candidate
//   latest → most recent job row for a candidate (created_at desc, limit 1)

// Same deterministic uuid mapping used by towerSiterSitings.
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
    const key = Deno.env.get("HAWK_SUPABASE_ANON_KEY");
    if (!supaUrl || !key) return Response.json({ error: "Supabase not configured" }, { status: 500 });
    const headers = { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` };

    const body = await req.json();

    if (body.action === "latest") {
      if (!body.candidate_id) return Response.json({ error: "candidate_id required" }, { status: 400 });
      const r = await fetch(
        `${supaUrl}/rest/v1/showcase_jobs?candidate_id=eq.${toUuid(body.candidate_id)}&order=created_at.desc&limit=1`,
        { headers }
      );
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        console.error("showcase_jobs latest HTTP", r.status, detail.slice(0, 300));
        return Response.json({ error: `Supabase HTTP ${r.status}`, detail: detail.slice(0, 300) }, { status: 502 });
      }
      const rows = await r.json();
      return Response.json({ job: rows[0] || null });
    }

    if (body.action === "insert") {
      const { candidate_id, site_name, prepared_for, jurisdiction, latitude, longitude } = body;
      if (!candidate_id) return Response.json({ error: "candidate_id required" }, { status: 400 });
      const r = await fetch(`${supaUrl}/rest/v1/showcase_jobs`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: toUuid(user.id),
          candidate_id: toUuid(candidate_id),
          site_name: site_name || null,
          prepared_for: prepared_for || null,
          jurisdiction: jurisdiction || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          tower_type: "Monopole",
          tower_height_ft: 199,
          compound_size: "100x100",
          status: "queued",
        }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        console.error("showcase_jobs insert HTTP", r.status, text.slice(0, 300));
        return Response.json({ error: `Supabase HTTP ${r.status}`, detail: text.slice(0, 300) }, { status: 502 });
      }
      const rows = await r.json();
      return Response.json({ ok: true, job: rows[0] || null });
    }

    return Response.json({ error: "action must be insert | latest" }, { status: 400 });
  } catch (error) {
    console.error("showcaseJobs error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});