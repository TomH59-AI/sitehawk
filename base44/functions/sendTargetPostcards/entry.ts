import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

// SiteHawk — Target Postcard Mailer.
// Sends engaging 6x9 postcards to up to 3 target property owners pitching a
// cellular-tower ground lease. The user supplies their own sender contact info
// which is printed on the card so owners can respond directly.
//
// Two phases:
//   action="quote"  → validates recipients + returns the charge breakdown (no send)
//   action="send"   → charges the user, then creates the Lob postcards
//
// Pricing (what the app charges the user):
//   $12.00 flat for the primary batch (up to 3 postcards).
//   $1.00 flat add-on for a bonus batch (up to 3 more postcards).

const LOB_POSTCARDS_URL = 'https://api.lob.com/v1/postcards';
const PRIMARY_BATCH_USD = 12.0; // flat — up to 3 cards
const BONUS_BATCH_USD = 1.0;    // flat — up to 3 bonus cards

function parseMailingAddress(str) {
  if (!str) return null;
  const parts = str.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const street = parts[0];
  const city = parts[1];
  const stateZip = (parts[2] || '').split(/\s+/);
  return { street, city, state: stateZip[0] || '', zip: stateZip[1] || '' };
}

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Front — bold, engaging hook.
function postcardFront(target) {
  const addr = esc(target.parcel_address || 'your property');
  return `<html><head><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Helvetica Neue',Arial,sans-serif;}
    .wrap{width:8.75in;height:5.75in;padding:0.45in;background:linear-gradient(135deg,#0b3d91 0%,#1769e0 55%,#19a7d8 100%);color:#fff;display:flex;flex-direction:column;justify-content:center;}
    .kicker{font-size:15px;letter-spacing:3px;text-transform:uppercase;color:#ffd24a;font-weight:700;margin-bottom:14px;}
    h1{font-size:46px;line-height:1.05;font-weight:800;margin-bottom:18px;}
    p{font-size:20px;line-height:1.4;max-width:6.2in;}
    .gold{color:#ffd24a;font-weight:800;}
    .addr{margin-top:20px;font-size:15px;opacity:.9;}
  </style></head><body><div class="wrap">
    <div class="kicker">Cellular Tower Lease Opportunity</div>
    <h1>Your land could earn<br/><span class="gold">monthly income</span> — for decades.</h1>
    <p>We've identified <strong>${addr}</strong> as a strong candidate for a new wireless communications tower. Property owners in lease agreements like this can receive <span class="gold">reliable, long-term rent</span> with little to no impact on how they use their land.</p>
    <div class="addr">Re: ${addr}</div>
  </div></body></html>`;
}

