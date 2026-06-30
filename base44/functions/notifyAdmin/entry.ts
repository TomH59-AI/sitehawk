import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * notifyAdmin — sends a SiteHawk-branded notification email to the admin inbox.
 * All mail originates from hello@sitehawk.com (Resend verified domain).
 * The reply_to is set to the triggering user's email so Tom can reply directly.
 *
 * Payload: { subject, body, from_label?, reply_to? }
 */

const ADMIN_INBOX   = 'tom@sitehawk.com';
const FROM_DEFAULT  = 'SiteHawk <hello@sitehawk.com>';
const HAWK_LOGO     = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/skywave-hawk.png';

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function brandedEmail(subject, body) {
  const bodyHtml = String(body || '')
    .split(/\n{1,}/)
    .map((p) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#cbd5e1;">${esc(p.trim())}</p>`)
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
  <body style="margin:0;padding:0;background:#0a0e17;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#0a0e17;">
      <div style="background:#111827;padding:28px 24px;text-align:center;border-bottom:1px solid #1e293b;">
        <img src="${HAWK_LOGO}" alt="SiteHawk" width="52" height="52" style="border-radius:10px;display:inline-block;margin-bottom:10px;"/>
        <div style="font-weight:700;font-size:20px;color:#f8fafc;letter-spacing:0.22em;">SITEHAWK</div>
        <div style="font-size:10px;color:#00d4ff;letter-spacing:0.22em;margin-top:4px;">WE GOT OUR EYES ON YOU</div>
      </div>
      <div style="padding:30px 28px;">
        <h1 style="margin:0 0 18px 0;font-size:20px;font-weight:700;color:#f8fafc;line-height:1.3;">${esc(subject)}</h1>
        ${bodyHtml}
      </div>
      <div style="background:#111827;border-top:1px solid #1e293b;padding:18px 24px;text-align:center;">
        <div style="font-size:10px;color:#475569;letter-spacing:0.14em;text-transform:uppercase;">
          SiteHawk · sitehawk.com · Reply directly to respond
        </div>
      </div>
    </div>
  </body></html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { subject, body, from_label, reply_to } = (await req.json()) ?? {};
    if (!subject || !body) {
      return Response.json({ error: 'subject and body are required' }, { status: 400 });
    }

    const fromAddress = from_label ? `${from_label} <hello@sitehawk.com>` : FROM_DEFAULT;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [ADMIN_INBOX],
        subject: `[SiteHawk] ${subject}`,
        html: brandedEmail(subject, body),
        ...(reply_to ? { reply_to } : { reply_to: user.email }),
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('notifyAdmin Resend error:', resendRes.status, errText);
      return Response.json({ error: `Resend failed: ${errText}` }, { status: 502 });
    }

    console.log(`notifyAdmin: sent "${subject}" to ${ADMIN_INBOX} (triggered by ${user.email})`);
    return Response.json({ ok: true, delivered_to: ADMIN_INBOX });
  } catch (error) {
    console.error('notifyAdmin error:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
});