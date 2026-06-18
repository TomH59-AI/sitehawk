import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CREDITS_REWARD = 3;

function generateCode(email) {
  const base = email.split("@")[0].replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${base}-${rand}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ── Get or create the referral code for current user ─────────────────────
    if (action === "get_my_code") {
      const existing = await base44.entities.Referral.filter({ referrer_email: user.email });
      // Find the "own" referral record (not used by someone else)
      const own = existing.find(r => !r.referred_email);
      if (own) {
        return Response.json({ referral_code: own.referral_code });
      }
      // Create a new one
      const code = generateCode(user.email);
      await base44.entities.Referral.create({
        referrer_email: user.email,
        referral_code: code,
        status: "pending",
      });
      return Response.json({ referral_code: code });
    }

    // ── Called after a new user signs up via a referral link ──────────────────
    if (action === "register_referral") {
      const { referral_code } = body;
      if (!referral_code) return Response.json({ error: "referral_code required" }, { status: 400 });

      // Don't let users refer themselves
      const records = await base44.asServiceRole.entities.Referral.filter({ referral_code });
      if (!records.length) return Response.json({ error: "Invalid referral code" }, { status: 404 });

      const record = records[0];
      if (record.referrer_email === user.email) {
        return Response.json({ error: "Cannot refer yourself" }, { status: 400 });
      }
      if (record.referred_email) {
        return Response.json({ error: "Referral code already used" }, { status: 409 });
      }

      await base44.asServiceRole.entities.Referral.update(record.id, {
        referred_email: user.email,
        status: "signed_up",
      });

      return Response.json({ success: true, message: "Referral registered. Credits will be awarded after subscribing." });
    }

    // ── Called by Stripe webhook after a referred user subscribes ─────────────
    if (action === "credit_referral") {
      // Must be called server-side (admin context)
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

      const { referred_email } = body;
      const records = await base44.asServiceRole.entities.Referral.filter({ referred_email, status: "signed_up" });
      if (!records.length) return Response.json({ skipped: true, reason: "No pending referral found" });

      const record = records[0];

      // Credit referrer
      const referrerUsers = await base44.asServiceRole.entities.User.filter({ email: record.referrer_email });
      if (referrerUsers.length) {
        const referrer = referrerUsers[0];
        await base44.asServiceRole.entities.User.update(referrer.id, {
          trial_scans_remaining: (referrer.trial_scans_remaining || 0) + CREDITS_REWARD,
        });
      }

      // Credit referred user
      const referredUsers = await base44.asServiceRole.entities.User.filter({ email: referred_email });
      if (referredUsers.length) {
        const referred = referredUsers[0];
        await base44.asServiceRole.entities.User.update(referred.id, {
          trial_scans_remaining: (referred.trial_scans_remaining || 0) + CREDITS_REWARD,
        });
      }

      await base44.asServiceRole.entities.Referral.update(record.id, {
        status: "credited",
        referrer_credited: true,
        referred_credited: true,
      });

      console.log(`Referral credited: referrer=${record.referrer_email} referred=${referred_email}`);
      return Response.json({ success: true });
    }

    // ── Get referral stats for current user ───────────────────────────────────
    if (action === "get_stats") {
      const all = await base44.entities.Referral.filter({ referrer_email: user.email });
      const credited = all.filter(r => r.status === "credited").length;
      const pending = all.filter(r => r.status === "signed_up").length;
      return Response.json({ total: all.length, credited, pending, credits_earned: credited * CREDITS_REWARD });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });

  } catch (error) {
    console.error("referral error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});