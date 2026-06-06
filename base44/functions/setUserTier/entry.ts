import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const ALLOWED = ["free", "hawk_site", "hawkeyes", "hawkeye_apex"];

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
      return new Response("forbidden", { status: 403 });
    }

    const { email, tier } = await req.json();
    if (!ALLOWED.includes(tier)) {
      return Response.json({ error: "invalid tier" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const [user] = await base44.asServiceRole.entities.User.filter({ email });
    if (!user) {
      return Response.json({ error: "user not found" }, { status: 404 });
    }

    const updated = await base44.asServiceRole.entities.User.update(user.id, { tier });
    return Response.json({ ok: true, id: updated.id, tier: updated.tier });
  } catch (error) {
    console.error("setUserTier error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});