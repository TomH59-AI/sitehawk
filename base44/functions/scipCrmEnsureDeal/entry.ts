import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * scipCrmEnsureDeal — create (or fetch) the SCIP-centric CRM deal for a ScipRecord,
 * plus a ScipCRMContact per parcel target (A/B/C). Idempotent: re-running returns
 * the existing deal and only fills in missing contacts. Never touches the legacy
 * SearchResult CRMDeal/CRMActivity.
 *
 * Payload: { scip_record_id }
 * Returns: { deal, contacts, created }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scip_record_id } = await req.json();
    if (!scip_record_id) return Response.json({ error: 'scip_record_id required' }, { status: 400 });

    const scip = await base44.entities.ScipRecord.get(scip_record_id);
    if (!scip) return Response.json({ error: 'ScipRecord not found' }, { status: 404 });

    const targets = Array.isArray(scip.parcel_targets) ? scip.parcel_targets : [];
    const activeIdx = scip.active_target_index || 0;

    const targetSummary = targets
      .slice(0, 3)
      .map((t, i) => `${t.label || `Target ${String.fromCharCode(65 + i)}`}: ${t.owner_name || 'Unknown'}${t.apn ? ` (${t.apn})` : ''}`)
      .join(' · ');

    // 1) Find or create the deal (one per SCIP).
    const existing = await base44.entities.ScipCRMDeal.filter({ scip_record_id });
    let deal = existing[0] || null;
    let created = false;

    if (!deal) {
      deal = await base44.entities.ScipCRMDeal.create({
        scip_record_id,
        site_name: scip.site_name || '',
        jurisdiction: scip.zoning_jurisdiction || '',
        active_target_index: activeIdx,
        target_summary: targetSummary,
        stage: 'scip_generated',
        priority: 'medium',
        assigned_user: user.email,
      });
      created = true;
      await base44.entities.ScipCRMActivity.create({
        scip_crm_deal_id: deal.id,
        scip_record_id,
        type: 'system',
        summary: `SCIP CRM deal created for "${scip.site_name || 'site'}"`,
        actor: user.email,
      });
    }

    // 2) Ensure a contact per parcel target (only fill missing ones).
    const existingContacts = await base44.entities.ScipCRMContact.filter({ scip_crm_deal_id: deal.id });
    const haveByIndex = new Set(existingContacts.map((c) => c.target_index));
    const labels = ['Target A', 'Target B', 'Target C'];

    const toCreate = [];
    targets.slice(0, 3).forEach((t, i) => {
      if (haveByIndex.has(i)) return;
      toCreate.push({
        scip_crm_deal_id: deal.id,
        scip_record_id,
        target_label: t.label && labels.includes(t.label) ? t.label : labels[i] || 'Extra',
        target_index: i,
        owner_name: t.owner_name || `Unknown Owner (Target ${String.fromCharCode(65 + i)})`,
        parcel_address: t.parcel_address || '',
        mailing_address: t.mailing_address || '',
        apn: t.apn || '',
        latitude: t.latitude,
        longitude: t.longitude,
        contact_status: 'not_contacted',
        interest_level: 'unknown',
      });
    });

    let newContacts = [];
    if (toCreate.length) {
      newContacts = await base44.entities.ScipCRMContact.bulkCreate(toCreate);
    }
    const contacts = [...existingContacts, ...newContacts].sort((a, b) => (a.target_index || 0) - (b.target_index || 0));

    return Response.json({ deal, contacts, created });
  } catch (error) {
    console.error('scipCrmEnsureDeal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});