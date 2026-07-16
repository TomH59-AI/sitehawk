import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * autoCrmFromTargets — entity automation handler for ScipRecord create/update.
 * Whenever a SCIP's parcel targets are set/changed, ensure a SCIP CRM deal + one
 * CRM contact per Target (A/B/C) exists, so every user's targets land in their
 * CRM by default (they can just delete the ones they don't want).
 *
 * Runs as service role (no user context in automations) and attributes the deal
 * to the SCIP's owner. Idempotent: reuses the existing deal and only fills
 * missing contacts, so a contact a user deleted is NOT recreated on later edits.
 *
 * Trigger payload: { event: { entity_id }, data, old_data, payload_too_large }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json();
    const event = body?.event || {};
    const scipId = event.entity_id;
    if (!scipId) return Response.json({ ok: false, reason: 'no_entity_id' });

    let scip = body?.data;
    if (body?.payload_too_large || !scip) {
      scip = await svc.entities.ScipRecord.get(scipId);
    }

    const targets = Array.isArray(scip?.parcel_targets) ? scip.parcel_targets : [];
    if (!targets.length) return Response.json({ ok: true, skipped: 'no_targets' });

    // Only act when targets were actually just set/changed. On create, old_data
    // is null → always run.
    const oldTargets = body?.old_data?.parcel_targets;
    const changed = JSON.stringify(oldTargets || []) !== JSON.stringify(targets);
    if (!changed) return Response.json({ ok: true, skipped: 'targets_unchanged' });

    const ownerEmail = scip.created_by || null;
    const activeIdx = scip.active_target_index || 0;
    const labels = ['Target A', 'Target B', 'Target C'];

    const targetSummary = targets
      .slice(0, 3)
      .map((t, i) => `${t.label || labels[i]}: ${t.owner_name || 'Unknown'}${t.apn ? ` (${t.apn})` : ''}`)
      .join(' · ');

    // 1) Find or create the deal (one per SCIP).
    const existing = await svc.entities.ScipCRMDeal.filter({ scip_record_id: scipId });
    let deal = existing[0] || null;
    if (!deal) {
      deal = await svc.entities.ScipCRMDeal.create({
        scip_record_id: scipId,
        site_name: scip.site_name || '',
        jurisdiction: scip.zoning_jurisdiction || '',
        active_target_index: activeIdx,
        target_summary: targetSummary,
        stage: 'scip_generated',
        priority: 'medium',
        assigned_user: ownerEmail || '',
      });
      await svc.entities.ScipCRMActivity.create({
        scip_crm_deal_id: deal.id,
        scip_record_id: scipId,
        type: 'system',
        summary: `Targets auto-added to CRM for "${scip.site_name || 'site'}"`,
        actor: 'system',
      });
    }

    // 2) Ensure a contact per parcel target (only fill missing indexes, so a
    // user-deleted contact is never recreated).
    const existingContacts = await svc.entities.ScipCRMContact.filter({ scip_crm_deal_id: deal.id });
    const haveByIndex = new Set(existingContacts.map((c) => c.target_index));

    const toCreate = [];
    targets.slice(0, 3).forEach((t, i) => {
      if (haveByIndex.has(i)) return;
      toCreate.push({
        scip_crm_deal_id: deal.id,
        scip_record_id: scipId,
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

    let created = 0;
    if (toCreate.length) {
      await svc.entities.ScipCRMContact.bulkCreate(toCreate);
      created = toCreate.length;
    }

    return Response.json({ ok: true, deal_id: deal.id, contacts_created: created });
  } catch (error) {
    console.error('autoCrmFromTargets error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});