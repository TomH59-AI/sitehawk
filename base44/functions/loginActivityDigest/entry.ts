import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

/**
 * loginActivityDigest — "who's using SiteHawk" morning report.
 *
 * Walks every registered user and classifies them:
 *   SUBSCRIBED          — active/trialing Stripe subscription
 *   TRIED IT            — ran a search / SCIP / TalonFit run, but never paid
 *   LOGGED IN ONLY      — signed in, never actually ran anything
 *   NEVER LOGGED IN     — invited/registered but never signed in
 *
 * Emails the whole roster to REPORT_TO via Resend. Admin-only; invoked by the
 * "Daily Login & Usage Digest" scheduled workflow each morning at 7:00 ET.
 */

// 👉 Change this to redirect the morning report.
const REPORT_TO = 'hodgesthoms@outlook.com';
const FROM = 'SiteHawk <hello@site-hawk-pro.com>';

async function listAll(query) {
  const out = [];
  let skip = 0;
  while (true) {
    const batch = await query(skip, 500);
    out.push(...batch);
    if (batch.length < 500) break;
    skip += 500;
  }
  return out;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = base44.asServiceRole.entities;

    const [users, searches, scips, talonRuns] = await Promise.all([
      listAll((skip, limit) => svc.User.list('-created_date', limit, skip)),
      listAll((skip, limit) => svc.SearchHistory.list('-created_date', limit, skip)),
      listAll((skip, limit) => svc.ScipRecord.list('-created_date', limit, skip)),
      listAll((skip, limit) => svc.TalonFitRunLog.list('-created_date', limit, skip)),
    ]);

    // Activity tallies keyed by both user id and email, since SearchHistory
    // stamps created_by_id while ScipRecord stamps created_by (email).
    const searchesById = {};
    for (const s of searches) {
      if (s.is_sample) continue;
      if (s.created_by_id) searchesById[s.created_by_id] = (searchesById[s.created_by_id] || 0) + 1;
    }
    const scipsByEmail = {};
    for (const s of scips) {
      if (s.created_by) scipsByEmail[s.created_by] = (scipsByEmail[s.created_by] || 0) + 1;
    }
    const talonByUser = {};
    for (const r of talonRuns) {
      const k = r.user_email || r.user_id;
      if (k) talonByUser[k] = (talonByUser[k] || 0) + 1;
    }

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const rows = users
      .filter((u) => !u.is_service)
      .map((u) => {
        const searchCount = searchesById[u.id] || 0;
        const scipCount = scipsByEmail[u.email] || 0;
        const talonCount = talonByUser[u.email] || talonByUser[u.id] || 0;
        const activity = searchCount + scipCount + talonCount;
        const subscribed =
          ['active', 'trialing'].includes(u.subscription_status) || !!u.stripe_subscription_id;

        let bucket;
        if (subscribed) bucket = 'subscribed';
        else if (activity > 0) bucket = 'tried';
        else if (u.last_active_at) bucket = 'logged_in_only';
        else bucket = 'never_logged_in';

        return {
          email: u.email,
          name: u.full_name || '—',
          role: u.role,
          tier: u.tier || 'free',
          subscription_status: u.subscription_status || 'none',
          plan: u.subscription_plan || '',
          signed_up: u.created_date,
          last_login: u.last_active_at,
          searches: searchCount,
          scips: scipCount,
          talonfit: talonCount,
          activity,
          bucket,
          disabled: !!u.disabled,
          new_today: now - new Date(u.created_date).getTime() < DAY,
          active_today: u.last_active_at ? now - new Date(u.last_active_at).getTime() < DAY : false,
        };
      })
      .sort((a, b) => new Date(b.last_login || 0) - new Date(a.last_login || 0));

    const group = (b) => rows.filter((r) => r.bucket === b);
    const subscribed = group('subscribed');
    const tried = group('tried');
    const loggedOnly = group('logged_in_only');
    const never = group('never_logged_in');
    const activeToday = rows.filter((r) => r.active_today);
    const newToday = rows.filter((r) => r.new_today);

    const today = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(new Date());

    const section = (title, list, color) => {
      if (!list.length) {
        return `<h3 style="margin:26px 0 8px;font-size:13px;letter-spacing:.12em;color:#64748b;text-transform:uppercase;">${esc(title)} — none</h3>`;
      }
      const trs = list
        .map(
          (r) => `<tr>
            <td style="padding:7px 10px;border-bottom:1px solid #1e293b;color:#f1f5f9;font-size:13px;">${esc(r.email)}${r.disabled ? ' <span style="color:#f87171;">(disabled)</span>' : ''}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${esc(r.tier)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${esc(r.subscription_status)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;text-align:center;">${r.searches}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;text-align:center;">${r.scips}</td>
            <td style="padding:7px 10px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${esc(fmtDate(r.last_login))}</td>
          </tr>`,
        )
        .join('');
      return `<h3 style="margin:26px 0 8px;font-size:13px;letter-spacing:.12em;color:${color};text-transform:uppercase;">${esc(title)} — ${list.length}</h3>
        <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden;">
          <tr style="background:#111827;">
            <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:.1em;color:#64748b;text-transform:uppercase;">User</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:.1em;color:#64748b;text-transform:uppercase;">Tier</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:.1em;color:#64748b;text-transform:uppercase;">Billing</th>
            <th style="padding:8px 10px;font-size:10px;letter-spacing:.1em;color:#64748b;text-transform:uppercase;">Scans</th>
            <th style="padding:8px 10px;font-size:10px;letter-spacing:.1em;color:#64748b;text-transform:uppercase;">SCIPs</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;letter-spacing:.1em;color:#64748b;text-transform:uppercase;">Last login</th>
          </tr>
          ${trs}
        </table>`;
    };

    const stat = (label, value, color) =>
      `<td style="padding:12px 8px;text-align:center;background:#111827;border-radius:8px;">
        <div style="font-size:24px;font-weight:700;color:${color};">${value}</div>
        <div style="font-size:9px;letter-spacing:.12em;color:#64748b;text-transform:uppercase;margin-top:2px;">${esc(label)}</div>
      </td>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
    <body style="margin:0;background:#0a0e17;font-family:'Helvetica Neue',Arial,sans-serif;">
      <div style="max-width:680px;margin:0 auto;padding:24px;">
        <div style="text-align:center;padding-bottom:18px;border-bottom:1px solid #1e293b;">
          <div style="font-weight:700;font-size:18px;color:#f8fafc;letter-spacing:.22em;">SITEHAWK</div>
          <div style="font-size:10px;color:#00d4ff;letter-spacing:.2em;margin-top:4px;">DAILY LOGIN &amp; USAGE REPORT</div>
          <div style="font-size:12px;color:#64748b;margin-top:8px;">${esc(today)}</div>
        </div>

        <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-top:18px;">
          <tr>
            ${stat('Total users', rows.length, '#f8fafc')}
            ${stat('Subscribed', subscribed.length, '#4ade80')}
            ${stat('Tried it', tried.length, '#00d4ff')}
            ${stat('Never ran', loggedOnly.length + never.length, '#fbbf24')}
          </tr>
        </table>

        <p style="font-size:13px;color:#cbd5e1;line-height:1.6;margin:18px 0 0;">
          <strong style="color:#f8fafc;">${activeToday.length}</strong> logged in over the last 24 hours ·
          <strong style="color:#f8fafc;">${newToday.length}</strong> new signup${newToday.length === 1 ? '' : 's'} ·
          <strong style="color:#f8fafc;">${searches.filter((s) => !s.is_sample).length}</strong> total scans ·
          <strong style="color:#f8fafc;">${scips.length}</strong> total SCIPs
        </p>

        ${section('Subscribed', subscribed, '#4ade80')}
        ${section('Tried the service (no subscription)', tried, '#00d4ff')}
        ${section('Logged in but never ran anything', loggedOnly, '#fbbf24')}
        ${section('Never logged in', never, '#94a3b8')}

        <p style="font-size:11px;color:#475569;margin-top:28px;text-align:center;">
          SiteHawk · automated internal report · sent every morning at 7:00 AM ET
        </p>
      </div>
    </body></html>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secrets.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [REPORT_TO],
        subject: `SiteHawk daily report — ${subscribed.length} subscribed, ${tried.length} tried, ${activeToday.length} active in 24h`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('loginActivityDigest Resend error:', resendRes.status, errText);
      return Response.json({ error: `Resend failed: ${errText}` }, { status: 502 });
    }

    const result = await resendRes.json();
    console.log(
      `loginActivityDigest: sent to ${REPORT_TO} — ${rows.length} users (${subscribed.length} subscribed, ${tried.length} tried, ${activeToday.length} active 24h)`,
    );

    return Response.json({
      ok: true,
      resend_id: result.id,
      sent_to: REPORT_TO,
      totals: {
        users: rows.length,
        subscribed: subscribed.length,
        tried: tried.length,
        logged_in_only: loggedOnly.length,
        never_logged_in: never.length,
        active_last_24h: activeToday.length,
        new_last_24h: newToday.length,
      },
      rows,
    });
  } catch (error) {
    console.error('loginActivityDigest error:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
}