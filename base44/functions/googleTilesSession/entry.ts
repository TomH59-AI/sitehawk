/**
 * googleTilesSession — serves the Google Maps API key server-side only,
 * enforces per-tier daily session quota, and logs usage to Supabase.
 *
 * Tiers:
 *   hawk_site / hawk_site_law  → blocked (0 sessions)
 *   hawk_vision                → 10/day
 *   hawk_vision_law            → 25/day
 *   hawk_command / admin       → unlimited
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

const QUOTA = {
  free: 0,
  hawk_site: 0,
  hawk_site_law: 0,
  hawk_vision: 10,
  hawk_vision_law: 25,
  hawk_command: Infinity,
};

const ADMIN_EMAIL = "hodgesthomas@outlook.com";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
    const tierKey = user.tier || "free";
    const dailyQuota = isAdmin ? Infinity : (QUOTA[tierKey] ?? 0);

    if (dailyQuota === 0) {
      return Response.json({
        error: "upgrade_required",
        tierKey,
        message: "Photorealistic 3D Tiles requires HawkVision or higher.",
      }, { status: 403 });
    }

    const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!googleKey) return Response.json({ error: "Google Maps API key not configured" }, { status: 500 });

    const supabaseUrl = Deno.env.get("HAWK_SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const hasSupabase = supabaseUrl && supabaseKey && supabaseUrl.startsWith("http");

    // Quota check + usage logging (only if Supabase is available)
    let sessionId = null;
    if (hasSupabase && isFinite(dailyQuota)) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);

        const { count } = await supabase
          .from("google_3d_tiles_usage")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.email)
          .gte("requested_at", dayStart.toISOString());

        if ((count ?? 0) >= dailyQuota) {
          return Response.json({
            error: "quota_exceeded",
            quota: dailyQuota,
            message: `You've used all ${dailyQuota} 3D Tile sessions for today. Resets at midnight UTC.`,
          }, { status: 429 });
        }

        // Log session
        const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
        const { data: row } = await supabase
          .from("google_3d_tiles_usage")
          .insert({ user_id: user.email, expires_at: expiresAt })
          .select("id")
          .single();
        sessionId = row?.id || null;
      } catch (supaErr) {
        // Non-fatal — Supabase table may not exist yet; allow through
        console.warn("Usage tracking unavailable:", supaErr.message);
      }
    }

    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    return Response.json({
      apiKey: googleKey,
      sessionId,
      expiresAt,
      quota: isFinite(dailyQuota) ? dailyQuota : null,
    });
  } catch (err) {
    console.error("googleTilesSession error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});