import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const base44 = createClientFromRequest(req);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const userEmail = session.metadata?.user_email;
        const plan = session.metadata?.plan;
        if (!userEmail || !plan) break;

        console.log(`Checkout completed for ${userEmail}, plan: ${plan}`);

        const TRIAL_SCANS = { hawk_site: 1, hawkeyes: 5, hawkeye_apex: 10, monthly: 1, annual: 2 };
        const trialScans = TRIAL_SCANS[plan] || 0;

        const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
        if (users.length) {
          const u = users[0];
          await base44.asServiceRole.entities.User.update(u.id, {
            tier: plan,
            trial_scans_remaining: (u.trial_scans_remaining || 0) + trialScans,
            subscription_plan: plan,
            stripe_customer_id: session.customer,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;
        console.log(`Subscription cancelled for customer: ${customerId}`);

        const users = await base44.asServiceRole.entities.User.filter({ stripe_customer_id: customerId });
        if (users.length) {
          await base44.asServiceRole.entities.User.update(users[0].id, {
            tier: 'blind',
            subscription_plan: null,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const status = sub.status;
        console.log(`Subscription updated for customer: ${customerId}, status: ${status}`);

        if (status === 'active') {
          // Subscription renewed or reactivated — keep tier intact
        } else if (status === 'past_due' || status === 'unpaid' || status === 'canceled') {
          const users = await base44.asServiceRole.entities.User.filter({ stripe_customer_id: customerId });
          if (users.length) {
            await base44.asServiceRole.entities.User.update(users[0].id, {
              tier: 'blind',
              subscription_plan: null,
            });
          }
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        console.log(`Invoice paid: ${invoice.id} for customer ${invoice.customer}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log(`Invoice payment FAILED: ${invoice.id} for customer ${invoice.customer}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});