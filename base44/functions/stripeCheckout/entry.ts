import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

const PRICE_IDS = {
  monthly: 'price_1TLrQ2IE4fOP88RJhl9VmgNy',
  annual: 'price_1TLrQ2IE4fOP88RJMKCBSHVb',
};

const TRIAL_SCANS = {
  monthly: 1,
  annual: 2,
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