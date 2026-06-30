import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * hawkEmail — central Resend email dispatcher for SiteHawk.
 * All outbound email (customer receipts, admin notifications, promotions,
 * auto-responders) should route through this function.
 *
 * Payload:
 *   {
 *     to:        string | string[]   — recipient(s)
 *     subject:   string
 *     body:      string              — plain text or simple HTML paragraphs
 *     from_name?: string             — defaults to "SiteHawk"
 *     reply_to?:  string             — reply-to address
 *     type?:      "notification" | "marketing" | "transactional"
 *                                    — controls footer copy
 *   }
 *
 * FROM domain: sitehawk.com (must be verified in Resend dashboard).
 * Admin use: admins can send to any address; regular users can only
 *            trigger notification-type emails (e.g. contact forms).
 */

const FROM_DEFAULT  = 'SiteHawk <hello@site-hawk-pro.com>';
const ADMIN_INBOX   = 'tom@sitehawk.com';
const HAWK_LOGO     = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/skywave-hawk.png';

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildHtml(subject, body, type = 'notification') {
  const bodyHtml = String(body || '')
    .split(/\n{1,}/)
    .map((p) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#cbd5e1;">${esc(p.trim())}</p>`)
    .join('');

  const footerExtra = type === 'marketing'
    ? `<p style="font-size:11px;color:#475569;margin-top:10px;">
        You're receiving this because you opted in to SiteHawk updates.
        <a href="mailto:support@sitehawk.com?subject=Unsubscribe" style="color:#00d4ff;">Unsubscribe</a>.
       </p>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
  <body style="margin:0;padding:0;background:#0a0e17;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#0a0e17;">
      <div style="background:#111827;padding:28px 24px;text-align:center;border-bottom:1px solid #1e293b;">
        <img src="${HAWK_LOGO}" alt="SiteHawk" width="52" height="52" style="border-radius:10px;display:inline-block;margin-bottom:10px;"/>
        <div style="font-weight:700;font-size:20px;color:#f8fafc;letter-spacing:0.22em;">SITEHAWK</div>
        <div style="font-size:10px;color:#00d4ff;letter-spacing:0.22em;margin-top:4px;">WHEN YOU NEED AI HAWK VISION</div>
      </div>
      <div style="padding:30px 28px;">
        <h1 style="margin:0 0 18px 0;font-size:20px;font-weight:700;color:#f8fafc;line-height:1.3;">${esc(subject)}</h1>
        ${bodyHtml}
      </div>
      <div style="background:#111827;border-top:1px solid #1e293b;padding:18px 24px;text-align:center;">
        <div style="font-size:10px;color:#475569;letter-spacing:0.14em;text-transform:uppercase;">
          SiteHawk · sitehawk.com · support@sitehawk.com
        </div>
        ${footerExtra}
      </div>
    </div>
  </body></html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { to, subject, body, from_name, reply_to, type = 'notification' } = (await req.json()) ?? {};
    if (!to || !subject || !body) {
      return Response.json({ error: 'to, subject, and body are required' }, { status: 400 });
    }

    // Non-admins may only send notification-type (e.g. contact form inquiries).
    if (user.role !== 'admin' && type !== 'notification') {
      return Response.json({ error: 'Forbidden: only admins can send marketing or transactional emails' }, { status: 403 });
    }

    const fromAddress = from_name ? `${from_name} <hello@site-hawk-pro.com>` : FROM_DEFAULT;
    const recipients  = Array.isArray(to) ? to : [to];

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipients,
        subject,
        html: buildHtml(subject, body, type),
        ...(reply_to ? { reply_to } : {}),
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('hawkEmail Resend error:', resendRes.status, errText);
      return Response.json({ error: `Resend failed: ${errText}` }, { status: 502 });
    }

    const result = await resendRes.json();
    console.log(`hawkEmail: sent "${subject}" to ${recipients.join(', ')} (${type}, triggered by ${user.email})`);
    return Response.json({ ok: true, resend_id: result.id, recipients });
  } catch (error) {
    console.error('hawkEmail error:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
});