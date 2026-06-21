/**
 * hawkBillingPortal — create a Stripe Customer Portal session for self-serve billing management.
 * Returns { url }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { return_url } = await req.json().catch(() => ({}));
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      // Look up by email
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        await base44.auth.updateMe({ stripe_customer_id: customerId });
      } else {
        return Response.json({ error: 'No billing account found. Please subscribe first.' }, { status: 404 });
      }
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: return_url || `${req.headers.get('origin') || 'https://app.sitehawk.io'}/billing`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('[hawkBillingPortal] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});