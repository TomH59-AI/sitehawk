import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { auditScipRecord } from '../../shared/scipAudit.ts';

// Auto-Audit on Submit — entity automation handler. Fires when a ScipRecord's
// status changes to "submitted": runs the shared SCIP audit engine and emails
// the verdict to the record owner. Safety net for anyone who skips the manual
// Quality Auditor before submitting.

const SEV_ICON = { critical: '[CRITICAL]', warning: '[WARNING]', info: '[info]' };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = (await req.json()) ?? {};
    const { event, data, payload_too_large } = payload;

    let rec = data;
    if (!rec || payload_too_large) {
      rec = await base44.asServiceRole.entities.ScipRecord.get(event?.entity_id);
    }
    if (!rec) return Response.json({ error: 'ScipRecord not found' }, { status: 404 });
    if (rec.status !== 'submitted') {
      return Response.json({ skipped: true, reason: `status is "${rec.status}", not "submitted"` });
    }

    const result = auditScipRecord(rec);
    const owner = rec.created_by;
    if (!owner) {
      console.log(`scipSubmitAudit: ${rec.site_name} audited (${result.verdict}) but record has no owner email.`);
      return Response.json({ ...result, emailed: false });
    }

    const verdictLabel = {
      ready: 'READY — clean audit, no issues found.',
      ready_with_warnings: `READY WITH WARNINGS — ${result.counts.warning} item(s) worth fixing.`,
      not_ready: `NOT READY — ${result.counts.critical} CRITICAL issue(s) found AFTER submittal.`,
    }[result.verdict];

    const bySeverity = ['critical', 'warning', 'info']
      .map((sev) => {
        const rows = result.issues.filter((i) => i.severity === sev);
        return rows.length ? rows.map((i) => `${SEV_ICON[sev]} ${i.section}: ${i.message}`).join('\n') : '';
      })
      .filter(Boolean)
      .join('\n');

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: owner,
      subject: `SCIP submitted — audit verdict for ${rec.site_name}: ${result.verdict === 'not_ready' ? 'NOT READY' : result.verdict === 'ready' ? 'CLEAN' : 'WARNINGS'}`,
      body: [
        `Your SCIP "${rec.site_name}" was just marked SUBMITTED. The automatic quality audit ran against the source data:`,
        `\nVERDICT: ${verdictLabel}`,
        bySeverity ? `\nFINDINGS:\n${bySeverity}` : '',
        `\nOpen the SCIP page and use the SCIP Quality Auditor panel to work through the fixes, then re-audit.`,
      ].filter(Boolean).join('\n'),
      from_name: 'SiteHawk Quality Auditor',
    });

    console.log(`scipSubmitAudit: ${rec.site_name} → ${result.verdict} (${result.counts.critical}C/${result.counts.warning}W) — verdict emailed to ${owner}.`);
    return Response.json({ ...result, emailed: true, emailed_to: owner });
  } catch (error) {
    console.error('scipSubmitAudit error:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
});