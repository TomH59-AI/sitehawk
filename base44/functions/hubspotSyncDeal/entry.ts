import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * hubspotSyncDeal — upserts a HubSpot Contact + Deal for a SiteHawk lead.
 *
 * Three call shapes:
 *   1) CRMDeal automation:           { event: { entity_name: 'CRMDeal' }, data: {...} }
 *   2) Manual CRMDeal sync:          { deal_id: '<CRMDeal.id>' }
 *   3) SCIP candidate sync:          { candidate: {...SearchResult}, source: 'scip',
 *                                       agent: { name, email, phone } }   ← new
 *
 * Multi-tenant tagging (shared HubSpot mode):
 *   Every Contact + Deal is tagged with `sitehawk_subscriber_email` so you can
 *   segment leads per subscriber inside your master HubSpot. Swap to per-user
 *   connectors later by replacing `getConnection` with `getCurrentAppUserConnection`.
 *
 * Match keys:
 *   - Contact: email → fallback create.
 *   - Deal: dealname containing "[APN:<parcel_id>]".
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

async function upsertContact(accessToken, deal, subscriberEmail) {
  const [firstName, ...rest] = (deal.owner_name || "").split(" ");
  const lastName = rest.join(" ");
  const props = {
    firstname: firstName || deal.owner_name || "Property Owner",
    lastname:  lastName || "",
    email:     deal.email || "",
    phone:     deal.phone || "",
    address:   deal.owner_mailing_address || "",
    sitehawk_parcel_address: deal.parcel_address || "",
    sitehawk_subscriber_email: subscriberEmail || "",
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

async function upsertDeal(accessToken, deal, contactId, subscriberEmail) {
  const apnTag = deal.candidate_id ? `[APN:${deal.candidate_id}]` : `[SH:${deal.id}]`;
  const dealname = `${deal.owner_name || "Owner"} — ${deal.parcel_address || "Parcel"} ${apnTag}`;
  const props = {
    dealname,
    dealstage: STAGE_MAP[deal.stage] || STAGE_MAP.prospect,
    pipeline: "default",
    sitehawk_deal_id: deal.id,
    sitehawk_parcel_id: deal.candidate_id || "",
    sitehawk_match_score: deal.match_score ? String(deal.match_score) : "",
    sitehawk_subscriber_email: subscriberEmail || "",
    sitehawk_source: deal._source || "crm",
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

// Convert a SCIP candidate (SearchResult) into the unified "deal" shape
function candidateToDeal(c, agent) {
  return {
    id: c.id,
    candidate_id: c.parcel_id || c.id,
    owner_name: c.owner_name || "Property Owner",
    parcel_address: c.parcel_address || c.site_name || "",
    owner_mailing_address: c.owner_mailing_address || "",
    phone: c.phone || "",
    email: c.email || "",
    match_score: c.match_score,
    stage: "prospect",
    notes: [
      c.site_name && `Site: ${c.site_name}`,
      c.zoning_classification && `Zoning: ${c.zoning_classification}`,
      c.parcel_size_acres && `${c.parcel_size_acres} acres`,
      agent?.name && `SCIP generated by ${agent.name}`,
    ].filter(Boolean).join(" · "),
    _source: "scip",
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));

    // Resolve the subscriber identity (used to tag HubSpot records for segmentation)
    let subscriberEmail = "";
    try {
      const me = await base44.auth.me();
      subscriberEmail = me?.email || "";
    } catch { /* automation context — no user */ }

    // Resolve the deal payload
    let deal = null;
    if (payload?.candidate && payload?.source === "scip") {
      // SCIP-driven lead capture
      deal = candidateToDeal(payload.candidate, payload.agent);
      if (!subscriberEmail) subscriberEmail = payload.agent?.email || payload.candidate?.created_by || "";
    } else if (payload?.event?.entity_name === "CRMDeal" && payload?.data) {
      deal = payload.data;
      if (!subscriberEmail) subscriberEmail = payload.data?.created_by || "";
    } else if (payload?.deal_id) {
      deal = await base44.asServiceRole.entities.CRMDeal.get(payload.deal_id);
    } else if (payload?.payload_too_large && payload?.event?.entity_id) {
      deal = await base44.asServiceRole.entities.CRMDeal.get(payload.event.entity_id);
      if (!subscriberEmail) subscriberEmail = deal?.created_by || "";
    }

    if (!deal?.id) {
      return Response.json({ error: "No lead resolved from payload" }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("hubspot");
    if (!accessToken) {
      return Response.json({ error: "HubSpot not authorized" }, { status: 500 });
    }

    const contactId = await upsertContact(accessToken, deal, subscriberEmail);
    const dealId = await upsertDeal(accessToken, deal, contactId, subscriberEmail);

    console.log(`[hubspotSyncDeal] ${deal._source || "crm"} lead ${deal.id} (subscriber: ${subscriberEmail || "n/a"}) → HS contact ${contactId} / deal ${dealId}`);
    return Response.json({ ok: true, hubspot_contact_id: contactId, hubspot_deal_id: dealId, source: deal._source || "crm" });
  } catch (error) {
    console.error("hubspotSyncDeal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});