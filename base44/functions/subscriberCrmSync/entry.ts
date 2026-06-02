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