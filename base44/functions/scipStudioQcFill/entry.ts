/*
 * ============================================================================
 *  SCIP STUDIO — AI QC WEB-FILL (Gemini)  ·  2026-07-23
 * ----------------------------------------------------------------------------
 *  Pre-print quality-control pass for the enterprise SCIP Document Studio.
 *
 *  WHAT IT DOES
 *    1. Loads the assembled ScipStudioDoc + the active Target parcel.
 *    2. Collects every BLANK, web-researchable field across the zoning,
 *       environmental, emergency, power, and fiber blocks.
 *    3. Sends the blanks + full site context to Gemini 3.1 Pro with
 *       add_context_from_internet=true (live web search) and a strict JSON
 *       schema. Gemini fills each blank with a value + source URL + confidence,
 *       or marks it "unverified" — nothing is fabricated.
 *    4. Persists the fills into the doc's NULL fields ONLY (existing values are
 *       never overwritten) and appends a quality_gate row recording the verdict.
 *    5. Returns { doc, fills, verdict, summary, gaps_remaining }.
 *
 *  WHY GEMINI 3.1 PRO
 *    Only gemini_3_flash / gemini_3_1_pro support add_context_from_internet
 *    (Google web search). 3.1 Pro is the higher-quality model. It spends more
 *    integration credits than the default — acceptable for a pre-print QC that
 *    a human is about to rely on.
 *
 *  GUARDS
 *    - Never overwrites a field that already has a value.
 *    - Never touches phone/email (those come from the Hawk Skip-Trace).
 *    - Never touches coordinates/elevation (stored USGS/parcel data).
 *    - Never touches analyst narratives (candidate_rationale, executive,
 *      recommendation, scorecard) — those aren't in the fillable set.
 *    - Unverifiable fields stay null and are listed in gaps_remaining.
 * ============================================================================
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Web-researchable fields per 2-level doc block. Deliberately excludes
// coordinates, elevation, phone/email, and analyst-owned narratives.
const FILLABLE = {
  "zoning.overview": [
    "planning_contact", "telecom_code_section", "approval_process",
    "application_fees", "estimated_timeframe", "minimum_lot_compliance",
    "maximum_tower_height", "stealth_required", "required_collocations",
    "residential_separation", "tower_separation", "measurement_method",
    "fall_zone_requirement", "future_land_use",
  ],
  "zoning.environmental": [
    "nearest_airport_distance", "wind_design_criteria", "topography_slope",
    "protected_lands", "airport_faa_concern",
  ],
  "zoning.emergency": [
    "police_jurisdiction", "police_contact", "fire_jurisdiction",
    "fire_contact", "nearest_hospital_ems", "emergency_access_notes",
  ],
  "infrastructure.power": [
    "utility_owner", "utility_contact", "service_voltage", "distance_to_candidate",
  ],
  "infrastructure.fiber": [
    "fiber_provider", "nearest_fiber_route", "telco_provider", "nearest_demarc",
    "backhaul_confidence",
  ],
};

function getPath(obj, path) {
  return path.split(".").reduce((cur, k) => (cur == null ? cur : cur[k]), obj);
}

function isBlank(v) {
  return v == null || v === "" || v === "null" || v === "Not Verified";
}

function qcRow(doc, verdict, summary, by) {
  return [...(doc.quality_gate || []), {
    check: "AI QC Web-Fill (Gemini)",
    required: true,
    result: verdict === "needs_review" ? "Fail" : "Pass",
    reviewed_by: by,
    review_date: new Date().toISOString().slice(0, 10),
    notes: summary,
  }];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scip_record_id } = (await req.json()) ?? {};
    if (!scip_record_id) return Response.json({ error: 'scip_record_id required' }, { status: 400 });

    const scip = await base44.entities.ScipRecord.get(scip_record_id);
    if (!scip) return Response.json({ error: 'SCIP record not found' }, { status: 404 });

    const docs = await base44.entities.ScipStudioDoc.filter({ scip_record_id });
    const doc = docs?.[0];
    if (!doc) return Response.json({ error: 'Assemble the Studio document first' }, { status: 400 });

    const tgt = scip.parcel_targets?.[scip.active_target_index || 0] || null;
    const ctx = {
      site_name: scip.site_name,
      county: scip.county,
      state: scip.state,
      latitude: scip.latitude,
      longitude: scip.longitude,
      candidate_label: tgt?.label || 'Target A',
      candidate_address: tgt?.parcel_address || null,
      owner_of_record: tgt?.owner_name || null,
      zoning_district: tgt?.zoning_classification || null,
      parcel_size_acres: tgt?.acreage ?? null,
      search_radius_mi: scip.search_radius,
      requested_tower_height_ft: scip.sarf_height,
      zoning_jurisdiction: scip.zoning_jurisdiction || null,
    };

    // ── Collect blanks ────────────────────────────────────────────────────
    const blanks = [];
    for (const [block, fields] of Object.entries(FILLABLE)) {
      for (const field of fields) {
        if (isBlank(getPath(doc, `${block}.${field}`))) blanks.push({ block, field });
      }
    }

    if (blanks.length === 0) {
      const summary = 'No blank web-researchable fields remained — document already complete.';
      const updated = await base44.entities.ScipStudioDoc.update(doc.id, {
        quality_gate: qcRow(doc, 'ready', summary, 'Gemini 3.1 Pro'),
      });
      return Response.json({ doc: updated, fills: [], verdict: 'ready', summary, gaps_remaining: [] });
    }

    // ── Gemini web-grounded fill ──────────────────────────────────────────
    const prompt = `You are a telecom site-acquisition QC analyst reviewing a cell-tower Site Candidate Information Package (SCIP) before it is printed and submitted to a carrier.

Using ONLY public web sources — municipal zoning codes (Municode/eCode360), FEMA NFHL, FCC Broadband Map, EIA electric utility data, hospital/EMS directories, ASCE 7-22 wind maps, state/local government sites — fill the MISSING fields listed below. Do NOT invent values. If a field cannot be verified from public sources, return value=null and confidence="unverified".

SITE CONTEXT (use only for lookup; do not echo back):
${JSON.stringify(ctx, null, 2)}

MISSING FIELDS TO FILL:
${JSON.stringify(blanks, null, 2)}

For EACH field return: block, field, value (concise string, or null), source_url (the exact public page you used, or null), confidence ("high" | "medium" | "low" | "unverified").
Then return an overall verdict:
  - "ready"               = all critical fields (zoning fees/timeframe/approval, emergency contacts, power utility, fiber) were filled.
  - "ready_with_conditions"= most filled, some non-critical fields unverifiable.
  - "needs_review"        = one or more CRITICAL fields could not be verified from public sources.
Plus a one-sentence summary and a gaps_remaining array listing the field names still null.`;

    const schema = {
      type: 'object',
      properties: {
        fills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              block: { type: 'string' },
              field: { type: 'string' },
              value: { type: ['string', 'null'] },
              source_url: { type: ['string', 'null'] },
              confidence: { type: 'string' },
            },
            required: ['block', 'field', 'value', 'confidence'],
          },
        },
        verdict: { type: 'string', enum: ['ready', 'ready_with_conditions', 'needs_review'] },
        summary: { type: 'string' },
        gaps_remaining: { type: 'array', items: { type: 'string' } },
      },
      required: ['fills', 'verdict', 'summary'],
    };

    const llm = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_1_pro',
      response_json_schema: schema,
    });
    const result = typeof llm === 'string' ? JSON.parse(llm) : llm;

    // ── Apply fills into NULL fields only ──────────────────────────────────
    const byBlock = {};   // "zoning.overview" -> { field: value }
    const applied = [];
    for (const f of result.fills || []) {
      if (!isBlank(getPath(doc, `${f.block}.${f.field}`))) continue; // never overwrite
      if (f.value == null || f.value === '') continue;               // unverified → skip
      byBlock[f.block] = byBlock[f.block] || {};
      byBlock[f.block][f.field] = f.value;
      applied.push({ ...f, source_url: f.source_url || null });
    }

    // Build a nested update payload: { zoning: {...doc.zoning, overview: merged}, infrastructure: {...} }
    const update = {};
    for (const [path, fillObj] of Object.entries(byBlock)) {
      const [a, b] = path.split('.');
      update[a] = update[a] || { ...(getPath(doc, a) || {}) };
      update[a][b] = { ...(getPath(doc, path) || {}), ...fillObj };
    }
    update.quality_gate = qcRow(doc, result.verdict, result.summary, 'Gemini 3.1 Pro');

    const updated = await base44.entities.ScipStudioDoc.update(doc.id, update);

    return Response.json({
      doc: updated,
      fills: applied,
      verdict: result.verdict,
      summary: result.summary,
      gaps_remaining: result.gaps_remaining || [],
      model: 'gemini_3_1_pro',
    });
  } catch (error) {
    console.error('scipStudioQcFill failed:', error?.message ?? error);
    return Response.json({ error: String(error?.message ?? error) }, { status: 500 });
  }
});