import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ADMIN_EMAIL = "hodgesthomas@outlook.com";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || (user.email !== ADMIN_EMAIL && user.role !== "admin")) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const notifyUrl = Deno.env.get("SUPABASE_NOTIFY_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("HAWK_SUPABASE_ANON_KEY");

    if (!notifyUrl || !supabaseKey) {
      return Response.json({ error: "Notification service is not configured." }, { status: 500 });
    }

    const payload = await req.json();
    const response = await fetch(notifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    console.error("sendUpdateNotify error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});