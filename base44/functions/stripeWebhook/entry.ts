import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
const LOB_API_KEY = Deno.env.get('LOB_API_KEY_SECRET');

// Parse a mailing address string into Lob's required fields (best-effort)
function parseAddress(raw) {
  if (!raw) return null;
  // Try to split "123 Main St, City, ST 12345" or "123 Main St\nCity, ST 12345"
  const normalized = raw.replace(/\n/g, ', ');
  const parts = normalized.split(',').map(s => s.trim());
  if (parts.length < 3) return null;
  const lastPart = parts[parts.length - 1]; // "ST 12345"
  const stateZip = lastPart.trim().split(' ');
  const zip = stateZip[stateZip.length - 1];
  const state = stateZip[stateZip.length - 2] || '';
  const city = parts[parts.length - 2] || '';
  const line1 = parts.slice(0, parts.length - 2).join(', ');
  return { line1, city, state, zip };
}

async function fulfillSingleProposition(meta, base44) {
  const { draft_key, user_email } = meta;
  if (!draft_key || !user_email) throw new Error("Missing draft_key or user_email on single_proposition metadata");

  // Pull draft back off the user record (we stashed it during checkout creation)
  const users = await base44.asServiceRole.entities.User.filter({ email: user_email });
  if (!users.length) throw new Error(`User ${user_email} not found`);
  const u = users[0];
  const drafts = u.pending_propositions || {};
  const draft = drafts[draft_key];
  if (!draft) throw new Error(`Draft ${draft_key} not found on user ${user_email}`);

  const {
    letter_body, owner_name, mailing_address, parcel_address,
    sender_company, sender_address, sender_phone, sender_email, tonality,
  } = draft;

  const toAddr = parseAddress(mailing_address);
  if (!toAddr) throw new Error(`Could not parse recipient address: ${mailing_address}`);
  const fromAddr = parseAddress(sender_address) || { line1: "100 SkyWave HQ", city: "Miami", state: "FL", zip: "33101" };
  const senderName = sender_company || user_email || "SiteHawk";

  const contactLine = [
    sender_phone ? `Phone: ${sender_phone}` : null,
    sender_email ? `Email: ${sender_email}` : null,
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const html = `<html><body style="font-family:Georgia,serif;font-size:12.5px;line-height:1.7;padding:0.85in 0.9in;max-width:7.2in;color:#111;">
    <div style="margin-bottom:24px;">
      <div style="font-weight:bold;font-size:14px;">${senderName}</div>
      ${sender_address ? `<div style="font-size:11px;color:#444;">${sender_address}</div>` : ""}
      ${contactLine ? `<div style="font-size:11px;color:#444;">${contactLine}</div>` : ""}
    </div>
    <div style="margin-bottom:22px;font-size:11px;color:#555;">${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
    <div style="margin-bottom:22px;">
      <div style="font-weight:bold;">${owner_name || "Property Owner"}</div>
      <div>${mailing_address}</div>
    </div>
    ${parcel_address ? `<div style="margin-bottom:18px;"><strong>Re:</strong> Ground Lease Opportunity — ${parcel_address}</div>` : ""}
    <div style="margin-bottom:18px;">Dear ${owner_name || "Property Owner"},</div>
    <div style="white-space:pre-wrap;">${letter_body.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</div>
    <div style="margin-top:28px;">Sincerely,</div>
    <div style="margin-top:42px;font-weight:bold;">${senderName}</div>
  </body></html>`;

  const lobPayload = {
    description: `Single-proposition letter (${tonality}) — ${owner_name}`,
    to: {
      name: owner_name || "Property Owner",
      address_line1: toAddr.line1,
      address_city: toAddr.city,
      address_state: toAddr.state,
      address_zip: toAddr.zip,
      address_country: "US",
    },
    from: {
      name: senderName,
      address_line1: fromAddr.line1,
      address_city: fromAddr.city,
      address_state: fromAddr.state,
      address_zip: fromAddr.zip,
      address_country: "US",
    },
    file: html,
    color: false,
  };

  const res = await fetch("https://api.lob.com/v1/letters", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(LOB_API_KEY + ":")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(lobPayload),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`Lob single-proposition failed: ${JSON.stringify(result)}`);
  console.log(`Single-proposition letter mailed: ${owner_name} → Lob ID ${result.id}, ETA ${result.expected_delivery_date}`);

  // Clean up the stashed draft
  const remaining = { ...drafts };
  delete remaining[draft_key];
  await base44.asServiceRole.entities.User.update(u.id, { pending_propositions: remaining });
}

async function fulfillDirectMail(meta) {
  const {
    letters, owner_name, mailing_address, parcel_address,
    sender_company, sender_address, sender_phone, sender_email, user_email
  } = meta;

  const numLetters = parseInt(letters) || 3;

  // Parse recipient address
  const toAddr = parseAddress(mailing_address);
  if (!toAddr) throw new Error(`Could not parse mailing address: ${mailing_address}`);

  // Parse sender return address (fallback to a placeholder if not provided)
  const fromAddr = parseAddress(sender_address) || {
    line1: '100 SkyWave HQ',
    city: 'Miami',
    state: 'FL',
    zip: '33101',
  };

  const senderName = sender_company || user_email || 'SiteHawk';

  // Send each letter spaced 7 days apart using Lob's scheduled send_date
  const today = new Date();
  for (let i = 0; i < numLetters; i++) {
    const sendDate = new Date(today);
    sendDate.setDate(today.getDate() + i * 7);
    const sendDateStr = sendDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const letterBody = `Dear ${owner_name || 'Property Owner'},

My name is ${senderName} and I am reaching out regarding a ground lease opportunity on your property located at ${parcel_address || 'your property'}.

We are actively seeking sites in your area to lease ground space for wireless cell tower installation. Cell tower leases typically generate $1,500–$3,500+ per month in passive income for property owners, with lease terms of 25–30 years.

Your property has been identified as a strong candidate based on its location, size, and zoning. This requires only a small footprint (~50x50 ft) and will not interfere with your property's primary use. There is NO COST to you — we handle all permitting, construction, and maintenance.

If you are interested, please contact us${sender_phone ? ' at ' + sender_phone : ''}${sender_email ? ' or ' + sender_email : ''}.

Sincerely,
${senderName}`;

    const lobPayload = {
      description: `Letter ${i + 1} of ${numLetters} — ${owner_name}`,
      to: {
        name: owner_name || 'Property Owner',
        address_line1: toAddr.line1,
        address_city: toAddr.city,
        address_state: toAddr.state,
        address_zip: toAddr.zip,
        address_country: 'US',
      },
      from: {
        name: senderName,
        address_line1: fromAddr.line1,
        address_city: fromAddr.city,
        address_state: fromAddr.state,
        address_zip: fromAddr.zip,
        address_country: 'US',
      },
      file: `<html><body style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;padding:60px 80px;max-width:700px;">${letterBody.replace(/\n/g, '<br/>')}</body></html>`,
      color: false,
      send_date: sendDateStr,
    };

    const res = await fetch('https://api.lob.com/v1/letters', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(LOB_API_KEY + ':')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lobPayload),
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(`Lob letter ${i + 1} failed: ${JSON.stringify(result)}`);
    }
    console.log(`Lob letter ${i + 1}/${numLetters} scheduled for ${sendDateStr} — ID: ${result.id}`);
  }

  console.log(`Direct mail fulfillment complete: ${numLetters} letters queued for ${owner_name} at ${mailing_address}`);
}

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
        const type = session.metadata?.type;

        // ── Direct Mail Fulfillment via Lob ──
        if (type === 'direct_mail') {
          try {
            await fulfillDirectMail(session.metadata);
          } catch (lobErr) {
            console.error('Lob fulfillment error:', lobErr.message);
          }
          break;
        }

        // ── Hawk Postcard Candidate Mailers via Lob (post-payment) ──
        if (type === 'target_postcard') {
          try {
            const draftKey = session.metadata?.draft_key;
            if (!userEmail || !draftKey) throw new Error('Missing user_email or draft_key on target_postcard metadata');
            const pcUsers = await base44.asServiceRole.entities.User.filter({ email: userEmail });
            if (!pcUsers.length) throw new Error(`User ${userEmail} not found`);
            const pcUser = pcUsers[0];
            const drafts = pcUser.pending_postcards || {};
            const draft = drafts[draftKey];
            if (!draft) throw new Error(`Postcard draft ${draftKey} not found`);

            // Fire the actual Lob send via the existing postcard function (service role).
            const res = await base44.asServiceRole.functions.invoke('sendTargetPostcards', {
              action: 'send',
              targets: draft.targets,
              sender: draft.sender,
              message: draft.message,
              bonus_count: draft.bonus_count,
            });
            console.log(`Target-postcard fulfillment for ${userEmail}:`, JSON.stringify(res?.data || res));

            const remaining = { ...drafts };
            delete remaining[draftKey];
            await base44.asServiceRole.entities.User.update(pcUser.id, { pending_postcards: remaining });
          } catch (pcErr) {
            console.error('Target-postcard fulfillment error:', pcErr.message);
          }
          break;
        }

        // ── Single-Landlord Proposition Letter via Lob ──
        if (type === 'single_proposition') {
          try {
            await fulfillSingleProposition(session.metadata, base44);
          } catch (lobErr) {
            console.error('Single-proposition fulfillment error:', lobErr.message);
          }
          break;
        }

        // ── Hawk Compliance subscription unlock ──
        if (type === 'hawk_compliance') {
          if (userEmail) {
            const cUsers = await base44.asServiceRole.entities.User.filter({ email: userEmail });
            if (cUsers.length) {
              await base44.asServiceRole.entities.User.update(cUsers[0].id, {
                hawk_compliance_active: true,
                stripe_customer_id: session.customer,
              });
              console.log(`Hawk Compliance unlocked for ${userEmail}`);
            }
          }
          break;
        }

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

        // Credit referral if this user was referred
        try {
          const referrals = await base44.asServiceRole.entities.Referral.filter({ referred_email: userEmail, status: "signed_up" });
          if (referrals.length) {
            const referral = referrals[0];
            const REFERRAL_CREDITS = 5;

            // Credit referrer
            const referrers = await base44.asServiceRole.entities.User.filter({ email: referral.referrer_email });
            if (referrers.length) {
              await base44.asServiceRole.entities.User.update(referrers[0].id, {
                trial_scans_remaining: (referrers[0].trial_scans_remaining || 0) + REFERRAL_CREDITS,
              });
            }

            // Credit referred user
            if (users.length) {
              await base44.asServiceRole.entities.User.update(users[0].id, {
                trial_scans_remaining: (users[0].trial_scans_remaining || 0) + REFERRAL_CREDITS,
              });
            }

            await base44.asServiceRole.entities.Referral.update(referral.id, {
              status: "credited",
              referrer_credited: true,
              referred_credited: true,
            });

            console.log(`Referral credited: referrer=${referral.referrer_email} referred=${userEmail}`);
          }
        } catch (refErr) {
          console.error("Referral credit error:", refErr.message);
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;
        console.log(`Subscription cancelled for customer: ${customerId}`);

        // If the cancelled subscription was Hawk Compliance, lock it back.
        const isCompliance = sub.metadata?.type === 'hawk_compliance' || sub.metadata?.plan === 'hawk_compliance';
        const users = await base44.asServiceRole.entities.User.filter({ stripe_customer_id: customerId });
        if (users.length) {
          if (isCompliance) {
            await base44.asServiceRole.entities.User.update(users[0].id, { hawk_compliance_active: false });
            console.log(`Hawk Compliance locked for customer ${customerId}`);
          } else {
            await base44.asServiceRole.entities.User.update(users[0].id, {
              tier: 'blind',
              subscription_plan: null,
            });
          }
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