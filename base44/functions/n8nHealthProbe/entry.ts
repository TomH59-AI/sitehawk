import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// n8n uptime / performance / accuracy watchdog endpoint.
// Called by n8n on a schedule (every 1-5 min) with ?key=WEBHOOK_SECRET.
// Returns a single read-only health snapshot n8n turns into alerts + a daily digest.
// No user auth (webhook) — validated against the shared WEBHOOK_SECRET instead.
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get('key');
    const secret = Deno.env.get('WEBHOOK_SECRET');
    if (!secret || key !== secret) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const b = createClientFromRequest(req).asServiceRole;
    const now = Date.now();
    const iso24 = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const iso7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel read-only counts. Failures of any one query don't fail the probe —
    // n8n still gets an "ok" signal from the others.
    const safe = (p) => p.then((v) => v).catch(() => null);

    const [scipsDraft, scipsDraft7d, talonFit24, talonReach24, hawkSpend24,
      subsActive, subsChurned, crmContacts, mailQueued] = await Promise.all([
      safe(b.entities.ScipRecord.filter({ status: 'draft' }, '-created_date', 1).then((r) => ({ count: r.length, has_more: !!r.has_more }))),
      safe(b.entities.ScipRecord.filter({ status: 'draft', created_date: { $lt: iso7d } }, '-created_date', 1).then((r) => r.length)),
      safe(b.entities.TalonFitRunLog.filter({ run_timestamp_utc: { $gte: iso24 } }, '-run_timestamp_utc', 1).then((r) => r.length)),
      safe(b.entities.TalonReachRunLog.filter({ run_timestamp_utc: { $gte: iso24 } }, '-run_timestamp_utc', 1).then((r) => r.length)),
      safe(b.entities.HawkScipSpend.filter({ created_date: { $gte: iso24 } }, '-created_date', 1).then((r) => r.length)),
      safe(b.entities.SubscriberCRMContact.filter({ subscription_status: 'active' }, '-created_date', 1).then((r) => r.length)),
      safe(b.entities.SubscriberCRMContact.filter({ churn_risk: 'high' }, '-created_date', 1).then((r) => r.length)),
      safe(b.entities.SubscriberCRMContact.filter({}, '-created_date', 1).then((r) => r.length)),
      safe(b.entities.MailQueue.filter({ status: 'queued' }, '-created_date', 1).then((r) => r.length)),
    ]);

    const stuckDraftScips = scipsDraft7d ?? 0;
    const draftScips = scipsDraft?.count ?? 0;

    // Accuracy signal: high spend with low completed output suggests failures
    // (credit burn without delivery). n8n alerts when burn rate spikes.
    const spend24 = hawkSpend24 ?? 0;
    const fitRuns24 = talonFit24 ?? 0;
    const reachRuns24 = talonReach24 ?? 0;

    const body = {
      ok: true,
      ts: new Date(now).toISOString(),
      app: 'sitehawk',
      uptime_signal: 'responding',
      scip: {
        draft_total: draftScips,
        stuck_draft_7d: stuckDraftScips, // draft older than 7 days = accuracy risk
      },
      credit_burn_24h: {
        hawk_spend_events: spend24,
        talonfit_runs: fitRuns24,
        talonreach_runs: reachRuns24,
      },
      subscribers: {
        total: crmContacts ?? 0,
        active: subsActive ?? 0,
        high_churn_risk: subsChurned ?? 0,
      },
      ops: {
        mail_queued: mailQueued ?? 0,
      },
      // n8n alert thresholds (tune in n8n; these are sane defaults)
      alert_if: {
        not_ok: false,                 // probe itself failed
        stuck_draft_7d_gt: 5,          // stale SCIPs piling up
        high_churn_risk_gt: 3,         // subscribers at risk
        mail_queued_gt: 50,            // mail not draining
      },
    };

    return Response.json(body, { status: 200 });
  } catch (error) {
    return Response.json({ ok: false, error: error.message, ts: new Date().toISOString() }, { status: 500 });
  }
});