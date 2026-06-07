import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * notifyAdmin — sends a single, professionally SiteHawk-branded email to the
 * SiteHawk inbox (tomhodges@onairs.org). Used by the mailing/notification tabs
 * so that when something needs Tom's attention it actually lands in his inbox
 * and he can reply directly (until the AI auto-responder is set up).
 *
 * Payload:
 *   { subject, body, from_label?, reply_to? }
 * Any signed-in user can trigger it (e.g. an owner-reply or inquiry), but the
 * destination is always the SiteHawk inbox — it's never user-controlled.
 */

const SITEHAWK_INBOX = 'hodges.thomas@outlook.com';
const SITEHAWK_FROM = 'SiteHawk <info@site-hawk-pro.com>';
const HAWK_LOGO = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/skywave-hawk.png';

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
      <!-- Header -->
      <div style="background:#111827;padding:28px 24px;text-align:center;border-bottom:1px solid #1e293b;">
        <img src="${HAWK_LOGO}" alt="SiteHawk" width="52" height="52" style="border-radius:10px;display:inline-block;margin-bottom:10px;"/>
        <div style="font-weight:700;font-size:20px;color:#f8fafc;letter-spacing:0.22em;">SITEHAWK</div>
        <div style="font-size:10px;color:#00d4ff;letter-spacing:0.22em;margin-top:4px;">WE GOT OUR EYES ON YOU</div>
      </div>
      <!-- Body -->
      <div style="padding:30px 28px;">
        <h1 style="margin:0 0 18px 0;font-size:20px;font-weight:700;color:#f8fafc;line-height:1.3;">${esc(subject)}</h1>
        ${bodyHtml}
      </div>
      <!-- Footer -->
      <div style="background:#111827;border-top:1px solid #1e293b;padding:18px 24px;text-align:center;">
        <div style="font-size:10px;color:#475569;letter-spacing:0.14em;text-transform:uppercase;">
          SiteHawk · Powered by SkyWave AI · Reply directly to respond
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

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from_label ? `${from_label} <onboarding@resend.dev>` : SITEHAWK_FROM,
        to: [SITEHAWK_INBOX],
        subject: `[SiteHawk] ${subject}`,
        html: brandedEmail(subject, body),
        ...(reply_to ? { reply_to } : {}),
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('notifyAdmin Resend error:', resendRes.status, errText);
      return Response.json({ error: `Resend failed: ${errText}` }, { status: 502 });
    }

    console.log(`notifyAdmin: sent "${subject}" to ${SITEHAWK_INBOX} (triggered by ${user.email}${reply_to ? `, reply_to ${reply_to}` : ''})`);
    return Response.json({ ok: true, delivered_to: SITEHAWK_INBOX });
  } catch (error) {
    console.error('notifyAdmin error:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
});