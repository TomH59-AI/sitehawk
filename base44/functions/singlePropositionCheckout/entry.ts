/**
 * singlePropositionCheckout — Stripe one-time charge for ONE custom letter to
 * a single landlord, with the body drafted (and possibly edited) by the user.
 *
 * Pricing:
 *   $9.99 — covers Lob letter cost (~$1.50–$2), tax, payment fees, and margin.
 *
 * After payment, the Stripe webhook (`stripeWebhook` → type='single_proposition')
 * fulfills the send via Lob.
 *
 * Stripe metadata has a 500-char limit per value, so the letter body is too
 * long to fit. We persist the draft on the user via base44.auth.updateMe
 * under a keyed map (`pending_propositions[<session_id>]`) and pass just the
 * lookup key in metadata. The webhook reads it back from the user record.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const PRICE_CENTS = 999; // $9.99

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      owner_name, mailing_address, parcel_address,
      sender_company, sender_address, sender_phone, sender_email,
      letter_body, tonality,
      search_id, candidate_id,
    } = body;

    if (!mailing_address) return Response.json({ error: "Mailing address is required." }, { status: 400 });
    if (!letter_body || letter_body.trim().length < 40) {
      return Response.json({ error: "Letter body is required (min 40 chars)." }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    const origin = req.headers.get("origin") || "https://app.base44.com";

    // Stash the letter body on the user record under a draft key
    const draftKey = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const existing = user.pending_propositions || {};
    await base44.auth.updateMe({
      pending_propositions: {
        ...existing,
        [draftKey]: {
          letter_body,
          tonality: tonality || "professional",
          owner_name: owner_name || "",
          mailing_address,
          parcel_address: parcel_address || "",
          sender_company: sender_company || "",
          sender_address: sender_address || "",
          sender_phone: sender_phone || "",
          sender_email: sender_email || "",
          created_at: new Date().toISOString(),
        },
      },
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: PRICE_CENTS,
            product_data: {
              name: "SiteHawk — Single Landlord Proposition Letter",
              description: `One personalized HawkBot-drafted (${tonality || "professional"}) letter to ${owner_name || "Property Owner"} at ${mailing_address}`,
            },
          },
          quantity: 1,
        },
      ],
      customer_email: user.email,
      success_url: `${origin}/results?proposition_success=1&search_id=${search_id || ""}`,
      cancel_url: `${origin}/results?search_id=${search_id || ""}`,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        type: "single_proposition",
        draft_key: draftKey,
        user_email: user.email,
        owner_name: (owner_name || "").slice(0, 240),
        parcel_address: (parcel_address || "").slice(0, 240),
        search_id: search_id || "",
        candidate_id: candidate_id || "",
        tonality: tonality || "professional",
      },
    });

    console.log(`Single-proposition checkout created for ${user.email} → ${owner_name} (draftKey=${draftKey})`);
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("singlePropositionCheckout error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});