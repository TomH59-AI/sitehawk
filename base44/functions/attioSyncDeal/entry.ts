import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * attioSyncDeal — Attio + Apollo CRM integration. Runs ALONGSIDE the HubSpot
 * integration (hubspotSyncDeal / hubspotSavePipeline) and never touches it.
 *
 * Flow:
 *   1. Apollo people/match enriches the owner contact (email, title, phone,
 *      LinkedIn) when possible — enrichment failures never block the sync.
 *   2. Attio Person is upserted (matched by email when available).
 *   3. Attio Deal is upserted (matched by "[APN:<parcel_id>]" tag in the name)
 *      and associated to the person.
 *   4. A note with parcel + enrichment details is attached to new deals.
 *
 * Call shapes (mirrors hubspotSyncDeal):
 *   1) SCIP candidate sync:  { candidate: {...SearchResult}, source: 'scip', agent: {...} }
 *   2) Target sync:          { target: {...}, lease_status?: 'prospect' }
 *   3) Manual CRMDeal sync:  { deal_id: '<CRMDeal.id>' }
 *   4) CRMDeal automation:   { event: { entity_name: 'CRMDeal' }, data: {...} }
 */

const ATTIO_BASE = "https://api.attio.com/v2";

// SiteHawk stage → Attio default deal stage title
const STAGE_MAP = {
  prospect: "Lead",
  initial_contact: "In Progress",
  contacted: "In Progress",
  interested: "In Progress",
  negotiating: "In Progress",
  lease_signed: "Won 🎉",
  signed: "Won 🎉",
  rejected: "Lost",
  lost: "Lost",
};

