import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // Fetch completed checkout sessions with direct_mail type
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      expand: ['data.payment_intent'],
    });

    const mailOrders = sessions.data
      .filter(s => s.metadata?.type === 'direct_mail' && s.payment_status === 'paid')
      .map(s => ({
        id: s.id,
        created: s.created,
        amount: s.amount_total,
        plan: s.metadata.plan,
        letters: s.metadata.letters,
        owner_name: s.metadata.owner_name,
        mailing_address: s.metadata.mailing_address,
        parcel_address: s.metadata.parcel_address,
        user_email: s.metadata.user_email,
        search_id: s.metadata.search_id,
        payment_intent: s.payment_intent?.id || s.payment_intent,
        fulfillment_status: s.payment_intent?.metadata?.fulfillment_status || s.metadata.fulfillment_status || 'pending',
      }));

    return Response.json({ orders: mailOrders });
  } catch (error) {
    console.error('getMailOrders error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});