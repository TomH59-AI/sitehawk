import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * attioAnnouncementSend — one-off marketing announcement: "Attio CRM sync is
 * now live inside SiteHawk (included)". Admin-only.
 *
 * Payload:
 *   { test_mode?: boolean }  — test_mode sends ONLY to the calling admin.
 *
 * Recipients (live mode): SubscriberCRMContact records with
 * marketing_opt_in=true, no unsubscribed_at, and email_bounce_status "ok".
 */

const HAWK_LOGO = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/skywave-hawk.png';
const CONNECT_LINK = 'https://site-hawk-pro.com/billing';

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildHtml(firstName) {
  const paras = [
    `Hey ${esc(firstName)},`,
    `You already use SiteHawk to find the best parcels fast. Now we've made it even better — and it's <strong style="color:#f8fafc;">included in your plan at no extra cost</strong>.`,
    `Connect your Attio in one click and every qualified site search will push directly into your CRM with full data attached (scores, zoning, fiber, everything). No more spreadsheets. No more dropped leads. Just faster closes.`,
    `<a href="${CONNECT_LINK}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-weight:700;padding:12px 26px;border-radius:10px;text-decoration:none;">Connect Attio — Free with your plan</a>`,
    `This is how the best site acquisition teams are working now. You're already paying for it — might as well use it.`,
    `– Tom @ SiteHawk`,
  ].map((p) => `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#cbd5e1;">${p}</p>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
  <body style="margin:0;padding:0;background:#0a0e17;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#0a0e17;">
      <div style="background:#111827;padding:28px 24px;text-align:center;border-bottom:1px solid #1e293b;">
        <img src="${HAWK_LOGO}" alt="SiteHawk" width="52" height="52" style="border-radius:10px;display:inline-block;margin-bottom:10px;"/>
        <div style="font-weight:700;font-size:20px;color:#f8fafc;letter-spacing:0.22em;">SITEHAWK</div>
        <div style="font-size:10px;color:#00d4ff;letter-spacing:0.22em;margin-top:4px;">WHEN YOU NEED AI HAWK VISION</div>
      </div>
      <div style="padding:30px 28px;">
        <h1 style="margin:0 0 18px 0;font-size:20px;font-weight:700;color:#f8fafc;line-height:1.3;">🔗 Attio CRM sync is now live inside SiteHawk — included in your plan</h1>
        ${paras}
      </div>
      <div style="background:#111827;border-top:1px solid #1e293b;padding:18px 24px;text-align:center;">
        <div style="font-size:10px;color:#475569;letter-spacing:0.14em;text-transform:uppercase;">SiteHawk · sitehawk.com · support@sitehawk.com</div>
        <p style="font-size:11px;color:#475569;margin-top:10px;">You're receiving this because you opted in to SiteHawk updates.
          <a href="mailto:support@sitehawk.com?subject=Unsubscribe" style="color:#00d4ff;">Unsubscribe</a>.</p>
      </div>
    </div>
  </body></html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { test_mode = false } = await req.json().catch(() => ({}));

    let recipients;
    if (test_mode) {
      recipients = [{ email: user.email, name: user.full_name || 'Tom' }];
    } else {
      const contacts = await base44.asServiceRole.entities.SubscriberCRMContact.filter({ marketing_opt_in: true }, '-created_date', 500);
      recipients = contacts
        .filter((c) => !c.unsubscribed_at && (c.email_bounce_status || 'ok') === 'ok' && c.email)
        .map((c) => ({ email: c.email, name: c.name || 'there' }));
    }

    if (!recipients.length) return Response.json({ ok: true, sent: 0, note: 'No eligible opted-in subscribers found.' });

    const results = [];
    for (const r of recipients) {
      const firstName = String(r.name).split(' ')[0];
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Tom @ SiteHawk <hello@site-hawk-pro.com>',
          to: [r.email],
          subject: 'Big update: Attio CRM sync is now live inside SiteHawk (included)',
          html: buildHtml(firstName),
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`attioAnnouncementSend: failed for ${r.email}:`, err);
        results.push({ email: r.email, ok: false });
      } else {
        results.push({ email: r.email, ok: true });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    console.log(`attioAnnouncementSend: sent ${sent}/${recipients.length} (test_mode=${test_mode}, by ${user.email})`);
    return Response.json({ ok: true, sent, failed: results.length - sent, test_mode });
  } catch (error) {
    console.error('attioAnnouncementSend error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});