async function attioFetch(path, opts = {}) {
  const res = await fetch(`${ATTIO_BASE}${path}`, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${Deno.env.get("ATTIO_API_KEY")}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.message || body?.error?.message || `HTTP ${res.status}`;
    const err = new Error(`Attio ${path}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// Apollo enrichment — best-effort, never throws upstream.
async function apolloEnrich(deal) {
  try {
    const key = Deno.env.get("APOLLO_API_KEY");
    if (!key || !deal.owner_name) return null;
    const res = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        name: deal.owner_name,
        ...(deal.email ? { email: deal.email } : {}),
        reveal_personal_emails: false,
      }),
    });
    if (!res.ok) {
      console.warn(`[attioSyncDeal] Apollo enrich HTTP ${res.status} — continuing without enrichment`);
      return null;
    }
    const body = await res.json();
    const p = body?.person;
    if (!p) return null;
    return {
      email: p.email && !p.email.includes("email_not_unlocked") ? p.email : null,
      title: p.title || null,
      linkedin_url: p.linkedin_url || null,
      organization: p.organization?.name || null,
      phone: p.phone_numbers?.[0]?.sanitized_number || null,
      city: p.city || null,
      state: p.state || null,
    };
  } catch (e) {
    console.warn("[attioSyncDeal] Apollo enrich failed:", e.message);
    return null;
  }
}

function cleanPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 10 ? (digits.startsWith("+") ? digits : `+1${digits.replace(/\D/g, "").slice(-10)}`) : null;
}

async function upsertPerson(deal, enrich) {
  const email = deal.email || enrich?.email || null;
  const phone = cleanPhone(deal.phone || enrich?.phone);
  const [firstName, ...rest] = (deal.owner_name || "Property Owner").split(" ");
  const values = {
    name: [{ first_name: firstName, last_name: rest.join(" ") || firstName, full_name: deal.owner_name || "Property Owner" }],
    ...(email ? { email_addresses: [email] } : {}),
    ...(phone ? { phone_numbers: [{ original_phone_number: phone }] } : {}),
    ...(enrich?.title ? { job_title: enrich.title } : {}),
    ...(enrich?.linkedin_url ? { linkedin: enrich.linkedin_url } : {}),
  };

  async function send(vals) {
    if (email) {
      const body = await attioFetch(`/objects/people/records?matching_attribute=email_addresses`, {
        method: "PUT",
        body: JSON.stringify({ data: { values: vals } }),
      });
      return body?.data?.id?.record_id;
    }
    const body = await attioFetch(`/objects/people/records`, {
      method: "POST",
      body: JSON.stringify({ data: { values: vals } }),
    });
    return body?.data?.id?.record_id;
  }

  try {
    return await send(values);
  } catch (e) {
    // Retry once without optional attributes (workspace may lack them / reject phone format)
    if (e.status === 400) {
      console.warn("[attioSyncDeal] person create retry without optional fields:", e.message);
      const minimal = { name: values.name, ...(email ? { email_addresses: [email] } : {}) };
      return await send(minimal);
    }
    throw e;
  }
}

async function findDealByApnTag(apnTag) {
  const body = await attioFetch(`/objects/deals/records/query`, {
    method: "POST",
    body: JSON.stringify({ filter: { name: { $contains: apnTag } }, limit: 1 }),
  });
  return body?.data?.[0]?.id?.record_id || null;
}

async function defaultOwnerActor() {
  const body = await attioFetch(`/workspace_members`, { method: "GET" });
  const member = body?.data?.[0];
  return member ? { referenced_actor_type: "workspace-member", referenced_actor_id: member.id.workspace_member_id } : null;
}

async function upsertDeal(deal, personId, stageTitle) {
  const apnTag = deal.candidate_id ? `[APN:${deal.candidate_id}]` : `[SH:${deal.id}]`;
  const name = `${deal.owner_name || "Owner"} — ${deal.parcel_address || "Parcel"} ${apnTag}`;
  const baseValues = {
    name,
    stage: stageTitle,
    ...(personId ? { associated_people: [{ target_object: "people", target_record_id: personId }] } : {}),
  };

  const existingId = await findDealByApnTag(apnTag);
  if (existingId) {
    try {
      await attioFetch(`/objects/deals/records/${existingId}`, {
        method: "PATCH",
        body: JSON.stringify({ data: { values: baseValues } }),
      });
    } catch (e) {
      if (e.status !== 400) throw e;
      // Workspace stage titles may differ — update everything except stage
      const { stage: _stage, ...rest } = baseValues;
      await attioFetch(`/objects/deals/records/${existingId}`, {
        method: "PATCH",
        body: JSON.stringify({ data: { values: rest } }),
      });
    }
    return { dealId: existingId, created: false };
  }

  const owner = await defaultOwnerActor();
  const createValues = { ...baseValues, ...(owner ? { owner } : {}) };
  try {
    const body = await attioFetch(`/objects/deals/records`, {
      method: "POST",
      body: JSON.stringify({ data: { values: createValues } }),
    });
    return { dealId: body?.data?.id?.record_id, created: true };
  } catch (e) {
    if (e.status !== 400) throw e;
    // Retry with the workspace's default stage title
    console.warn("[attioSyncDeal] deal create retry with stage 'Lead':", e.message);
    const body = await attioFetch(`/objects/deals/records`, {
      method: "POST",
      body: JSON.stringify({ data: { values: { ...createValues, stage: "Lead" } } }),
    });
    return { dealId: body?.data?.id?.record_id, created: true };
  }
}

async function attachNote(parentObject, parentRecordId, deal, enrich, subscriberEmail) {
  const lines = [
    deal.parcel_address && `Parcel: ${deal.parcel_address}`,
    deal.candidate_id && `APN: ${deal.candidate_id}`,
    deal.match_score != null && `SiteHawk Match Score: ${deal.match_score}`,
    deal.owner_mailing_address && `Owner Mailing Address: ${deal.owner_mailing_address}`,
    deal.notes && `Notes: ${deal.notes}`,
    subscriberEmail && `SiteHawk Subscriber: ${subscriberEmail}`,
    enrich?.title && `Apollo — Title: ${enrich.title}`,
    enrich?.organization && `Apollo — Organization: ${enrich.organization}`,
    enrich?.linkedin_url && `Apollo — LinkedIn: ${enrich.linkedin_url}`,
    enrich?.email && `Apollo — Email: ${enrich.email}`,
    enrich?.phone && `Apollo — Phone: ${enrich.phone}`,
  ].filter(Boolean);
  if (!lines.length) return;
  try {
    await attioFetch(`/notes`, {
      method: "POST",
      body: JSON.stringify({
        data: {
          parent_object: parentObject,
          parent_record_id: parentRecordId,
          title: "SiteHawk Lead Details",
          format: "plaintext",
          content: lines.join("\n"),
        },
      }),
    });
  } catch (e) {
    console.warn("[attioSyncDeal] note attach warning:", e.message);
  }
}

// Convert a SCIP candidate / target into the unified "deal" shape
function candidateToDeal(c, agent, stage) {
  return {
    id: c.id || c.apn || c.parcel_id,
    candidate_id: c.parcel_id || c.apn || c.id,
    owner_name: c.owner_name || c.owner || "Property Owner",
    parcel_address: c.parcel_address || c.site_name || "",
    owner_mailing_address: c.owner_mailing_address || c.mailing_address || "",
    phone: c.phone || c.owner_phone || "",
    email: c.email || "",
    match_score: c.match_score ?? c.score,
    stage: stage || "prospect",
    notes: [
      c.site_name && `Site: ${c.site_name}`,
      c.zoning_classification && `Zoning: ${c.zoning_classification}`,
      (c.parcel_size_acres || c.acreage) && `${c.parcel_size_acres || c.acreage} acres`,
      agent?.name && `SCIP generated by ${agent.name}`,
    ].filter(Boolean).join(" · "),
    _source: "scip",
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    if (!Deno.env.get("ATTIO_API_KEY")) {
      return Response.json({ error: "ATTIO_API_KEY not configured" }, { status: 500 });
    }
    const payload = await req.json().catch(() => ({}));

    let subscriberEmail = "";
    try {
      const me = await base44.auth.me();
      subscriberEmail = me?.email || "";
    } catch { /* automation context — no user */ }

    // Resolve the deal payload (same shapes as the HubSpot function)
    let deal = null;
    if (payload?.candidate && payload?.source === "scip") {
      deal = candidateToDeal(payload.candidate, payload.agent, payload.lease_status);
      if (!subscriberEmail) subscriberEmail = payload.agent?.email || payload.candidate?.created_by || "";
    } else if (payload?.target) {
      deal = candidateToDeal(payload.target, null, payload.lease_status);
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

    // 1. Apollo enrichment (best-effort)
    const enrich = await apolloEnrich(deal);

    // 2 + 3. Attio person + deal upsert
    const personId = await upsertPerson(deal, enrich);
    const stageTitle = STAGE_MAP[deal.stage] || "Lead";
    let dealId = null;
    let dealsDisabled = false;
    try {
      const result = await upsertDeal(deal, personId, stageTitle);
      dealId = result.dealId;
      // 4. Note with parcel + enrichment context on new deals
      if (result.created && dealId) await attachNote("deals", dealId, deal, enrich, subscriberEmail);
    } catch (e) {
      if (!/must be enabled/i.test(e.message)) throw e;
      // Deals standard object not enabled in this Attio workspace —
      // attach the lead details to the person record instead.
      dealsDisabled = true;
      console.warn("[attioSyncDeal] Attio Deals object disabled — attaching note to person instead");
      if (personId) await attachNote("people", personId, deal, enrich, subscriberEmail);
    }

    console.log(`[attioSyncDeal] ${deal._source || "crm"} lead ${deal.id} (subscriber: ${subscriberEmail || "n/a"}) → Attio person ${personId} / deal ${dealId} · Apollo enriched: ${!!enrich}`);
    return Response.json({
      ok: true,
      attio_person_id: personId,
      attio_deal_id: dealId,
      attio_deals_disabled: dealsDisabled || undefined,
      apollo_enriched: !!enrich,
      apollo: enrich || null,
      source: deal._source || "crm",
    });
  } catch (error) {
    console.error("attioSyncDeal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});