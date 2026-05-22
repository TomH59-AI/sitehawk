// scipShare — create + retrieve shareable SCIP snapshots.
//
// POST body shapes:
//   { action: "create", candidate, ordinance, searchCenter, agent, recipients?: [email,...] }
//     → creates a SCIPShare record (public, read-only), optionally emails the link
//     → returns { share_id, share_url }
//
//   { action: "get", share_id }
//     → returns the snapshot (public, no auth required)
//
// This function is intentionally permissive on `get` so the share URL works
// for anyone with the link.

import { createClientFromRequest, createClient } from 'npm:@base44/sdk@0.8.25';

function randomId() {
  // 12-char base36 — short, URL-friendly, ~62 bits entropy
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const action = body.action || "create";

    // ───────── GET — public, no auth ─────────
    if (action === "get") {
      const { share_id } = body;
      if (!share_id) return Response.json({ error: "share_id required" }, { status: 400 });

      // Service role read so the public link works even when caller is anon
      const appId = Deno.env.get("BASE44_APP_ID");
      const base44 = createClient({ appId, requiresAuth: false });
      const snapshots = await base44.asServiceRole.entities.SCIPShare.filter({ share_id });
      const snap = snapshots?.[0];
      if (!snap) return Response.json({ error: "Share link not found" }, { status: 404 });

      return Response.json({
        share_id: snap.share_id,
        candidate: snap.candidate,
        ordinance: snap.ordinance,
        searchCenter: snap.searchCenter,
        agent: snap.agent,
        created_date: snap.created_date,
      });
    }

    // ───────── CREATE — must be authed ─────────
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { candidate, ordinance, searchCenter, agent, recipients } = body;
    if (!candidate || !searchCenter) {
      return Response.json({ error: "candidate and searchCenter are required" }, { status: 400 });
    }

    const share_id = randomId();
    await base44.entities.SCIPShare.create({
      share_id,
      candidate,
      ordinance: ordinance || null,
      searchCenter,
      agent: agent || null,
      shared_by_email: user.email,
    });

    // Build the public URL — uses origin of the requesting page when sent
    const origin = body.origin || req.headers.get("origin") || "";
    const share_url = `${origin}/scip-share?id=${share_id}`;

    // Optional email send
    let emailed = [];
    if (Array.isArray(recipients) && recipients.length > 0) {
      const subject = `SiteHawk SCIP — ${candidate.site_name || "Candidate Site"}`;
      const body_html =
        `<p>${user.full_name || user.email} shared a Site Candidate Information Package with you.</p>` +
        `<p><strong>${candidate.site_name || "Candidate Site"}</strong><br/>` +
        `${candidate.parcel_address || ""}<br/>` +
        `Owner: ${candidate.owner_name || "—"}<br/>` +
        `Match: ${candidate.match_score ?? "—"}%</p>` +
        `<p><a href="${share_url}" style="background:#0C1B2E;color:#00d4ff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700;">View SCIP →</a></p>` +
        `<p style="color:#64748b;font-size:12px">${share_url}</p>`;

      for (const to of recipients) {
        try {
          await base44.integrations.Core.SendEmail({
            from_name: "SiteHawk",
            to,
            subject,
            body: body_html,
          });
          emailed.push(to);
        } catch (e) {
          console.error("scipShare email failed for", to, e.message);
        }
      }
    }

    return Response.json({ share_id, share_url, emailed });
  } catch (error) {
    console.error("scipShare error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});