import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ADMIN-ONLY. Send an approved SubscriberCampaign to every contact in its
// target segment that is allowed to receive it.
//
// Safety rules enforced here (not just the UI):
//  - The campaign MUST be status "approved".
//  - MARKETING emails skip contacts who: have no opt-in, have unsubscribed,
//    or have a hard bounce / complaint. An unsubscribe footer is appended.
//  - TRANSACTIONAL emails are kept separate (no marketing footer, allowed to
//    all non-hard-bounced contacts) — but campaigns default to marketing.
//  - Uses the platform email integration (Core.SendEmail). No API keys in code.

const days = (d) => (d ? (Date.now() - new Date(d).getTime()) / 86400000 : Infinity);

// Resend sender — uses the verified site-hawk-pro.com domain.
const CAMPAIGN_FROM = 'SiteHawk <hello@site-hawk-pro.com>';
const HAWK_LOGO = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/skywave-hawk.png';

// Send one email via Resend (our verified domain) instead of the shared Base44 sender.
async function sendViaResend({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: CAMPAIGN_FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend ${res.status}: ${errText}`);
  }
  return res.json();
}

// Mirror of lib/subscriberCrm SEGMENTS (kept inline — backend can't import app libs).
function inSegment(c, key) {
  switch (key) {
    case 'all': return true;
    case 'active': return c.subscription_status === 'active' || c.subscription_status === 'trialing';
    case 'inactive': return days(c.last_active_at) > 14;
    case 'trial': return c.subscription_tier === 'Trial' || c.subscription_status === 'trialing';
    case 'churn_risk_high': return c.churn_risk === 'high';
    case 'no_scip': return !(c.total_scips_created > 0);
    case 'scip_not_exported': return (c.total_scips_created > 0) && !(c.total_scips_exported > 0);
    case 'postcard_users': return (c.total_mailers_sent > 0) || (c.tags || []).includes('postcard_user');
    case 'fiber_users': return (c.tags || []).includes('fiber_user') || (c.tags || []).includes('utility_user');
    case 'enterprise_prospects': return (c.tags || []).includes('enterprise_prospect');
    case 'canceled': return c.subscription_tier === 'Canceled' || c.subscription_status === 'canceled';
    case 'tier_hawk_vision': return c.subscription_tier === 'Hawk Vision';
    case 'tier_hawk_site': return c.subscription_tier === 'Hawk Site';
    case 'tier_hawk_enterprise': return c.subscription_tier === 'Hawk Enterprise';
    default: return true;
  }
}

function canReceiveMarketing(c) {
  if (!c.email) return false;
  if (c.unsubscribed_at) return false;
  if (!c.marketing_opt_in) return false;
  if (c.email_bounce_status === 'hard_bounce' || c.email_bounce_status === 'complaint') return false;
  return true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (me?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const { campaign_id, test_email } = await req.json().catch(() => ({}));
    if (!campaign_id) return Response.json({ error: 'campaign_id required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const camp = await svc.entities.SubscriberCampaign.get(campaign_id);
    if (!camp) return Response.json({ error: 'Campaign not found' }, { status: 404 });

    const isMarketing = (camp.email_class || 'marketing') === 'marketing';

    // ---- Test send: just to the admin, no gating ----
    if (test_email) {
      const html = renderBody(camp, { name: me.full_name || 'there', email: test_email, id: 'test' }, isMarketing);
      await sendViaResend({ to: test_email, subject: `[TEST] ${camp.subject}`, html });
      return Response.json({ test: true, sent_to: test_email });
    }

    if (camp.status !== 'approved' && camp.status !== 'scheduled') {
      return Response.json({ error: 'Campaign must be approved before sending' }, { status: 400 });
    }

    await svc.entities.SubscriberCampaign.update(campaign_id, { status: 'sending' });

    // Pull all contacts (paginate to avoid loading everything at once).
    const recipients = [];
    let skip = 0; const page = 200;
    while (true) {
      const batch = await svc.entities.SubscriberCRMContact.list('-created_date', page, skip);
      if (!batch.length) break;
      recipients.push(...batch);
      if (batch.length < page) break;
      skip += page;
    }

    const stats = { recipients: 0, sent: 0, skipped_unsubscribed: 0, skipped_bounced: 0, failed: 0, opened: 0, clicked: 0 };

    for (const c of recipients) {
      if (!inSegment(c, camp.target_segment || 'all')) continue;
      stats.recipients++;

      if (isMarketing && !canReceiveMarketing(c)) {
        if (c.unsubscribed_at || !c.marketing_opt_in) stats.skipped_unsubscribed++;
        else stats.skipped_bounced++;
        continue;
      }
      if (!isMarketing && (c.email_bounce_status === 'hard_bounce' || c.email_bounce_status === 'complaint')) {
        stats.skipped_bounced++; continue;
      }

      try {
        const html = renderBody(camp, c, isMarketing);
        await sendViaResend({ to: c.email, subject: camp.subject, html });
        stats.sent++;
        const now = new Date().toISOString();
        await svc.entities.SubscriberCRMContact.update(c.id, { last_email_sent_at: now });
        await svc.entities.SubscriberCRMActivity.create({
          subscriber_contact_id: c.id, type: 'email_sent', actor: 'hawkbot',
          related_campaign_id: campaign_id,
          summary: `Campaign "${camp.campaign_name}" — ${camp.subject}`,
          meta: { subject: camp.subject, email_class: camp.email_class },
        });
      } catch (e) {
        stats.failed++;
        console.error('send failed for', c.email, e.message);
      }
    }

    await svc.entities.SubscriberCampaign.update(campaign_id, {
      status: 'sent', sent_at: new Date().toISOString(), stats,
    });

    return Response.json({ sent: true, stats });
  } catch (error) {
    console.error('subscriberCampaignSend error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function renderBody(camp, contact, isMarketing) {
  // Substitute merge fields, then wrap in the SiteHawk branded shell.
  const inner = (camp.body || '').replace(/\{\{\s*name\s*\}\}/g, contact.name || 'there');
  const bodyHtml = inner
    .split(/\n{1,}/)
    .map((p) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#cbd5e1;">${p.trim()}</p>`)
    .join('');

  const unsub = isMarketing
    ? `<p style="font-size:11px;color:#475569;margin-top:14px;">
You're receiving this because you opted in to SiteHawk updates.
<a href="mailto:hello@site-hawk-pro.com?subject=Unsubscribe%20${encodeURIComponent(contact.email || '')}" style="color:#00d4ff;">Unsubscribe</a>.
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
        ${bodyHtml}
      </div>
      <div style="background:#111827;border-top:1px solid #1e293b;padding:18px 24px;text-align:center;">
        <div style="font-size:10px;color:#475569;letter-spacing:0.14em;text-transform:uppercase;">SiteHawk · A SkyWave AI Product</div>
        ${unsub}
      </div>
    </div>
  </body></html>`;
}