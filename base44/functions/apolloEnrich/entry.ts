/**
 * apolloEnrich — standalone server-side Apollo people/match helper.
 * Reads APOLLO_API_KEY from env (never exposed to the frontend).
 *
 * IMPORTANT: Only call this on EXPLICIT user save actions (e.g. the Save to
 * Attio modal with enrichment enabled). Never wire it to entity automations
 * or automatic record changes — each lookup incurs a per-match Apollo charge.
 *
 * Input:  { name, company?, email?, domain? }
 * Output: { ok, enriched, person: { email, title, phone, linkedin_url, organization, city, state } | null }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const key = Deno.env.get("APOLLO_API_KEY");
    if (!key) return Response.json({ error: "APOLLO_API_KEY not configured" }, { status: 500 });

    const { name, company, email, domain } = await req.json().catch(() => ({}));
    if (!name && !email) {
      return Response.json({ error: "Provide at least a name or email" }, { status: 400 });
    }

    const res = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(company ? { organization_name: company } : {}),
        ...(domain ? { domain } : {}),
        reveal_personal_emails: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[apolloEnrich] Apollo HTTP ${res.status}: ${text.slice(0, 300)}`);
      return Response.json({ ok: false, enriched: false, error: `Apollo HTTP ${res.status}` }, { status: 502 });
    }
    const body = await res.json();
    const p = body?.person;
    if (!p) return Response.json({ ok: true, enriched: false, person: null });

    return Response.json({
      ok: true,
      enriched: true,
      person: {
        email: p.email && !p.email.includes("email_not_unlocked") ? p.email : null,
        title: p.title || null,
        phone: p.phone_numbers?.[0]?.sanitized_number || null,
        linkedin_url: p.linkedin_url || null,
        organization: p.organization?.name || null,
        city: p.city || null,
        state: p.state || null,
      },
    });
  } catch (error) {
    console.error("apolloEnrich error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});