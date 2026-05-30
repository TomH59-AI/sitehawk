import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// SiteHawk fallback owner mailer — sends a physical postcard via Lob when
// skip-trace returned no usable phone. Refuses to send unless confirmed:true.
// Reports TEST vs LIVE based on the Lob key prefix so the UI can show
// "no real mail sent" during demos.

const LOB_POSTCARDS_URL = 'https://api.lob.com/v1/postcards';

// SkyWave return address (FROM). Fill before live use.
const FROM_ADDRESS = {
  name: 'SkyWave Site Acquisition',
  address_line1: '',
  address_city: '',
  address_state: '',
  address_zip: '',
};

function defaultFront() {
  return `<html><head><style>
    body{margin:0;font-family:Arial,Helvetica,sans-serif;}
    .wrap{padding:0.5in;background:#0066FF;color:#fff;height:6in;box-sizing:border-box;}
    h1{font-size:34px;margin:0 0 10px;} p{font-size:16px;line-height:1.4;}
    .gold{color:#FFB800;font-weight:bold;}
  </style></head><body><div class="wrap">
    <h1>We'd like to talk about your property.</h1>
    <p>Our team is evaluating land in your area for a <span class="gold">communications facility</span>
    that could provide you with <span class="gold">long-term lease income</span>.</p>
    <p>Please reach out at your convenience — details on the reverse.</p>
  </div></body></html>`;
}

function backTemplate(message) {
  const body = message && message.trim().length
    ? message
    : 'A representative from SkyWave Site Acquisition would like to discuss a potential ' +
      'lease opportunity for a communications tower on your property. There is no obligation. ' +
      'Please contact us to learn more about the income potential.';
  return `<html><head><style>
    body{margin:0;font-family:Arial,Helvetica,sans-serif;}
    .msg{padding:0.4in;font-size:14px;line-height:1.5;width:3.6in;}
  </style></head><body><div class="msg">${body}</div></body></html>`;
}

// Parse "street, city, ST zip" into structured parts.
function parseMailingAddress(str) {
  if (!str) return null;
  const parts = str.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const street = parts[0];
  const city = parts[1];
  const stateZip = (parts[2] || '').split(/\s+/);
  return { street, city, state: stateZip[0] || '', zip: stateZip[1] || '' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() ?? {};
    const { reviewRecordId, recordType = 'SearchResult', confirmed, to, message } = body;

    if (confirmed !== true) {
      return Response.json({ error: 'Mailer not confirmed. Set confirmed:true to dispatch.' }, { status: 400 });
    }

    // Resolve recipient: explicit `to`, else parse the record's mailing address.
    let recipient = to;
    if (!recipient && reviewRecordId) {
      const rec = await base44.asServiceRole.entities[recordType].get(reviewRecordId);
      const parsed = parseMailingAddress(rec?.owner_mailing_address);
      if (parsed) {
        recipient = {
          name: rec.owner_name || 'Property Owner',
          address_line1: parsed.street,
          address_city: parsed.city,
          address_state: parsed.state,
          address_zip: parsed.zip,
        };
      }
    }

    if (!recipient?.name || !recipient?.address_line1 || !recipient?.address_city || !recipient?.address_state || !recipient?.address_zip) {
      return Response.json({ error: 'Recipient address incomplete (need name, line1, city, state, zip).' }, { status: 400 });
    }

    const key = Deno.env.get('LOB_API_KEY_SECRET');
    if (!key) return Response.json({ error: 'Server missing LOB_API_KEY_SECRET.' }, { status: 500 });
    const mode = key.startsWith('live') ? 'LIVE' : 'TEST';
    const auth = 'Basic ' + btoa(`${key}:`);

    const form = new URLSearchParams();
    form.set('description', `SiteHawk owner outreach — ${recipient.name}`);
    form.set('to[name]', recipient.name);
    form.set('to[address_line1]', recipient.address_line1);
    if (recipient.address_line2) form.set('to[address_line2]', recipient.address_line2);
    form.set('to[address_city]', recipient.address_city);
    form.set('to[address_state]', recipient.address_state);
    form.set('to[address_zip]', recipient.address_zip);
    form.set('from[name]', FROM_ADDRESS.name);
    if (FROM_ADDRESS.address_line1) {
      form.set('from[address_line1]', FROM_ADDRESS.address_line1);
      form.set('from[address_city]', FROM_ADDRESS.address_city);
      form.set('from[address_state]', FROM_ADDRESS.address_state);
      form.set('from[address_zip]', FROM_ADDRESS.address_zip);
    }
    form.set('front', defaultFront());
    form.set('back', backTemplate(message));
    form.set('size', '4x6');

    const resp = await fetch(LOB_POSTCARDS_URL, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await resp.json();

    if (!resp.ok) {
      console.error('Lob error:', resp.status, data?.error?.message);
      return Response.json({ error: data?.error?.message || `Lob error ${resp.status}`, mode }, { status: 502 });
    }

    const result = {
      status: 'sent',
      mode,
      lob_id: data?.id,
      expected_delivery_date: data?.expected_delivery_date,
      to: data?.to,
      cost: data?.cost ?? null,
      url: data?.url,
    };

    if (reviewRecordId) {
      try {
        await base44.asServiceRole.entities[recordType].update(reviewRecordId, {
          mailer_sent: true,
          mailer_mode: mode,
          mailer_lob_id: data?.id,
          mailer_sent_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error('sendOwnerMailer log failed:', e?.message ?? e);
      }
    }

    return Response.json(result);
  } catch (err) {
    console.error('sendOwnerMailer error:', err?.message ?? err);
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
});