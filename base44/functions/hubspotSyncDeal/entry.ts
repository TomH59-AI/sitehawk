import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * hubspotSyncDeal — upserts a HubSpot Contact + Deal for a SiteHawk CRMDeal.
 *
 * Called two ways:
 *   1) Manually from frontend / other functions:
 *        base44.functions.invoke('hubspotSyncDeal', { deal_id: '<CRMDeal.id>' })
 *   2) Automatically via the "CRMDeal → HubSpot Sync" entity automation
 *      (create/update events). The automation payload carries event + data.
 *
 * Behavior:
 *   - Contact match key: email (preferred) → falls back to creating a new contact
 *     keyed by owner_name + parcel_address.
 *   - Deal match key: dealname containing "[APN:<parcel_id>]" — searched first;
 *     if found, we PATCH; otherwise we POST a new deal and associate it to the contact.
 *   - SiteHawk pipeline stages map to HubSpot default sales-pipeline stage IDs.
 */

const HS_BASE = "https://api.hubapi.com";

// SiteHawk CRMDeal.stage  →  HubSpot default sales pipeline stageId
const STAGE_MAP = {
  prospect:    "appointmentscheduled",
  contacted:   "qualifiedtobuy",
  interested:  "presentationscheduled",
  negotiating: "contractsent",
  signed:      "closedwon",
  lost:        "closedlost",
};

async function hsFetch(accessToken, path, opts = {}) {
  const res = await fetch(`${HS_BASE}${path}`, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`HubSpot ${path}: ${msg}`);
  }
  return body;
}

// Find contact by email; returns id or null
async function findContactByEmail(accessToken, email) {
  if (!email) return null;
  const body = await hsFetch(accessToken, "/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email"],
      limit: 1,
    }),
  });
  return body?.results?.[0]?.id || null;
}

// Find existing deal by APN tag in dealname; returns id or null
async function findDealByApnTag(accessToken, apnTag) {
  const body = await hsFetch(accessToken, "/crm/v3/objects/deals/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "dealname", operator: "CONTAINS_TOKEN", value: apnTag }] }],
      properties: ["dealname", "dealstage"],
      limit: 1,
    }),
  });
  return body?.results?.[0]?.id || null;
}

async function upsertContact(accessToken, deal) {
  const [firstName, ...rest] = (deal.owner_name || "").split(" ");
  const lastName = rest.join(" ");
  const props = {
    firstname: firstName || deal.owner_name || "Property Owner",
    lastname:  lastName || "",
    email:     deal.email || "",
    phone:     deal.phone || "",
    address:   deal.owner_mailing_address || "",
    sitehawk_parcel_address: deal.parcel_address || "",
  };
  // Strip empties so HubSpot doesn't reject blanks on update
  Object.keys(props).forEach((k) => { if (!props[k]) delete props[k]; });

  const existingId = await findContactByEmail(accessToken, deal.email);
  if (existingId) {
    await hsFetch(accessToken, `/crm/v3/objects/contacts/${existingId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: props }),
    });
    return existingId;
  }
  const created = await hsFetch(accessToken, "/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({ properties: props }),
  });
  return created.id;
}

async function upsertDeal(accessToken, deal, contactId) {
  const apnTag = deal.candidate_id ? `[APN:${deal.candidate_id}]` : `[SH:${deal.id}]`;
  const dealname = `${deal.owner_name || "Owner"} — ${deal.parcel_address || "Parcel"} ${apnTag}`;
  const props = {
    dealname,
    dealstage: STAGE_MAP[deal.stage] || STAGE_MAP.prospect,
    pipeline: "default",
    sitehawk_deal_id: deal.id,
    sitehawk_parcel_id: deal.candidate_id || "",
    sitehawk_match_score: deal.match_score ? String(deal.match_score) : "",
    description: deal.notes || "",
    closedate: deal.follow_up_date ? new Date(deal.follow_up_date).getTime() : undefined,
  };
  Object.keys(props).forEach((k) => { if (props[k] === "" || props[k] === undefined) delete props[k]; });

  const existingId = await findDealByApnTag(accessToken, apnTag);
  let dealId;
  if (existingId) {
    await hsFetch(accessToken, `/crm/v3/objects/deals/${existingId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: props }),
    });
    dealId = existingId;
  } else {
    const created = await hsFetch(accessToken, "/crm/v3/objects/deals", {
      method: "POST",
      body: JSON.stringify({ properties: props }),
    });
    dealId = created.id;
  }

  // Associate contact ↔ deal (idempotent — HubSpot ignores duplicates)
  if (contactId) {
    try {
      await hsFetch(accessToken, `/crm/v4/objects/deals/${dealId}/associations/default/contacts/${contactId}`, {
        method: "PUT",
        body: JSON.stringify([]),
      });
    } catch (e) {
      console.warn("Contact association warning:", e.message);
    }
  }
  return dealId;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));

    // Resolve the deal — either an entity-automation payload (data is the new record)
    // or a manual invoke that passes { deal_id }.
    let deal = null;
    if (payload?.event?.entity_name === "CRMDeal" && payload?.data) {
      deal = payload.data;
    } else if (payload?.deal_id) {
      deal = await base44.asServiceRole.entities.CRMDeal.get(payload.deal_id);
    } else if (payload?.payload_too_large && payload?.event?.entity_id) {
      deal = await base44.asServiceRole.entities.CRMDeal.get(payload.event.entity_id);
    }

    if (!deal?.id) {
      return Response.json({ error: "No CRMDeal resolved from payload" }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("hubspot");
    if (!accessToken) {
      return Response.json({ error: "HubSpot not authorized" }, { status: 500 });
    }

    const contactId = await upsertContact(accessToken, deal);
    const dealId = await upsertDeal(accessToken, deal, contactId);

    console.log(`[hubspotSyncDeal] CRMDeal ${deal.id} → HS contact ${contactId} / deal ${dealId}`);
    return Response.json({ ok: true, hubspot_contact_id: contactId, hubspot_deal_id: dealId });
  } catch (error) {
    console.error("hubspotSyncDeal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});