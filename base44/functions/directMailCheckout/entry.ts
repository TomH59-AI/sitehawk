import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

// Direct mail pricing (you charge the user, you fulfill via Lob first-class)
// 3-letter: charge $19.99, cost ~$3 (Lob B&W first-class), profit ~$16 (80% margin)
// 5-letter: charge $29.00, cost ~$5 (Lob B&W first-class), profit ~$23 (78% margin)
const MAIL_PLANS = {
  "3_letters": {
    name: "3-Letter Direct Mail Campaign",
    price_cents: 1999,
    letters: 3,
  },
  "5_letters": {
    name: "5-Letter Direct Mail Campaign",
    price_cents: 2900,
    letters: 5,
  },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { plan, owner_name, mailing_address, parcel_address, search_id, candidate_id,
            sender_company, sender_address, sender_phone, sender_email, sender_logo_url } = body;

    if (!plan || !MAIL_PLANS[plan]) {
      return Response.json({ error: 'Invalid plan. Use "3_letters" or "5_letters".' }, { status: 400 });
    }
    if (!mailing_address) {
      return Response.json({ error: 'Mailing address is required.' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const selected = MAIL_PLANS[plan];

    // Check if running from iframe (prevent checkout)
    const origin = req.headers.get('origin') || '';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: selected.price_cents,
            product_data: {
              name: selected.name,
              description: `${selected.letters} personalized acquisition letters mailed to: ${mailing_address}`,
            },
          },
          quantity: 1,
        },
      ],
      customer_email: user.email,
      success_url: `${origin || 'https://app.base44.com'}/results?mail_success=1&search_id=${search_id || ''}`,
      cancel_url: `${origin || 'https://app.base44.com'}/results?search_id=${search_id || ''}`,
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        type: 'direct_mail',
        plan,
        letters: String(selected.letters),
        owner_name: owner_name || '',
        mailing_address,
        parcel_address: parcel_address || '',
        search_id: search_id || '',
        candidate_id: candidate_id || '',
        user_email: user.email,
        sender_company: sender_company || '',
        sender_address: sender_address || '',
        sender_phone: sender_phone || '',
        sender_email: sender_email || '',
        sender_logo_url: sender_logo_url || '',
      },
    });

    console.log(`Direct mail checkout created: ${plan} for ${owner_name} at ${mailing_address} by ${user.email}`);
    return Response.json({ url: session.url });

  } catch (error) {
    console.error('directMailCheckout error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});