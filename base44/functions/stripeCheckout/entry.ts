import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

// hawk_site = $69/mo | hawkeyes = $199/mo | hawkeye_apex = contact sales (no checkout)
const PRICE_IDS = {
  hawk_site: 'price_1TMUQXIE4fOP88RJjL3nPcbS',
  hawkeyes: 'price_1TMUQXIE4fOP88RJZShRn1v0',
  hawk_compliance: 'price_1TdJlxIE4fOP88RJBeqKRVgw',
};

const TRIAL_SCANS = {
  hawk_site: 1,
  hawkeyes: 5,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, plan } = body;

    // ── CHECKOUT ──────────────────────────────────────────────
    if (action === 'checkout') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      const priceId = PRICE_IDS[plan];
      if (!priceId) return Response.json({ error: 'Invalid plan' }, { status: 400 });

      const origin = req.headers.get('origin') || 'https://app.base44.com';

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: user.email,
        success_url: `${origin}/pricing?checkout=success&plan=${plan}`,
        cancel_url: `${origin}/pricing`,
        metadata: {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          user_email: user.email,
          plan,
        },
        subscription_data: {
          metadata: {
            base44_app_id: Deno.env.get('BASE44_APP_ID'),
            user_email: user.email,
            plan,
          },
        },
      });

      return Response.json({ url: session.url });
    }

    // ── HAWK COMPLIANCE CHECKOUT ──────────────────────────────
    if (action === 'compliance_checkout') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      const origin = req.headers.get('origin') || 'https://app.base44.com';
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: PRICE_IDS.hawk_compliance, quantity: 1 }],
        customer_email: user.email,
        success_url: `${origin}/hawk-compliance?checkout=success`,
        cancel_url: `${origin}/hawk-compliance`,
        metadata: {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          user_email: user.email,
          plan: 'hawk_compliance',
          type: 'hawk_compliance',
        },
        subscription_data: {
          metadata: {
            base44_app_id: Deno.env.get('BASE44_APP_ID'),
            user_email: user.email,
            plan: 'hawk_compliance',
            type: 'hawk_compliance',
          },
        },
      });
      return Response.json({ url: session.url });
    }

    // ── COMPLETE HAWK COMPLIANCE (called on success redirect; webhook is source of truth) ──
    if (action === 'complete_compliance') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      await base44.auth.updateMe({ hawk_compliance_active: true });
      return Response.json({ success: true });
    }

    // ── COMPLETE CHECKOUT (called on success redirect) ────────
    if (action === 'complete_checkout') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      const trialScans = TRIAL_SCANS[plan] || 0;
      const currentScans = user.trial_scans_remaining || 0;

      await base44.auth.updateMe({
        tier: plan,
        trial_scans_remaining: currentScans + trialScans,
        subscription_plan: plan,
      });

      return Response.json({ success: true });
    }

    // ── PORTAL ────────────────────────────────────────────────
    if (action === 'portal') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      // Find the customer by email
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (!customers.data.length) {
        return Response.json({ error: 'No billing account found.' }, { status: 404 });
      }

      const origin = req.headers.get('origin') || 'https://app.base44.com';
      const session = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: `${origin}/pricing`,
      });

      return Response.json({ url: session.url });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    console.error('stripeCheckout error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});