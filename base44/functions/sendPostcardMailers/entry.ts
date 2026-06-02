import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

/**
 * sendPostcardMailers — Postcard Mailer Pack for a ScipRecord.
 *
 * Recipients = the SCIP's parcel_targets (Target A/B/C) + up to 2 optional extra
 * already-evaluated parcels. Lob is called ONLY server-side, ONLY after payment.
 *
 * Actions:
 *   action="verify"   → Lob US address verification for each recipient (no send, no charge).
 *   action="checkout" → creates a PostcardMailerOrder (pending_payment) + Stripe session.
 *                       Does NOT call Lob. Fulfillment happens post-payment.
 *   action="fulfill"  → SERVICE-ROLE ONLY (called by stripeWebhook). Creates Lob
 *                       postcards with a per-recipient idempotency key, stores
 *                       Lob ids/status. Skips recipients already "sent".
 *
 * Pricing (configurable via env, falls back to defaults):
 *   POSTCARD_PRICE_3_USD  (default 49) — up to 3 postcards
 *   POSTCARD_PRICE_5_USD  (default 79) — 4–5 postcards
 */

const LOB_POSTCARDS_URL = 'https://api.lob.com/v1/postcards';
const LOB_VERIFY_URL = 'https://api.lob.com/v1/us_verifications';
const MAX_RECIPIENTS = 5;

function pricing() {
  const p3 = Number(Deno.env.get('POSTCARD_PRICE_3_USD')) || 49;
  const p5 = Number(Deno.env.get('POSTCARD_PRICE_5_USD')) || 79;
  return { p3, p5 };
}
function priceForCount(n) {
  const { p3, p5 } = pricing();
  if (n <= 0) return 0;
  if (n <= 3) return p3;
  return p5;
}

function lobKey() {
  const key = Deno.env.get('LOB_API_KEY_SECRET') || Deno.env.get('LOB_API_KEY');
  if (!key) throw new Error('Server missing Lob API key (LOB_API_KEY_SECRET).');
  return key;
}
function lobAuth() { return 'Basic ' + btoa(`${lobKey()}:`); }
function lobMode() { return lobKey().startsWith('live') ? 'LIVE' : 'TEST'; }

