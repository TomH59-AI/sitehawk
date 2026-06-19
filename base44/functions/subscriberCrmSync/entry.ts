import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Upsert a SubscriberCRMContact for the CURRENT signed-in user (or, when an
// admin passes a target_email, for that subscriber). On first creation it logs
// a "signup" activity and (optionally) creates an admin welcome-call task.
//
// Safe to call on every login/app boot — it is idempotent and only records
// what it can see. Marketing consent is NEVER assumed: marketing_opt_in stays
// false unless explicitly passed with consent_source.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // Self-sync (any signed-in user keeps their own CRM contact current) OR
    // admin sync of another subscriber by email.
    const isAdmin = me.role === 'admin';
    const target = isAdmin && body.target_email ? body.target_email : me.email;
    const isSelf = target === me.email;

    if (!isSelf && !isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = base44.asServiceRole;
    const existing = await svc.entities.SubscriberCRMContact.filter({ email: target }, '-created_date', 1);
    const now = new Date().toISOString();

    // Marketing consent — only set when explicitly provided.
    const consentPatch = {};
    if (typeof body.marketing_opt_in === 'boolean') {
      consentPatch.marketing_opt_in = body.marketing_opt_in;
      consentPatch.consent_source = body.consent_source || 'signup';
      consentPatch.consent_timestamp = now;
    }

    if (existing[0]) {
      const c = existing[0];
      const patch = {
        last_login_at: now,
        last_active_at: now,
        name: isSelf ? (me.full_name || c.name) : c.name,
        user_id: isSelf ? me.id : c.user_id,
        ...consentPatch,
      };
      const updated = await svc.entities.SubscriberCRMContact.update(c.id, patch);
      await svc.entities.SubscriberCRMActivity.create({
        subscriber_contact_id: c.id, type: 'login', actor: 'system',
        summary: `Login by ${target}`,
      });
      return Response.json({ contact: updated, created: false });
    }

    // First time we see this subscriber — create the contact.
    const created = await svc.entities.SubscriberCRMContact.create({
      email: target,
      name: isSelf ? (me.full_name || '') : (body.name || ''),
      user_id: isSelf ? me.id : (body.user_id || undefined),
      signup_source: body.signup_source || 'app',
      subscription_tier: body.subscription_tier || 'Trial',
      subscription_status: body.subscription_status || 'trialing',
      signup_date: now,
      last_login_at: now,
      last_active_at: now,
      transactional_email_allowed: true,
      marketing_opt_in: false,
      churn_risk: 'unknown',
      ...consentPatch,
    });

    await svc.entities.SubscriberCRMActivity.create({
      subscriber_contact_id: created.id, type: 'signup', actor: 'system',
      summary: `New subscriber: ${target}`,
    });

    // Welcome email to new subscriber via Resend
    try {
      const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
      if (RESEND_KEY && created.email) {
        const firstName = (created.name || '').split(' ')[0] || 'there';
        const welcomeHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0e17;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#0a0e17;">
    <div style="background:#111827;padding:28px 24px;text-align:center;border-bottom:1px solid #1e293b;">
      <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/skywave-hawk.png" alt="SiteHawk" width="52" height="52" style="border-radius:10px;display:inline-block;margin-bottom:10px;"/>
      <div style="font-weight:700;font-size:20px;color:#f8fafc;letter-spacing:0.22em;">SITEHAWK</div>
      <div style="font-size:10px;color:#00d4ff;letter-spacing:0.22em;margin-top:4px;">WHEN YOU NEED THE AI VISION™</div>
    </div>
    <div style="padding:32px 28px;">
      <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#f8fafc;">Welcome to SiteHawk, ${firstName}! 🦅</h1>
      <p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 14px 0;">You're now set up and ready to run your first site acquisition search. SiteHawk gives you AI-powered parcel targeting, zoning research, RF analysis, and direct mail — all in one workflow.</p>
      <p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 20px 0;"><strong style="color:#f8fafc;">To get started:</strong> head to Site Search, drop a SARF center coordinate, and run your first pipeline. Your first few Search Rings are on us.</p>
      <a href="https://app.sitehawk.io/search" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.03em;">Start Your First Search →</a>
      <p style="font-size:13px;line-height:1.6;color:#94a3b8;margin:24px 0 0 0;">Questions? Reply to this email or <a href="https://calendly.com/hodges-thomas" style="color:#00d4ff;">book a quick call with Tom</a>.</p>
    </div>
    <div style="background:#111827;border-top:1px solid #1e293b;padding:18px 24px;text-align:center;">
      <div style="font-size:10px;color:#475569;letter-spacing:0.14em;text-transform:uppercase;">SiteHawk · Powered by SkyWave AI · "When you need the AI Vision"™</div>
    </div>
  </div>
</body></html>`;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'SiteHawk <info@site-hawk-pro.com>',
            to: [created.email],
            subject: `Welcome to SiteHawk, ${firstName}! 🦅`,
            html: welcomeHtml,
          }),
        });
        console.log(`Welcome email sent to ${created.email}`);
      }
    } catch (emailErr) {
      console.error('Welcome email error (non-fatal):', emailErr.message);
    }

    // Optional admin welcome task.
    if (body.create_welcome_task) {
      const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      await svc.entities.SubscriberCRMTask.create({
        subscriber_contact_id: created.id,
        task_type: 'welcome_call',
        title: `Welcome call — ${created.name || target}`,
        due_date: due,
        status: 'open',
        auto_generated: true,
      });
    }

    return Response.json({ contact: created, created: true });
  } catch (error) {
    console.error('subscriberCrmSync error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});