import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { auditScipRecord } from '../../shared/scipAudit.ts';
import { supervisedResponse } from '../../shared/siteHawkSupervisor.ts';

// SCIP Quality Audit — deterministic pre-print checks for a ScipRecord.
// The check engine lives in shared/scipAudit.ts (also used by the
// on-submit auto-audit automation). No data is ever modified.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scip_record_id } = (await req.json()) ?? {};
    if (!scip_record_id) return Response.json({ error: 'scip_record_id is required' }, { status: 400 });

    const rec = await base44.entities.ScipRecord.get(scip_record_id);
    if (!rec) return Response.json({ error: 'SCIP record not found' }, { status: 404 });

    const result = auditScipRecord(rec);
    console.log(`scipQualityAudit: ${result.site_name || scip_record_id} → ${result.verdict} (${result.counts.critical}C/${result.counts.warning}W/${result.counts.info}I) for ${user.email}`);
    return await supervisedResponse({
      original_user_request: 'Audit this SCIP record for delivery readiness.',
      proposed_action: 'Release the deterministic SCIP quality-audit verdict.',
      supporting_evidence: { scip_record_id, audit_counts: result.counts, audit_issues: result.issues },
      risk_level: 'high',
    }, result);
  } catch (error) {
    console.error('scipQualityAudit error:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
});