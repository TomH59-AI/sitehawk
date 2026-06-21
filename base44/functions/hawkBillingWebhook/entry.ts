/**
 * hawkBillingWebhook — Stripe webhook handler for SiteHawk subscription lifecycle events.
 * Updates user subscription_tier on the User entity.
 *
 * Events handled:
 *   checkout.session.completed
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.payment_failed
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

// Map Stripe price IDs → SiteHawk tier keys
const PRICE_TO_TIER = {
  // Current prices
  "price_1TksEIIE4fOP88RJtkkAJpF3": "hawk_site",      // HawkSite Solo $299
  "price_1TksEIIE4fOP88RJjMUrsvGG": "hawk_vision",    // HawkVision Pro $599
  "price_1Tkq5CIE4fOP88RJPztKWgzB": "hawk_site_law",  // HawkSite + Hawk Law $348
  "price_1Tkq5CIE4fOP88RJGiKdRi82": "hawk_vision_law",// HawkVision + Hawk Law $499
  // Legacy prices (existing subscribers)
  "price_1Tkq5CIE4fOP88RJDsmMYlp2": "hawk_site",
  "price_1Tkq5CIE4fOP88RJBjebsjqG": "hawk_vision",
};

async function resolveUserByCustomer(base44, stripe, customerId) {
  // Try to find user by stripe_customer_id or by email from the Stripe customer
  try {
    const users = await base44.asServiceRole.entities.User.filter({ stripe_customer_id: customerId });
    if (users && users.length > 0) return users[0];
  } catch (e) { /* fall through */ }

  // Fall back to looking up customer email in Stripe then matching User
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.email) {
      const byEmail = await base44.asServiceRole.entities.User.filter({ email: customer.email });
      if (byEmail && byEmail.length > 0) return byEmail[0];
    }
  } catch (e) { /* fall through */ }

  return null;
}

async function updateUserTier(base44, stripe, customerId, tierKey, subscriptionStatus, stripeSubId) {
  const user = await resolveUserByCustomer(base44, stripe, customerId);
  if (!user) {
    console.warn(`[hawkBillingWebhook] No user found for customer ${customerId}`);
    return;
  }

  const update = {
    subscription_tier: tierKey,
    subscription_status: subscriptionStatus,
    stripe_customer_id: customerId,
  };
  if (stripeSubId) update.stripe_subscription_id = stripeSubId;

  await base44.asServiceRole.entities.User.update(user.id, update);
  console.log(`[hawkBillingWebhook] Updated user ${user.email} → tier=${tierKey} status=${subscriptionStatus}`);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error('[hawkBillingWebhook] Signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`[hawkBillingWebhook] Event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = sub.items.data[0]?.price?.id;
        const tier = PRICE_TO_TIER[priceId] || 'hawk_site';
        await updateUserTier(base44, stripe, session.customer, tier, 'active', sub.id);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const priceId = sub.items.data[0]?.price?.id;
        const tier = PRICE_TO_TIER[priceId] || 'hawk_site';
        const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status;
        await updateUserTier(base44, stripe, sub.customer, tier, status, sub.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await updateUserTier(base44, stripe, sub.customer, 'free', 'canceled', sub.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const user = await resolveUserByCustomer(base44, stripe, invoice.customer);
        if (user) {
          await base44.asServiceRole.entities.User.update(user.id, { subscription_status: 'past_due' });
          console.log(`[hawkBillingWebhook] Marked user ${user.email} as past_due`);
        }
        break;
      }

      default:
        console.log(`[hawkBillingWebhook] Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error(`[hawkBillingWebhook] Handler error for ${event.type}:`, err.message);
    return new Response('Handler error', { status: 500 });
  }

  return Response.json({ received: true });
});