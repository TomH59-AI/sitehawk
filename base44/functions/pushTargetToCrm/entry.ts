import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * pushTargetToCrm — create a standalone SCIP CRM contact for ONE parcel owner
 * straight from the Site Search Target table (before any SCIP record exists).
 *
 * The contact records the owner, the Search Ring name, the Target letter (A/B/C),
 * and the property coordinates. Because ScipCRMContact requires a parent deal FK,
 * we lazily ensure ONE per-user "Search Ring Leads" deal (a holding pipeline) and
 * attach every search-ring contact to it. Idempotent per ring+target+owner so the
 * same target isn't duplicated on repeat clicks.
 *
 * Payload: { ring_name, target_label, target_index, owner_name, parcel_address,
 *            mailing_address, apn, latitude, longitude }
 * Returns: { contact, deal_id, created }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const ringName = (body.ring_name || 'Search Ring').trim();
    const targetLabel = body.target_label || 'Target A';
    const targetIndex = Number.isFinite(body.target_index) ? body.target_index : 0;
    const ownerName = (body.owner_name || '').trim();
    if (!ownerName) return Response.json({ error: 'owner_name required' }, { status: 400 });

    const lat = body.latitude != null ? Number(body.latitude) : null;
    const lon = body.longitude != null ? Number(body.longitude) : null;
    const coordStr = lat != null && lon != null ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : '';

    // 1) Ensure the per-user holding deal for ad-hoc search-ring leads.
    const LEADS_SENTINEL = `search-ring-leads:${user.email}`;
    const existingDeals = await base44.entities.ScipCRMDeal.filter({ scip_record_id: LEADS_SENTINEL });
    let deal = existingDeals[0] || null;
    if (!deal) {
      deal = await base44.entities.ScipCRMDeal.create({
        scip_record_id: LEADS_SENTINEL,
        site_name: 'Search Ring Leads',
        stage: 'scip_generated',
        priority: 'medium',
        assigned_user: user.email,
        notes: 'Holding pipeline for owner contacts pushed directly from the Site Search target table.',
      });
    }

    // 2) Idempotency — same ring + target + owner shouldn't duplicate.
    const dupes = await base44.entities.ScipCRMContact.filter({
      scip_crm_deal_id: deal.id,
      owner_name: ownerName,
    });
    const ringNote = `Search Ring: ${ringName} · ${targetLabel}${coordStr ? ` · ${coordStr}` : ''}`;
    const already = dupes.find((c) => (c.notes || '').includes(`Search Ring: ${ringName}`) && c.target_label === targetLabel);
    if (already) {
      return Response.json({ contact: already, deal_id: deal.id, created: false });
    }

    const labels = ['Target A', 'Target B', 'Target C'];
    const contact = await base44.entities.ScipCRMContact.create({
      scip_crm_deal_id: deal.id,
      scip_record_id: LEADS_SENTINEL,
      target_label: labels.includes(targetLabel) ? targetLabel : 'Extra',
      target_index: targetIndex,
      owner_name: ownerName,
      parcel_address: body.parcel_address || '',
      mailing_address: body.mailing_address || '',
      apn: body.apn || '',
      latitude: lat,
      longitude: lon,
      contact_status: 'not_contacted',
      interest_level: 'unknown',
      notes: ringNote,
    });

    await base44.entities.ScipCRMActivity.create({
      scip_crm_deal_id: deal.id,
      scip_record_id: LEADS_SENTINEL,
      scip_crm_contact_id: contact.id,
      type: 'system',
      summary: `Contact "${ownerName}" pushed from Search Ring "${ringName}" (${targetLabel})${coordStr ? ` at ${coordStr}` : ''}`,
      actor: user.email,
    });

    return Response.json({ contact, deal_id: deal.id, created: true });
  } catch (error) {
    console.error('pushTargetToCrm error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});