// Back — personalized pitch + the user's contact info so owners can respond.
// `message` (optional) is a custom/HawkBot-drafted body that replaces the
// default 3-paragraph pitch. It's plain text; newlines become paragraphs.
function postcardBack(target, sender, message) {
  const owner = esc(target.owner_name || 'Property Owner');
  const company = esc(sender.company || sender.name || 'SiteHawk Land Acquisition');
  const name = esc(sender.name || '');
  const phone = esc(sender.phone || '');
  const email = esc(sender.email || '');
  const addr = esc(sender.address || '');
  const customBody = String(message || '').trim();
  const bodyHtml = customBody
    ? customBody.split(/\n{1,}/).map((p) => `<p>${esc(p.trim())}</p>`).join('')
    : `<p>Wireless carriers are expanding coverage in your area, and your property's location makes it a real candidate for a ground lease. These leases are designed to be <strong>low-impact</strong> and provide <strong>steady monthly income</strong> over a long term.</p>
      <p>There is <strong>no cost and no obligation</strong> to learn more. I'd be glad to walk you through what a lease could look like for your specific parcel.</p>
      <p>Please reach out anytime — I'd love to talk.</p>`;
  return `<html><head><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Helvetica Neue',Arial,sans-serif;color:#13233f;}
    .wrap{width:8.75in;height:5.75in;padding:0.45in;display:flex;flex-direction:column;justify-content:space-between;}
    .msg p{font-size:15.5px;line-height:1.55;margin-bottom:10px;max-width:5.2in;}
    h2{font-size:20px;color:#1769e0;margin-bottom:10px;}
    .cta{margin-top:8px;padding:14px 16px;background:#f3f7ff;border-left:4px solid #1769e0;border-radius:6px;}
    .cta .lbl{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7a90;font-weight:700;}
    .cta .who{font-size:17px;font-weight:800;color:#0b3d91;margin-top:2px;}
    .cta .line{font-size:14px;color:#13233f;margin-top:3px;}
  </style></head><body><div class="wrap">
    <div class="msg">
      <h2>Dear ${owner},</h2>
      ${bodyHtml}
    </div>
    <div class="cta">
      <div class="lbl">Contact Me Directly</div>
      <div class="who">${name || company}</div>
      ${name && company ? `<div class="line">${company}</div>` : ''}
      ${phone ? `<div class="line">📞 ${phone}</div>` : ''}
      ${email ? `<div class="line">✉️ ${email}</div>` : ''}
      ${addr ? `<div class="line">${addr}</div>` : ''}
    </div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) ?? {};
    const { action, targets, sender, message } = body;

    if (!Array.isArray(targets) || !targets.length) {
      return Response.json({ error: 'targets array is required' }, { status: 400 });
    }
    // Up to 3 primary targets ($12 flat) + up to 3 bonus targets ($1 flat add-on).
    if (targets.length > 6) {
      return Response.json({ error: 'You can mail at most 6 targets at a time (3 primary + 3 bonus).' }, { status: 400 });
    }

    // Validate addresses + build the charge preview.
    const validated = targets.map((t) => {
      const parsed = parseMailingAddress(t.mailing_address || t.owner_mailing_address || t.parcel_address);
      return {
        owner_name: t.owner_name,
        parcel_address: t.parcel_address,
        mailing_address: t.mailing_address || t.owner_mailing_address || t.parcel_address,
        // Per-recipient message (template merge fields already resolved client-side).
        // Falls back to the shared `message` when absent.
        message: t.message,
        parsed,
        valid: !!(parsed && parsed.street && parsed.city && parsed.state),
      };
    });
    const validCount = validated.filter((v) => v.valid).length;

    if (action === 'quote') {
      const bonusCount = Math.min(Math.max(parseInt(body.bonus_count, 10) || 0, 0), 3);
      const hasPrimary = validCount - bonusCount > 0;
      const total = (hasPrimary ? PRIMARY_BATCH_USD : 0) + (bonusCount > 0 ? BONUS_BATCH_USD : 0);
      return Response.json({
        recipients: validated,
        valid_count: validCount,
        primary_batch_usd: PRIMARY_BATCH_USD,
        bonus_batch_usd: BONUS_BATCH_USD,
        total_cost_usd: total,
      });
    }

    // ── checkout: create a Stripe session; fulfillment happens in the webhook ──
    if (action === 'checkout') {
      if (!sender?.name && !sender?.company) {
        return Response.json({ error: 'Sender contact name or company is required.' }, { status: 400 });
      }
      if (validCount === 0) {
        return Response.json({ error: 'No valid mailing addresses to send to.' }, { status: 400 });
      }
      const bonusCount = Math.min(Math.max(parseInt(body.bonus_count, 10) || 0, 0), 3);
      const hasPrimary = validCount - bonusCount > 0;
      const totalCents = Math.round(((hasPrimary ? PRIMARY_BATCH_USD : 0) + (bonusCount > 0 ? BONUS_BATCH_USD : 0)) * 100);
      if (totalCents <= 0) return Response.json({ error: 'Nothing to charge.' }, { status: 400 });

      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
      const origin = req.headers.get('origin') || 'https://app.base44.com';

      // Stash the full mailer payload on the user so the webhook can fulfill it
      // post-payment without exceeding Stripe's metadata size limits.
      const draftKey = `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
      if (users.length) {
        const u = users[0];
        const drafts = u.pending_postcards || {};
        drafts[draftKey] = { targets, sender, message: message || '', bonus_count: bonusCount };
        await base44.asServiceRole.entities.User.update(u.id, { pending_postcards: drafts });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: totalCents,
            product_data: {
              name: 'Hawk Postcard Candidate Mailers',
              description: `${validCount} personalized cell-tower-lease postcard(s) mailed to your selected targets`,
            },
          },
          quantity: 1,
        }],
        customer_email: user.email,
        success_url: `${origin}${body.return_path || '/results'}?postcard_success=1`,
        cancel_url: `${origin}${body.return_path || '/results'}?postcard_cancel=1`,
        metadata: {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          type: 'target_postcard',
          user_email: user.email,
          draft_key: draftKey,
        },
      });
      console.log(`Target-postcard checkout created: ${validCount} cards ($${(totalCents / 100).toFixed(2)}) for ${user.email}`);
      return Response.json({ url: session.url });
    }

    if (action === 'send') {
      if (!sender?.name && !sender?.company) {
        return Response.json({ error: 'Sender contact name or company is required.' }, { status: 400 });
      }
      if (validCount === 0) {
        return Response.json({ error: 'No valid mailing addresses to send to.' }, { status: 400 });
      }
      // Pricing: $12 flat for the primary batch (up to 3); $1 flat for the bonus batch (up to 3).
      const bonusCount = Math.min(Math.max(parseInt(body.bonus_count, 10) || 0, 0), 3);
      const primaryCount = Math.max(validCount - bonusCount, 0);

      const key = Deno.env.get('LOB_API_KEY_SECRET') || Deno.env.get('LOB_API_KEY');
      if (!key) return Response.json({ error: 'Server missing Lob API key.' }, { status: 500 });
      const mode = key.startsWith('live') ? 'LIVE' : 'TEST';
      const auth = 'Basic ' + btoa(`${key}:`);

      const results = [];
      for (const r of validated) {
        if (!r.valid) {
          results.push({ owner_name: r.owner_name, status: 'skipped', reason: 'Invalid address' });
          continue;
        }
        try {
          const form = new URLSearchParams();
          form.set('description', `SiteHawk target postcard — ${r.owner_name || 'owner'}`);
          form.set('to[name]', r.owner_name || 'Property Owner');
          form.set('to[address_line1]', r.parsed.street);
          form.set('to[address_city]', r.parsed.city);
          form.set('to[address_state]', r.parsed.state);
          form.set('to[address_zip]', r.parsed.zip || '');
          form.set('from[name]', sender.company || sender.name);
          // Sender return address (optional) — only set if a parseable address given.
          const sParsed = parseMailingAddress(sender.address);
          if (sParsed?.street && sParsed?.city && sParsed?.state) {
            form.set('from[address_line1]', sParsed.street);
            form.set('from[address_city]', sParsed.city);
            form.set('from[address_state]', sParsed.state);
            form.set('from[address_zip]', sParsed.zip || '');
          }
          form.set('front', postcardFront(r));
          form.set('back', postcardBack(r, sender, r.message || message));
          form.set('size', '6x9');

          const resp = await fetch(LOB_POSTCARDS_URL, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
          });
          const data = await resp.json();
          if (!resp.ok) {
            results.push({ owner_name: r.owner_name, status: 'failed', reason: data?.error?.message || `Lob ${resp.status}` });
          } else {
            results.push({
              owner_name: r.owner_name,
              status: 'sent',
              lob_id: data?.id,
              expected_delivery: data?.expected_delivery_date,
              url: data?.url,
            });
          }
        } catch (e) {
          results.push({ owner_name: r.owner_name, status: 'failed', reason: e.message });
        }
      }

      const sent = results.filter((r) => r.status === 'sent').length;
      // Charge: flat $12 if any primary card sent + flat $1 if any bonus card sent.
      const sentPrimary = Math.min(sent, primaryCount);
      const sentBonus = Math.max(sent - sentPrimary, 0);
      const charged = (sentPrimary > 0 ? PRIMARY_BATCH_USD : 0) + (sentBonus > 0 ? BONUS_BATCH_USD : 0);
      console.log(`sendTargetPostcards: ${sent}/${validCount} sent (${mode}, ${sentBonus} bonus) by ${user.email}`);
      return Response.json({
        sent,
        total: validCount,
        mode,
        charged_usd: charged,
        results,
      });
    }

    return Response.json({ error: "action must be 'quote' or 'send'" }, { status: 400 });
  } catch (err) {
    console.error('sendTargetPostcards error:', err?.message ?? err);
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
});