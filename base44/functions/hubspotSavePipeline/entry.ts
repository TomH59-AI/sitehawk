import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * hubspotSavePipeline — explicit "Save to HubSpot Pipeline" action from the
 * property comparison panel / individual target cards.
 *
 * Differs from hubspotSyncDeal (which auto-fires from SCIP load + CRMDeal
 * automations) in that it takes the operator's chosen Lease Status and an
 * optional follow-up date, and creates a HubSpot Task when a follow-up is set.
 *
 * Payload:
 *   {
 *     target: {
 *       owner_name, parcel_address, owner_mailing_address, email, phone,
 *       parcel_id, parcel_size_acres, latitude, longitude, score,
 *       zoning_classification, jurisdiction, label
 *     },
 *     lease_status: "prospect" | "initial_contact" | "negotiating" | "lease_signed" | "rejected",
 *     follow_up_date: "YYYY-MM-DD" | null,
 *     tower_height_ft: number | null,
 *     agent: { name, email, phone }
 *   }
 *
 * Returns: { ok, hubspot_contact_id, hubspot_deal_id, hubspot_task_id }
 */

const HS_BASE = "https://api.hubapi.com";

// "Save to Pipeline" lease-status → HubSpot default sales pipeline stageId
const LEASE_STATUS_MAP = {
  prospect:        "appointmentscheduled",
  initial_contact: "qualifiedtobuy",
  negotiating:     "contractsent",
  lease_signed:    "closedwon",
  rejected:        "closedlost",
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

async function upsertContact(accessToken, target, subscriberEmail) {
  const [firstName, ...rest] = (target.owner_name || "").split(" ");
  const props = {
    firstname: firstName || target.owner_name || "Property Owner",
    lastname:  rest.join(" "),
    email:     target.email || "",
    phone:     target.phone || "",
    address:   target.owner_mailing_address || "",
    sitehawk_parcel_address: target.parcel_address || "",
    sitehawk_subscriber_email: subscriberEmail || "",
  };
  Object.keys(props).forEach((k) => { if (!props[k]) delete props[k]; });

  const existingId = await findContactByEmail(accessToken, target.email);
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

async function upsertDeal(accessToken, target, leaseStatus, towerHeightFt, contactId, subscriberEmail) {
  const apnTag = target.parcel_id ? `[APN:${target.parcel_id}]` : `[SH:${target.label || "TGT"}]`;
  const dealname = `${target.owner_name || "Owner"} — ${target.parcel_address || "Parcel"} ${apnTag}`;
  const noteLines = [
    `Target ID: ${target.label || target.parcel_id || "n/a"}`,
    towerHeightFt ? `Tower Height: ${towerHeightFt} ft` : null,
    target.parcel_size_acres ? `Parcel: ${target.parcel_size_acres} ac` : null,
    target.zoning_classification ? `Zoning: ${target.zoning_classification}` : null,
    target.jurisdiction ? `Jurisdiction: ${target.jurisdiction}` : null,
    (target.latitude != null && target.longitude != null)
      ? `Coords: ${Number(target.latitude).toFixed(6)}, ${Number(target.longitude).toFixed(6)}`
      : null,
    target.score != null ? `Assigned Score: ${target.score}` : null,
  ].filter(Boolean);

  const props = {
    dealname,
    dealstage: LEASE_STATUS_MAP[leaseStatus] || LEASE_STATUS_MAP.prospect,
    pipeline: "default",
    sitehawk_parcel_id: target.parcel_id || "",
    sitehawk_target_id: target.label || "",
    sitehawk_tower_height_ft: towerHeightFt ? String(towerHeightFt) : "",
    sitehawk_match_score: target.score != null ? String(target.score) : "",
    sitehawk_subscriber_email: subscriberEmail || "",
    sitehawk_source: "save_to_pipeline",
    description: noteLines.join("\n"),
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

async function createFollowUpTask(accessToken, target, followUpDate, dealId, contactId, subscriberEmail) {
  // HubSpot expects ms-since-epoch for hs_timestamp; schedule for 9am UTC on the chosen day.
  const due = new Date(`${followUpDate}T09:00:00Z`).getTime();
  const subject = `Follow up with ${target.owner_name || "Landlord"} re: On-Air site candidate`;
  const bodyLines = [
    target.parcel_address ? `Parcel: ${target.parcel_address}` : null,
    target.parcel_id ? `APN: ${target.parcel_id}` : null,
    target.label ? `Target ${target.label}` : null,
    target.phone ? `Phone: ${target.phone}` : null,
    target.email ? `Email: ${target.email}` : null,
  ].filter(Boolean);

  const created = await hsFetch(accessToken, "/crm/v3/objects/tasks", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_task_subject: subject,
        hs_task_body: bodyLines.join("\n"),
        hs_task_status: "NOT_STARTED",
        hs_task_priority: "HIGH",
        hs_task_type: "TODO",
        hs_timestamp: due,
        sitehawk_subscriber_email: subscriberEmail || "",
      },
    }),
  });
  const taskId = created.id;

  // Associate task ↔ deal + task ↔ contact (best-effort)
  if (dealId) {
    try {
      await hsFetch(accessToken, `/crm/v4/objects/tasks/${taskId}/associations/default/deals/${dealId}`, {
        method: "PUT",
        body: JSON.stringify([]),
      });
    } catch (e) { console.warn("Task↔deal association warning:", e.message); }
  }
  if (contactId) {
    try {
      await hsFetch(accessToken, `/crm/v4/objects/tasks/${taskId}/associations/default/contacts/${contactId}`, {
        method: "PUT",
        body: JSON.stringify([]),
      });
    } catch (e) { console.warn("Task↔contact association warning:", e.message); }
  }
  return taskId;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const target = payload?.target;
    if (!target || !target.owner_name) {
      return Response.json({ error: "Missing target.owner_name" }, { status: 400 });
    }
    const leaseStatus = payload?.lease_status || "prospect";
    const followUpDate = payload?.follow_up_date || null;
    const towerHeightFt = payload?.tower_height_ft || null;
    const subscriberEmail = user.email;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("hubspot");
    if (!accessToken) {
      return Response.json({ error: "HubSpot not authorized" }, { status: 500 });
    }

    const contactId = await upsertContact(accessToken, target, subscriberEmail);
    const dealId = await upsertDeal(accessToken, target, leaseStatus, towerHeightFt, contactId, subscriberEmail);
    let taskId = null;
    if (followUpDate) {
      taskId = await createFollowUpTask(accessToken, target, followUpDate, dealId, contactId, subscriberEmail);
    }

    console.log(`[hubspotSavePipeline] subscriber=${subscriberEmail} target=${target.label || target.parcel_id} status=${leaseStatus} → contact ${contactId} / deal ${dealId} / task ${taskId || "none"}`);

    return Response.json({
      ok: true,
      hubspot_contact_id: contactId,
      hubspot_deal_id: dealId,
      hubspot_task_id: taskId,
    });
  } catch (error) {
    console.error("hubspotSavePipeline error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});