function parseMailingAddress(str) {
  if (!str) return null;
  const normalized = String(str).replace(/\n/g, ', ');
  const parts = normalized.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const street = parts[0];
  const city = parts[1];
  const stateZip = (parts[2] || '').split(/\s+/).filter(Boolean);
  return { street, city, state: stateZip[0] || '', zip: stateZip[1] || '' };
}

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Lob US address verification — returns { deliverable, note, parsed }.
async function verifyAddress(parsed) {
  if (!parsed || !parsed.street || !parsed.city || (!parsed.state && !parsed.zip)) {
    return { deliverable: false, note: 'Address is incomplete (needs street, city, state/zip).', parsed };
  }
  try {
    const form = new URLSearchParams();
    form.set('primary_line', parsed.street);
    form.set('city', parsed.city);
    if (parsed.state) form.set('state', parsed.state);
    if (parsed.zip) form.set('zip_code', parsed.zip);
    const resp = await fetch(LOB_VERIFY_URL, {
      method: 'POST',
      headers: { Authorization: lobAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await resp.json();
    if (!resp.ok) return { deliverable: false, note: data?.error?.message || `Lob verify ${resp.status}`, parsed };
    const dv = data?.deliverability || '';
    const deliverable = dv === 'deliverable' || dv === 'deliverable_unnecessary_unit' || dv === 'deliverable_incorrect_unit' || dv === 'deliverable_missing_unit';
    const verified = data?.components ? {
      street: data.primary_line || parsed.street,
      city: data.components.city || parsed.city,
      state: data.components.state || parsed.state,
      zip: data.components.zip_code || parsed.zip,
    } : parsed;
    return { deliverable, note: dv ? `Lob: ${dv}` : 'verified', parsed: verified };
  } catch (e) {
    return { deliverable: false, note: `Verify error: ${e.message}`, parsed };
  }
}

function postcardFront(r) {
  const addr = esc(r.parcel_address || 'your property');
  return `<html><head><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Helvetica Neue',Arial,sans-serif;}
    .wrap{width:8.75in;height:5.75in;padding:0.45in;background:linear-gradient(135deg,#0b3d91 0%,#1769e0 55%,#19a7d8 100%);color:#fff;display:flex;flex-direction:column;justify-content:center;}
    .kicker{font-size:15px;letter-spacing:3px;text-transform:uppercase;color:#ffd24a;font-weight:700;margin-bottom:14px;}
    h1{font-size:44px;line-height:1.07;font-weight:800;margin-bottom:16px;}
    p{font-size:19px;line-height:1.4;max-width:6.2in;}
    .gold{color:#ffd24a;font-weight:800;}
    .addr{margin-top:18px;font-size:14px;opacity:.9;}
  </style></head><body><div class="wrap">
    <div class="kicker">Cellular Tower Lease — Exploratory Inquiry</div>
    <h1>Would you consider a<br/><span class="gold">cell tower ground lease</span>?</h1>
    <p>We're exploring potential wireless tower sites in your area and wanted to ask whether you'd be open to a conversation about your property. There's no obligation — just an exploratory question.</p>
    <div class="addr">Re: ${addr}</div>
  </div></body></html>`;
}

// Factual, friendly, non-binding body. No promises of approval/rent/guaranteed lease.
function postcardBack(r, sender, message) {
  const owner = esc(r.owner_name || 'Property Owner');
  const company = esc(sender?.company || sender?.name || '');
  const name = esc(sender?.name || '');
  const phone = esc(sender?.phone || '');
  const email = esc(sender?.email || '');
  const addr = esc(sender?.address || '');
  const customBody = String(message || '').trim();
  const bodyHtml = customBody
    ? customBody.split(/\n{1,}/).map((p) => `<p>${esc(p.trim())}</p>`).join('')
    : `<p>We're researching possible locations for a wireless communications tower and your property came up as worth a conversation.</p>
       <p>This is simply an exploratory inquiry — there are no commitments, and nothing is decided. If you'd be open to discussing whether a ground lease might make sense, I'd welcome a quick call.</p>
       <p>If now isn't the right time, no problem at all. Thank you for your consideration.</p>`;
  return `<html><head><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Helvetica Neue',Arial,sans-serif;color:#13233f;}
    .wrap{width:8.75in;height:5.75in;padding:0.45in;display:flex;flex-direction:column;justify-content:space-between;}
    .msg p{font-size:15px;line-height:1.55;margin-bottom:9px;max-width:5.2in;}
    h2{font-size:19px;color:#1769e0;margin-bottom:10px;}
    .cta{margin-top:8px;padding:13px 16px;background:#f3f7ff;border-left:4px solid #1769e0;border-radius:6px;}
    .cta .lbl{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7a90;font-weight:700;}
    .cta .who{font-size:16px;font-weight:800;color:#0b3d91;margin-top:2px;}
    .cta .line{font-size:13px;color:#13233f;margin-top:3px;}
  </style></head><body><div class="wrap">
    <div class="msg"><h2>Dear ${owner},</h2>${bodyHtml}</div>
    <div class="cta">
      <div class="lbl">Reach Me Directly</div>
      <div class="who">${name || company}</div>
      ${name && company ? `<div class="line">${company}</div>` : ''}
      ${phone ? `<div class="line">Phone: ${phone}</div>` : ''}
      ${email ? `<div class="line">Email: ${email}</div>` : ''}
      ${addr ? `<div class="line">${addr}</div>` : ''}
    </div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = (await req.json()) ?? {};
    const action = body.action;

    // ── fulfill: service-role only, invoked by stripeWebhook post-payment ──
    if (action === 'fulfill') {
      const orderId = body.order_id;
      if (!orderId) return Response.json({ error: 'order_id required' }, { status: 400 });
      const order = await base44.asServiceRole.entities.PostcardMailerOrder.get(orderId);
      if (!order) return Response.json({ error: 'order not found' }, { status: 404 });

      const auth = lobAuth();
      const mode = lobMode();
      const sender = order.sender || {};
      const fromParsed = parseMailingAddress(sender.address);
      const recipients = Array.isArray(order.recipients) ? [...order.recipients] : [];

      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        if (r.status === 'sent' && r.lob_postcard_id) continue; // never duplicate
        const parsed = parseMailingAddress(r.mailing_address);
        if (!parsed || !parsed.street || !parsed.city || (!parsed.state && !parsed.zip)) {
          recipients[i] = { ...r, status: 'failed', failure_reason: 'Invalid mailing address' };
          continue;
        }
        const idem = r.idempotency_key || `pc_${orderId}_${i}`;
        try {
          const form = new URLSearchParams();
          form.set('description', `SiteHawk postcard — ${r.owner_name || 'owner'} (${order.scip_record_id})`);
          form.set('to[name]', r.owner_name || 'Property Owner');
          form.set('to[address_line1]', parsed.street);
          form.set('to[address_city]', parsed.city);
          form.set('to[address_state]', parsed.state);
          form.set('to[address_zip]', parsed.zip || '');
          form.set('from[name]', sender.company || sender.name || 'SiteHawk');
          if (fromParsed?.street && fromParsed?.city && fromParsed?.state) {
            form.set('from[address_line1]', fromParsed.street);
            form.set('from[address_city]', fromParsed.city);
            form.set('from[address_state]', fromParsed.state);
            form.set('from[address_zip]', fromParsed.zip || '');
          }
          form.set('front', postcardFront(r));
          form.set('back', postcardBack(r, sender, order.message_copy));
          form.set('size', '6x9');

          const resp = await fetch(LOB_POSTCARDS_URL, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idem },
            body: form.toString(),
          });
          const data = await resp.json();
          if (!resp.ok) {
            recipients[i] = { ...r, status: 'failed', failure_reason: data?.error?.message || `Lob ${resp.status}`, idempotency_key: idem };
          } else {
            recipients[i] = {
              ...r, status: 'sent', lob_postcard_id: data?.id,
              expected_delivery: data?.expected_delivery_date, tracking_url: data?.url,
              failure_reason: '', idempotency_key: idem,
            };
          }
        } catch (e) {
          recipients[i] = { ...r, status: 'failed', failure_reason: e.message, idempotency_key: idem };
        }
      }

      const sent = recipients.filter((r) => r.status === 'sent').length;
      const mailing_status = sent === 0 ? 'failed' : sent === recipients.length ? 'sent' : 'partial';
      const updated = await base44.asServiceRole.entities.PostcardMailerOrder.update(orderId, {
        recipients, mailing_status, lob_mode: mode, sent_at: new Date().toISOString(),
      });
      console.log(`sendPostcardMailers fulfill: ${sent}/${recipients.length} sent (${mode}) order ${orderId}`);
      return Response.json({ ok: true, sent, total: recipients.length, mailing_status, order: updated });
    }

    // ── all other actions require an authenticated user ──
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const recipientsIn = Array.isArray(body.recipients) ? body.recipients : [];

    // ── verify: Lob address verification per recipient (no send, no charge) ──
    if (action === 'verify') {
      const out = [];
      for (const r of recipientsIn.slice(0, MAX_RECIPIENTS)) {
        const parsed = parseMailingAddress(r.mailing_address);
        const v = await verifyAddress(parsed);
        out.push({
          ...r,
          address_verified: v.deliverable,
          verification_note: v.note,
          status: v.deliverable ? 'address_verified' : 'draft',
        });
      }
      return Response.json({ recipients: out, mode: lobMode() });
    }

    // ── checkout: create the order (pending_payment) + Stripe session ──
    if (action === 'checkout') {
      const scipRecordId = body.scip_record_id;
      if (!scipRecordId) return Response.json({ error: 'scip_record_id required' }, { status: 400 });
      if (!recipientsIn.length) return Response.json({ error: 'At least one recipient is required.' }, { status: 400 });
      if (recipientsIn.length > MAX_RECIPIENTS) return Response.json({ error: `At most ${MAX_RECIPIENTS} recipients.` }, { status: 400 });

      const sender = body.sender || {};
      if (!sender.name && !sender.company) return Response.json({ error: 'Sender name or company is required.' }, { status: 400 });

      // Verify each address; only deliverable ones can be charged/mailed.
      const verified = [];
      for (let i = 0; i < recipientsIn.length; i++) {
        const r = recipientsIn[i];
        const parsed = parseMailingAddress(r.mailing_address);
        const v = await verifyAddress(parsed);
        verified.push({
          label: r.label || `Recipient ${i + 1}`,
          source: r.source || 'scip_target',
          owner_name: r.owner_name || '',
          mailing_address: r.mailing_address || '',
          parcel_address: r.parcel_address || '',
          apn: r.apn || '',
          latitude: r.latitude ?? null,
          longitude: r.longitude ?? null,
          address_verified: v.deliverable,
          verification_note: v.note,
          status: v.deliverable ? 'pending_payment' : 'failed',
          failure_reason: v.deliverable ? '' : (v.note || 'Address not deliverable'),
          idempotency_key: '',
        });
      }
      const deliverable = verified.filter((v) => v.address_verified);
      if (!deliverable.length) {
        return Response.json({ error: 'No deliverable mailing addresses to send to.', recipients: verified }, { status: 400 });
      }

      const count = deliverable.length;
      const price = priceForCount(count);
      const priceCents = Math.round(price * 100);

      // Create the order FIRST as pending_payment (no Lob call yet).
      const order = await base44.entities.PostcardMailerOrder.create({
        scip_record_id: scipRecordId,
        site_name: body.site_name || '',
        recipients: verified.map((v) => ({
          ...v,
          // freeze a stable idempotency key now so a double-click can't duplicate
          idempotency_key: `pc_${scipRecordId}_${v.label}`.replace(/\s+/g, '_'),
        })),
        message_copy: body.message_copy || '',
        sender,
        recipient_count: count,
        price_charged_usd: price,
        payment_status: 'pending_payment',
        mailing_status: 'pending_payment',
      });

      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
      const origin = req.headers.get('origin') || 'https://app.base44.com';
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: priceCents,
            product_data: {
              name: 'Postcard Mailer Pack',
              description: `${count} cell-tower-lease postcard(s) mailed to your SCIP candidate owners`,
            },
          },
          quantity: 1,
        }],
        customer_email: user.email,
        success_url: `${origin}${body.return_path || '/scip/' + scipRecordId}?postcard_order=${order.id}&postcard_success=1`,
        cancel_url: `${origin}${body.return_path || '/scip/' + scipRecordId}?postcard_order=${order.id}&postcard_cancel=1`,
        metadata: {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          type: 'postcard_mailer_pack',
          user_email: user.email,
          order_id: order.id,
        },
      });

      await base44.entities.PostcardMailerOrder.update(order.id, { stripe_session_id: session.id });
      console.log(`Postcard Mailer Pack checkout: ${count} cards ($${price}) order ${order.id} for ${user.email}`);
      return Response.json({ url: session.url, order_id: order.id, price_usd: price, recipient_count: count, recipients: verified });
    }

    return Response.json({ error: "action must be 'verify', 'checkout', or 'fulfill'" }, { status: 400 });
  } catch (err) {
    console.error('sendPostcardMailers error:', err?.message ?? err);
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
});