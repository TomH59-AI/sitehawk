import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

// Updates the fulfillment_status metadata on a Stripe checkout session
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { session_id, status } = await req.json();
    const VALID = ['pending', 'printing', 'mailed', 'delivered'];
    if (!session_id || !VALID.includes(status)) {
      return Response.json({ error: 'Invalid session_id or status' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // Retrieve the session to get the payment intent
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Update metadata on the payment intent (sessions are immutable after completion)
    if (session.payment_intent) {
      await stripe.paymentIntents.update(session.payment_intent, {
        metadata: { fulfillment_status: status, session_id },
      });
    }

    console.log(`Mail order ${session_id} status updated to ${status}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error('updateMailOrderStatus error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});