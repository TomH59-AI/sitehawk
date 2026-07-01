/**
 * hawkBillingCheckout — create a Stripe Checkout session for SiteHawk subscription tiers.
 * Accepts { price_id, success_url, cancel_url }
 * Returns { url } — the Stripe hosted checkout URL.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const PRICE_TO_TIER = {
  "price_1TksEIIE4fOP88RJtkkAJpF3": "hawk_site",
  "price_1TksEIIE4fOP88RJjMUrsvGG": "hawk_vision",
  "price_1Tkq5CIE4fOP88RJPztKWgzB": "hawk_site_law",
  "price_1Tkq5CIE4fOP88RJGiKdRi82": "hawk_vision_law",
  "price_1Tkq5CIE4fOP88RJDsmMYlp2": "hawk_site",
  "price_1Tkq5CIE4fOP88RJBjebsjqG": "hawk_vision",
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { price_id, success_url, cancel_url } = await req.json();
    if (!price_id) return Response.json({ error: 'price_id required' }, { status: 400 });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // Reuse existing customer if we have one stored on the user
    let customerId = user.stripe_customer_id || undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.full_name || user.email,
        metadata: { base44_user_id: user.id, base44_app_id: Deno.env.get('BASE44_APP_ID') },
      });
      customerId = customer.id;
      // Persist customer ID on user profile
      await base44.auth.updateMe({ stripe_customer_id: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: success_url || `${req.headers.get('origin') || 'https://app.sitehawk.io'}/billing?success=1`,
      cancel_url: cancel_url || `${req.headers.get('origin') || 'https://app.sitehawk.io'}/pricing`,
      allow_promotion_codes: true,
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        user_email: user.email,
      },
      subscription_data: {
        metadata: {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          user_email: user.email,
          plan_key: PRICE_TO_TIER[price_id] || 'hawk_site',
        },
      },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('[hawkBillingCheckout] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});