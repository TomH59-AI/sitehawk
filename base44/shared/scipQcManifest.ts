import { secrets } from "base44:runtime";
import { auditScipRecord } from "./scipAudit.ts";
import { collectMissingScipFields, scipQcContext } from "./scipQcFields.ts";
import {
  SITEHAWK_QC_MODEL,
  SITEHAWK_QC_REPAIR_INSTRUCTION,
  SITEHAWK_QC_RULESET_VERSION,
} from "./siteHawkQcInstruction.ts";

type QcStatus = "PASS" | "REVIEW_REQUIRED" | "FAIL";
type RepairPolicy =
  | "SOURCE_COPY"
  | "DETERMINISTIC_DERIVATION"
  | "USER_REQUIRED"
  | "HUMAN_REVIEW"
  | "NOT_APPLICABLE";

const PLACEHOLDER_RE = /\b(tbd|unknown|not verified|requires (human|field) verification|needs_human_review|not available)\b/i;
const LEGAL_FIELD_RE = /^(zoning_|min_lot|ldc_ref|max_tower_height|stealth|collocations|res_separation|tower_separation|measured_from|fall_zone|landscaping|sp_|site_plan_|bp_)/;
const GOVERNMENT_FIELD_RE = /^(zoning_|min_lot|ldc_ref|max_tower_height|stealth|collocations|res_separation|tower_separation|measured_from|fall_zone|landscaping|sp_|site_plan_|bp_|water_mgmt_district|local_police|local_fire)/;
const OFFICIAL_CODIFIERS = [
  "municode.com",
  "ecode360.com",
  "amlegal.com",
  "codepublishing.com",
  "qcode.us",
  "codelibrary.amlegal.com",
];

const SOURCE_COPY_KEYS = new Set([
  "tower_type",
  "centerlines",
  "conforming_size",
  "wetland_concerns",
  "water_mgmt_district",
  "haz_waste",
  "power_provider",
  "fiber_available",
  "telco_provider",
  "nearest_airport",
  "local_police",
  "local_fire",
  "zoning_jurisdiction",
  "zoning_contact",
  "zoning_process",
  "zoning_fees",
  "zoning_timeframe",
  "min_lot",
  "ldc_ref",
  "max_tower_height",
  "stealth",
  "collocations",
  "res_separation",
  "tower_separation",
  "measured_from",
  "fall_zone",
  "landscaping",
  "sp_jurisdiction",
  "sp_contact",
  "sp_fees",
  "sp_timeframe",
  "sp_amend",
  "sp_concurrent",
  "sp_deadlines",
  "sp_format",
  "site_plan_notes",
  "bp_jurisdiction",
  "bp_contact",
  "bp_gc",
  "bp_fees",
  "bp_timeframe",
  "bp_bond",
  "bp_e911",
  "bp_expire",
]);

const DETERMINISTIC_KEYS = new Set([
  "ground_elevation",
  "dist_from_src",
  "parcel_city",
  "parcel_zip",
  "power_provider",
  "nearest_airport",
]);

const USER_REQUIRED_KEYS = new Set([
  "agent_name",
  "agent_phone",
  "agent_email",
  "submittal_date",
  "site_name",
  "ring_lat",
  "ring_lon",
  "search_radius",
  "sarf_height",
  "target_lat",
  "target_lon",
  "parcel_id",
  "owner_deed",
  "owner_names",
  "owner_contact_person",
  "owner_mailing",
  "owner_email",
  "owner_phone",
  "access_notes",
  "site_notes",
  "zoning_classification",
]);

const HUMAN_REVIEW_KEYS = new Set([
  "compound_size",
  "parcel_dims",
  "taxes_paid",
]);

const ZONING_KEY_MAP: Record<string, string> = {
  tower_type: "tower_type",
  centerlines: "centerline_availability",
  conforming_size: "conforming_minimum_lot",
  fiber_available: "fiber_available",
  telco_provider: "telco_provider",
  zoning_contact: "zoning_contact",
  zoning_process: "zoning_process",
  zoning_fees: "zoning_fee",
  zoning_timeframe: "zoning_approval_timeframe",
  min_lot: "minimum_lot",
  ldc_ref: "ldc_section_reference",
  max_tower_height: "maximum_tower_height",
  stealth: "stealth_requirement",
  collocations: "collocation_requirement",
  res_separation: "residential_separation",
  tower_separation: "tower_separation",
  measured_from: "measured_from",
  fall_zone: "fall_zone",
  landscaping: "landscaping_requirement",
  sp_jurisdiction: "site_plan_jurisdiction",
  sp_contact: "site_plan_contact",
  sp_fees: "site_plan_fee",
  sp_timeframe: "site_plan_timeframe",
  sp_amend: "site_plan_amendment",
  sp_concurrent: "site_plan_concurrent_review",
  sp_deadlines: "site_plan_deadline",
  sp_format: "site_plan_electronic_format",
  site_plan_notes: "site_plan_notes",
  bp_jurisdiction: "building_permit_jurisdiction",
  bp_contact: "building_department_contact",
  bp_gc: "building_permit_gc_submission",
  bp_fees: "building_permit_fee",
  bp_timeframe: "building_permit_timeframe",
  bp_bond: "building_permit_bond",
  bp_e911: "building_permit_e911",
  bp_expire: "building_permit_expiration",
};

const OPENROUTER_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["PASS", "REVIEW_REQUIRED", "FAIL"] },
    summary: { type: "string" },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          check_id: { type: "string" },
          status: { type: "string", enum: ["PASS", "REVIEW_REQUIRED", "FAIL"] },
          severity: { type: "string", enum: ["info", "warning", "critical"] },
          expected: { type: "string" },
          observed: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
        },
        required: ["check_id", "status", "severity", "expected", "observed", "evidence"],
      },
    },
    proposed_repairs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          repair_id: { type: "string" },
          field_key: { type: "string" },
          value: { type: "string" },
          policy: { type: "string", enum: ["SOURCE_COPY", "HUMAN_REVIEW"] },
          source_url: { type: ["string", "null"] },
          source_title: { type: ["string", "null"] },
          source_quote: { type: ["string", "null"] },
          source_type: {
            type: "string",
            enum: [
              "OFFICIAL_GOVERNMENT",
              "OFFICIAL_CODIFIER",
              "OFFICIAL_PROVIDER",
              "GOVERNMENT_DATASET",
              "RECORD_EVIDENCE",
              "NONE",
            ],
          },
          method: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
        },
        required: [
          "repair_id",
          "field_key",
          "value",
          "policy",
          "source_url",
          "source_title",
          "source_quote",
          "source_type",
          "method",
          "confidence",
          "reason",
        ],
      },
    },
    blockers: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    manual_review_reasons: { type: "array", items: { type: "string" } },
    required_actions: { type: "array", items: { type: "string" } },
  },
  required: [
    "status",
    "summary",
    "checks",
    "proposed_repairs",
    "blockers",
    "warnings",
    "manual_review_reasons",
    "required_actions",
  ],
};

function clean(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function meaningful(value: unknown) {
  const text = clean(value);
  return !!text && !PLACEHOLDER_RE.test(text) && !["none", "null", "undefined", "n/a"].includes(text.toLowerCase());
}

function policyFor(key: string): RepairPolicy {
  if (USER_REQUIRED_KEYS.has(key)) return "USER_REQUIRED";
  if (HUMAN_REVIEW_KEYS.has(key)) return "HUMAN_REVIEW";
  if (DETERMINISTIC_KEYS.has(key)) return "DETERMINISTIC_DERIVATION";
  if (SOURCE_COPY_KEYS.has(key)) return "SOURCE_COPY";
  return "HUMAN_REVIEW";
}

function target(record: any) {
  return record?.parcel_targets?.[Number(record?.active_target_index) || 0] || {};
}

function unwrapInvocation(value: any) {
  return value?.data ?? value ?? {};
}

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

async function hashValue(value: any) {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sourceSnapshot(record: any) {
  const selected = target(record);
  return {
    id: record?.id,
    updated_date: record?.updated_date,
    active_target_index: record?.active_target_index || 0,
    ring: [record?.longitude, record?.latitude],
    search_radius: record?.search_radius,
    sarf_height: record?.sarf_height,
    candidate: {
      apn: selected?.apn,
      coordinates: [selected?.longitude, selected?.latitude],
      zoning_classification: selected?.zoning_classification,
    },
    jurisdiction: record?.zoning_jurisdiction,
    zoning_report: record?.zoning_report,
    maps: {
      sarf: record?.map_image_url,
      hawk_maps: record?.hawk_maps,
      power_airport_maps: record?.power_airport_maps,
      rf_enrichment: record?.rf_enrichment,
      viewshed: record?.viewshed,
    },
    existing_conditions: record?.existing_conditions,
    section_target_index: record?.section_target_index,
  };
}

function safeModelContext(record: any) {
  const selected = target(record);
  return {
    ...scipQcContext(record),
    state: record?.state,
    county: record?.county || selected?.county,
    zoning_classification: selected?.zoning_classification || record?.hawk_maps?.zone_code,
    tower_height_ft: record?.sarf_height,
    tower_type: record?.tower_type,
    active_target_index: record?.active_target_index || 0,
    zoning_report: record?.zoning_report || {},
    existing_conditions: record?.existing_conditions || {},
    power_airport_maps: record?.power_airport_maps || {},
    prior_verified_repairs: record?.book_qc?.provider === "openrouter"
      ? (record?.book_qc?.repair_evidence || {})
      : {},
  };
}

function extractUrls(value: any, found = new Set<string>()) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/https:\/\/[^\s"'<>)\]]+/gi)) found.add(match[0].replace(/[.,;]+$/, ""));
  } else if (Array.isArray(value)) {
    for (const item of value) extractUrls(item, found);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) extractUrls(item, found);
  }
  return found;
}

function hostFor(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function officialGovernmentHost(host: string) {
  return host.endsWith(".gov") || host.endsWith(".us") || OFFICIAL_CODIFIERS.some((domain) => host === domain || host.endsWith("." + domain));
}

function isAllowedSource(repair: any, annotatedUrls: Set<string>, knownUrls: Set<string>) {
  const url = clean(repair?.source_url);
  if (!url.startsWith("https://")) return false;
  if (!annotatedUrls.has(url) && !knownUrls.has(url)) return false;
  const host = hostFor(url);
  if (!host) return false;
  if (GOVERNMENT_FIELD_RE.test(repair.field_key)) {
    return officialGovernmentHost(host) &&
      ["OFFICIAL_GOVERNMENT", "OFFICIAL_CODIFIER", "GOVERNMENT_DATASET", "RECORD_EVIDENCE"].includes(repair.source_type);
  }
  if (LEGAL_FIELD_RE.test(repair.field_key)) return officialGovernmentHost(host);
  return ["OFFICIAL_GOVERNMENT", "OFFICIAL_CODIFIER", "OFFICIAL_PROVIDER", "GOVERNMENT_DATASET", "RECORD_EVIDENCE"].includes(repair.source_type);
}

function quoteSupports(value: string, quote: string) {
  const normalizedQuote = quote.toLowerCase();
  const tokens = value.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length >= 4 || /^\d+$/.test(token)) || [];
  if (!tokens.length) return false;
  return tokens.some((token) => normalizedQuote.includes(token));
}

function formatStation(value: any) {
  if (!value?.name) return "";
  const details = [value.address, value.phone].filter(Boolean).join(" — ");
  return details ? value.name + " — " + details : value.name;
}

function parseAddress(address: unknown) {
  const text = clean(address);
  const result = { city: "", zip: "" };
  const zip = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zip) result.zip = zip[1];
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const cityIndex = parts.length >= 3 ? parts.length - 2 : 1;
    result.city = clean(parts[cityIndex]).replace(/\b[A-Z]{2}\b.*$/, "").trim();
  }
  return result;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 3958.7613;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

function deterministicRepair(
  qcRunId: string,
  fieldKey: string,
  targetPath: string,
  value: any,
  sourceUrl: string,
  sourceTitle: string,
  sourceQuote: string,
  method: string,
) {
  return {
    repair_id: qcRunId + ":" + fieldKey,
    field_key: fieldKey,
    target_path: targetPath,
    policy: "DETERMINISTIC_DERIVATION",
    status: "APPLIED",
    previous_value: null,
    applied_value: value,
    source_url: sourceUrl,
    source_title: sourceTitle,
    source_quote: sourceQuote,
    method,
    confidence: 1,
    reason: "Derived from validated SiteHawk inputs or a configured authoritative data service.",
    validated_at: new Date().toISOString(),
  };
}

async function runDeterministicRepairs(base44: any, record: any, qcRunId: string) {
  const missing = new Set(collectMissingScipFields(record).map((field: any) => field.key));
  const selected = target(record);
  const lat = Number(selected?.latitude);
  const lon = Number(selected?.longitude);
  const patch: any = {};
  const repairs: any[] = [];

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    if (missing.has("dist_from_src") && Number.isFinite(Number(record?.latitude)) && Number.isFinite(Number(record?.longitude))) {
      const distance = Number(haversineMiles(Number(record.latitude), Number(record.longitude), lat, lon).toFixed(2));
      const targets = [...(record.parcel_targets || [])];
      const index = Number(record.active_target_index) || 0;
      targets[index] = { ...targets[index], distance_from_center: distance };
      patch.parcel_targets = targets;
      repairs.push(deterministicRepair(
        qcRunId,
        "dist_from_src",
        "parcel_targets[" + index + "].distance_from_center",
        distance,
        "record://ScipRecord/" + record.id,
        "SiteHawk deterministic distance",
        "Haversine distance computed from the stored ring and active-target coordinates in miles.",
        "haversine_miles",
      ));
    }

    const parsed = parseAddress(selected?.parcel_address);
    if ((missing.has("parcel_city") && parsed.city) || (missing.has("parcel_zip") && parsed.zip)) {
      const targets = patch.parcel_targets || [...(record.parcel_targets || [])];
      const index = Number(record.active_target_index) || 0;
      targets[index] = {
        ...targets[index],
        ...(missing.has("parcel_city") && parsed.city ? { parcel_city: parsed.city } : {}),
        ...(missing.has("parcel_zip") && parsed.zip ? { parcel_zip: parsed.zip } : {}),
      };
      patch.parcel_targets = targets;
      if (missing.has("parcel_city") && parsed.city) repairs.push(deterministicRepair(
        qcRunId, "parcel_city", "parcel_targets[" + index + "].parcel_city", parsed.city,
        "record://ScipRecord/" + record.id, "Stored parcel address",
        "City parsed from the stored parcel address without changing its meaning.", "address_parse",
      ));
      if (missing.has("parcel_zip") && parsed.zip) repairs.push(deterministicRepair(
        qcRunId, "parcel_zip", "parcel_targets[" + index + "].parcel_zip", parsed.zip,
        "record://ScipRecord/" + record.id, "Stored parcel address",
        "ZIP code parsed from the stored parcel address without changing its meaning.", "address_parse",
      ));
    }

    const jobs: Array<Promise<any>> = [];
    const labels: string[] = [];
    if (missing.has("ground_elevation")) {
      labels.push("ground_elevation");
      jobs.push(base44.functions.invoke("pointElevation", { lat, lon }).catch(() => null));
    }
    if (missing.has("power_provider")) {
      labels.push("power_provider");
      jobs.push(base44.functions.invoke("electricUtilityLookup", { lat, lon }).catch(() => null));
    }
    if (missing.has("nearest_airport")) {
      labels.push("nearest_airport");
      jobs.push(base44.functions.invoke("nearestAirportFromDirectory", { lat, lon }).catch(() => null));
    }
    const results = await Promise.all(jobs);
    for (let i = 0; i < results.length; i++) {
      const kind = labels[i];
      const data = unwrapInvocation(results[i]);
      if (kind === "ground_elevation" && Number.isFinite(Number(data?.elevation_ft))) {
        patch.hawk_maps = { ...(record.hawk_maps || {}), center_amsl_ft: Number(data.elevation_ft) };
        repairs.push(deterministicRepair(
          qcRunId, kind, "hawk_maps.center_amsl_ft", Number(data.elevation_ft),
          "https://epqs.nationalmap.gov/v1/json", "USGS 3DEP Elevation Point Query Service",
          "Elevation returned in feet, NAVD88, for the stored active-target coordinates.", "USGS_EPQS",
        ));
      }
      if (kind === "power_provider" && data?.utility_name) {
        const value = data.utility_name + (data.telephone ? " — " + data.telephone : "");
        patch.power_airport_maps = {
          ...(patch.power_airport_maps || record.power_airport_maps || {}),
          power: { ...(record.power_airport_maps?.power || {}), company: value },
        };
        repairs.push(deterministicRepair(
          qcRunId, kind, "power_airport_maps.power.company", value,
          "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0",
          "HIFLD Electric Retail Service Territories",
          "Point-in-polygon service-territory lookup returned " + data.utility_name + ".", "HIFLD_POINT_IN_POLYGON",
        ));
      }
      const airport = data?.match;
      if (kind === "nearest_airport" && airport?.name) {
        const value = airport.name + (airport.distance_miles != null ? " — " + airport.distance_miles + " mi" : "");
        patch.power_airport_maps = {
          ...(patch.power_airport_maps || record.power_airport_maps || {}),
          airport: {
            ...(record.power_airport_maps?.airport || {}),
            name: value,
            distance_miles: airport.distance_miles,
          },
        };
        repairs.push(deterministicRepair(
          qcRunId, kind, "power_airport_maps.airport.name", value,
          "record://AirportDirectory", "SiteHawk Airport Directory",
          "Nearest eligible fixed-wing airport selected by bounding-box search and deterministic Haversine distance.", "AIRPORT_DIRECTORY_HAVERSINE",
        ));
      }
    }
  }

  if (Object.keys(patch).length) {
    const updated = await base44.entities.ScipRecord.update(record.id, patch);
    return { record: updated, repairs };
  }
  return { record, repairs };
}

function getAnnotationUrls(message: any) {
  const urls = new Set<string>();
  for (const annotation of message?.annotations || []) {
    const url = annotation?.url_citation?.url;
    if (typeof url === "string") urls.add(url);
  }
  return urls;
}

async function callOpenRouter(batch: any[], context: any) {
  const apiKey = secrets.get("OPEN_ROUTER_API_KEY");
  if (!apiKey) throw new Error("OPEN_ROUTER_API_KEY is not configured");
  const requested = batch.map((field: any) => ({
    key: field.key,
    label: field.label,
    section: field.section,
    policy: policyFor(field.key),
  }));
  const prompt = [
    "QC date: " + new Date().toISOString(),
    "Find exact evidence-backed values for the requested SCIP blanks. Use web search/fetch when current official evidence is not already in supplied SiteHawk context.",
    "For each requested key, either propose one supported repair or leave it unresolved. Do not return a repair for any other key.",
    "SITE CONTEXT (owner/client contact details intentionally omitted):",
    JSON.stringify(context),
    "REQUESTED FIELDS:",
    JSON.stringify(requested),
  ].join("\n\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://sitehawk.app",
      "X-OpenRouter-Title": "SiteHawk QC + Repair",
    },
    signal: AbortSignal.timeout(100000),
    body: JSON.stringify({
      model: SITEHAWK_QC_MODEL,
      provider: { zdr: true, data_collection: "deny" },
      messages: [
        { role: "system", content: SITEHAWK_QC_REPAIR_INSTRUCTION },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "openrouter:web_search",
          parameters: {
            max_results: 5,
            max_total_results: 12,
            search_context_size: "medium",
            excluded_domains: ["reddit.com", "facebook.com", "x.com", "youtube.com"],
          },
        },
        {
          type: "openrouter:web_fetch",
          parameters: { max_uses: 4, max_content_tokens: 50000 },
        },
      ],
      plugins: [{ id: "response-healing" }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sitehawk_qc_repair_result",
          strict: true,
          schema: OPENROUTER_RESULT_SCHEMA,
        },
      },
      temperature: 0,
      max_tokens: 5000,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error("OpenRouter QC failed with HTTP " + response.status + ": " + clean(body?.error?.message || "unknown error"));
  }
  const payload = await response.json();
  const message = payload?.choices?.[0]?.message;
  const raw = message?.content;
  const decision = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!decision || !Array.isArray(decision.proposed_repairs) || !Array.isArray(decision.checks)) {
    throw new Error("OpenRouter returned an invalid QC structure");
  }
  return { decision, annotationUrls: getAnnotationUrls(message) };
}

function validateModelRepairs(
  batch: any[],
  proposals: any[],
  annotationUrls: Set<string>,
  knownUrls: Set<string>,
  qcRunId: string,
) {
  const allowedKeys = new Set(batch.map((field: any) => field.key));
  const accepted: any[] = [];
  const rejected: any[] = [];
  for (const proposal of proposals || []) {
    const fieldKey = clean(proposal?.field_key);
    const value = clean(proposal?.value);
    const quote = clean(proposal?.source_quote);
    const reason = clean(proposal?.reason);
    const base = {
      repair_id: clean(proposal?.repair_id) || qcRunId + ":" + fieldKey,
      field_key: fieldKey,
      target_path: targetPathFor(fieldKey),
      policy: policyFor(fieldKey),
      previous_value: null,
      applied_value: value || null,
      source_url: clean(proposal?.source_url),
      source_title: clean(proposal?.source_title),
      source_quote: quote,
      method: clean(proposal?.method),
      confidence: Number(proposal?.confidence) || 0,
      reason,
      validated_at: new Date().toISOString(),
    };
    let rejection = "";
    if (!allowedKeys.has(fieldKey)) rejection = "The model proposed a field outside the requested allowlist.";
    else if (policyFor(fieldKey) !== "SOURCE_COPY") rejection = "The field is not classified for source-backed language-model autofill.";
    else if (!meaningful(value)) rejection = "The proposed value is blank or a placeholder.";
    else if (Number(proposal?.confidence) < 0.85) rejection = "Confidence is below the 0.85 autofill threshold.";
    else if (!quote || quote.length < 12) rejection = "No adequate supporting excerpt was supplied.";
    else if (!quoteSupports(value, quote)) rejection = "The supporting excerpt does not visibly support the proposed value.";
    else if (!isAllowedSource(proposal, annotationUrls, knownUrls)) rejection = "The source is not an allowed cited official source.";
    if (rejection) rejected.push({ ...base, status: "REJECTED", reason: rejection });
    else accepted.push({ ...base, status: "APPLIED" });
  }
  return { accepted, rejected };
}

function targetPathFor(fieldKey: string) {
  if (fieldKey === "zoning_jurisdiction") return "zoning_jurisdiction";
  const conditions: Record<string, string> = {
    wetland_concerns: "existing_conditions.wetland_concerns",
    water_mgmt_district: "existing_conditions.water_management_district",
    haz_waste: "existing_conditions.hazardous_waste",
    local_police: "existing_conditions.local_police",
    local_fire: "existing_conditions.local_fire",
  };
  if (conditions[fieldKey]) return conditions[fieldKey];
  if (fieldKey === "power_provider") return "power_airport_maps.power.company";
  if (fieldKey === "nearest_airport") return "power_airport_maps.airport.name";
  return "zoning_report." + (ZONING_KEY_MAP[fieldKey] || fieldKey);
}

async function applyModelRepairs(base44: any, record: any, repairs: any[], qcRunId: string) {
  if (!repairs.length) return record;
  const patch: any = {};
  let zoning = { ...(record.zoning_report || {}) };
  let conditions = { ...(record.existing_conditions || {}) };
  let powerAirport = { ...(record.power_airport_maps || {}) };
  for (const repair of repairs) {
    const key = repair.field_key;
    const value = repair.applied_value;
    if (key === "zoning_jurisdiction") patch.zoning_jurisdiction = value;
    else if (key === "wetland_concerns") conditions.wetland_concerns = value;
    else if (key === "water_mgmt_district") conditions.water_management_district = value;
    else if (key === "haz_waste") conditions.hazardous_waste = value;
    else if (key === "local_police") conditions.local_police = value;
    else if (key === "local_fire") conditions.local_fire = value;
    else if (key === "power_provider") {
      powerAirport.power = { ...(powerAirport.power || {}), company: value };
    } else if (key === "nearest_airport") {
      powerAirport.airport = { ...(powerAirport.airport || {}), name: value };
    } else {
      const zoningKey = ZONING_KEY_MAP[key] || key;
      zoning[zoningKey] = {
        value,
        source: repair.source_title,
        source_url: repair.source_url,
        citation: repair.source_quote,
        confidence: "source-verified",
        qc_run_id: qcRunId,
        verified_at: repair.validated_at,
      };
    }
  }
  patch.zoning_report = zoning;
  patch.existing_conditions = conditions;
  patch.power_airport_maps = powerAirport;
  return await base44.entities.ScipRecord.update(record.id, patch);
}

function zoningSourceCheck(record: any) {
  const report = record?.zoning_report || {};
  const valuedRows: Array<{ key: string; value: any; url: string; citation: string }> = [];
  for (const [key, raw] of Object.entries(report)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Object.prototype.hasOwnProperty.call(raw, "value")) continue;
    const row: any = raw;
    if (!meaningful(row.value)) continue;
    valuedRows.push({
      key,
      value: row.value,
      url: clean(row.source_url || row.url || row.official_url),
      citation: clean(row.citation || row.section || row.source_excerpt),
    });
  }
  const material = valuedRows.filter((row) => /(height|setback|separation|fall|stealth|collocation|approval|permit|fee|timeframe|ldc|zoning|tower)/i.test(row.key));
  const unsupported = material.filter((row) => {
    if (!row.url.startsWith("https://") || !officialGovernmentHost(hostFor(row.url))) return true;
    return !row.citation;
  });
  return {
    material_count: material.length,
    unsupported: unsupported.map((row) => row.key),
    pass: material.length > 0 && unsupported.length === 0,
  };
}

function finalStatus(audit: any, remaining: any[], zoningSources: any, modelFailed: boolean): QcStatus {
  if (modelFailed) return "FAIL";
  if (audit?.counts?.critical > 0) return "FAIL";
  if (!zoningSources.pass) return "FAIL";
  if (remaining.length > 0 || audit?.counts?.warning > 0) return "REVIEW_REQUIRED";
  return "PASS";
}

export async function runScipQcAndRepair({
  base44,
  record: startingRecord,
  checkedBy,
  repairAllowed = true,
}: {
  base44: any;
  record: any;
  checkedBy: string;
  repairAllowed?: boolean;
}) {
  const checkedAt = new Date().toISOString();
  const qcRunId = "qc_" + crypto.randomUUID();
  const mode = repairAllowed ? "REPAIR_ALLOWED" : "AUDIT_ONLY";
  const originalSourceHash = await hashValue(sourceSnapshot(startingRecord));
  let record = startingRecord;
  const allRepairs: any[] = [];
  const modelChecks: any[] = [];
  const modelWarnings: string[] = [];
  const modelBlockers: string[] = [];
  const modelManual: string[] = [];
  const modelActions: string[] = [];
  let modelFailed = false;

  if (repairAllowed) {
    try {
      const deterministic = await runDeterministicRepairs(base44, record, qcRunId);
      record = deterministic.record;
      allRepairs.push(...deterministic.repairs);
    } catch {
      modelWarnings.push("One or more deterministic autofill services failed; unresolved fields remain blocked.");
    }
  }

  const missingBeforeModel = collectMissingScipFields(record);
  const sourceCopyMissing = missingBeforeModel.filter((field: any) => policyFor(field.key) === "SOURCE_COPY");
  const knownUrls = extractUrls(safeModelContext(record));
  if (sourceCopyMissing.length) {
    if (!repairAllowed) {
      modelManual.push(sourceCopyMissing.length + " source-backed blank field(s) need repair.");
    } else {
      const batches: any[][] = [];
      for (let i = 0; i < sourceCopyMissing.length; i += 10) batches.push(sourceCopyMissing.slice(i, i + 10));
      const results = await Promise.allSettled(batches.map((batch) => callOpenRouter(batch, safeModelContext(record))));
      const accepted: any[] = [];
      for (let index = 0; index < results.length; index++) {
        const result = results[index];
        const batch = batches[index];
        if (result.status === "rejected") {
          modelFailed = true;
          modelBlockers.push("OpenRouter could not complete source research for " + batch.map((field) => field.label).join(", ") + ".");
          continue;
        }
        const decision = result.value.decision;
        modelChecks.push(...decision.checks);
        modelWarnings.push(...decision.warnings);
        modelBlockers.push(...decision.blockers);
        modelManual.push(...decision.manual_review_reasons);
        modelActions.push(...decision.required_actions);
        const validated = validateModelRepairs(
          batch,
          decision.proposed_repairs,
          result.value.annotationUrls,
          knownUrls,
          qcRunId,
        );
        accepted.push(...validated.accepted);
        allRepairs.push(...validated.accepted, ...validated.rejected);
      }
      if (accepted.length) {
        try {
          const current = await base44.entities.ScipRecord.get(record.id);
          const expectedHash = await hashValue(sourceSnapshot(record));
          const currentHash = await hashValue(sourceSnapshot(current));
          if (expectedHash !== currentHash) {
            for (const repair of accepted) repair.status = "REJECTED";
            modelBlockers.push("The SCIP changed during QC; model repairs were not applied. Run QC again on the current version.");
          } else {
            record = await applyModelRepairs(base44, current, accepted, qcRunId);
          }
        } catch {
          for (const repair of accepted) repair.status = "REJECTED";
          modelFailed = true;
          modelBlockers.push("Validated OpenRouter repairs could not be persisted.");
        }
      }
    }
  }

  const audit = auditScipRecord(record);
  const remaining = collectMissingScipFields(record);
  const zoningSources = zoningSourceCheck(record);
  const status = finalStatus(audit, remaining, zoningSources, modelFailed);
  const releaseAllowed = status === "PASS";
  const appliedRepairs = allRepairs.filter((repair) => repair.status === "APPLIED");
  const rejectedRepairs = allRepairs.filter((repair) => repair.status === "REJECTED");
  const manualReview = [
    ...new Set([
      ...modelManual,
      ...remaining.map((field: any) => field.section + ": " + field.label + " remains unresolved (" + policyFor(field.key) + ")."),
    ]),
  ];
  const blockers = [
    ...new Set([
      ...modelBlockers,
      ...audit.issues.filter((issue: any) => issue.severity === "critical").map((issue: any) => issue.section + ": " + issue.message),
      ...(!zoningSources.pass
        ? ["Authoritative section-level citations are missing for: " + (zoningSources.unsupported.join(", ") || "material zoning rules") + "."]
        : []),
    ]),
  ];
  const warnings = [
    ...new Set([
      ...modelWarnings,
      ...audit.issues.filter((issue: any) => issue.severity === "warning").map((issue: any) => issue.section + ": " + issue.message),
      ...rejectedRepairs.map((repair) => repair.field_key + ": proposed repair rejected — " + repair.reason),
    ]),
  ];
  const requiredActions = [
    ...new Set([
      ...modelActions,
      ...manualReview.map((item) => "Resolve and verify " + item),
      ...audit.issues.filter((issue: any) => issue.severity !== "info").map((issue: any) => issue.message),
    ]),
  ];
  const repairStatus = appliedRepairs.length
    ? (remaining.length ? "HUMAN_REQUIRED" : "AUTO_REPAIRED")
    : (remaining.length ? "HUMAN_REQUIRED" : rejectedRepairs.length ? "REPAIR_FAILED" : "NONE");
  const finalSourceHash = await hashValue(sourceSnapshot(record));
  const mapsHash = await hashValue({
    map_image_url: record?.map_image_url,
    hawk_maps: record?.hawk_maps,
    power_airport_maps: record?.power_airport_maps,
    rf_enrichment: record?.rf_enrichment,
    viewshed: record?.viewshed,
  });
  const checks = [
    {
      check_id: "deterministic_scip_audit",
      status: audit.counts.critical ? "FAIL" : audit.counts.warning ? "REVIEW_REQUIRED" : "PASS",
      severity: audit.counts.critical ? "critical" : audit.counts.warning ? "warning" : "info",
      expected: "No critical errors or unresolved delivery warnings.",
      observed: audit.counts.critical + " critical, " + audit.counts.warning + " warning, " + audit.counts.info + " informational.",
      evidence: audit.issues.map((issue: any) => issue.section + ": " + issue.message),
    },
    {
      check_id: "required_scip_fields",
      status: remaining.length ? "REVIEW_REQUIRED" : "PASS",
      severity: remaining.length ? "warning" : "info",
      expected: "Every required SCIP field has an authoritative or deterministic value.",
      observed: remaining.length + " unresolved field(s).",
      evidence: remaining.map((field: any) => field.section + ": " + field.label),
    },
    {
      check_id: "authoritative_zoning_sources",
      status: zoningSources.pass ? "PASS" : "FAIL",
      severity: zoningSources.pass ? "info" : "critical",
      expected: "Every material zoning rule has an applicable official URL and section citation.",
      observed: zoningSources.unsupported.length + " unsupported material rule(s).",
      evidence: zoningSources.unsupported,
    },
    ...modelChecks,
  ];
  const summary = status === "PASS"
    ? "OpenRouter QC and the deterministic SiteHawk gate passed. The exact audited SCIP version may be released."
    : appliedRepairs.length
      ? "OpenRouter repaired " + appliedRepairs.length + " evidence-backed item(s), then reran QC. Release remains blocked by unresolved checks."
      : "No release-authorizing QC pass was produced. Unresolved or failed checks remain.";

  const bookQc = {
    provider: "openrouter",
    model: SITEHAWK_QC_MODEL,
    qc_run_id: qcRunId,
    ruleset_version: SITEHAWK_QC_RULESET_VERSION,
    status,
    repair_status: repairStatus,
    release_allowed: releaseAllowed,
    print_ready: releaseAllowed,
    filled: Object.fromEntries(appliedRepairs.map((repair) => [repair.field_key, repair.applied_value])),
    repair_evidence: Object.fromEntries(appliedRepairs.map((repair) => [repair.field_key, {
      value: repair.applied_value,
      source_url: repair.source_url,
      source_title: repair.source_title,
      source_quote: repair.source_quote,
      method: repair.method,
      confidence: repair.confidence,
      qc_run_id: qcRunId,
      validated_at: repair.validated_at,
    }])),
    needs_human: manualReview.map((why) => ({ why })),
    summary,
    ran_at: checkedAt,
    ran_by: checkedBy,
    checked_field_count: collectMissingScipFields(startingRecord).length,
    repaired_field_count: appliedRepairs.length,
    remaining_blank_count: remaining.length,
    template_version: "NEWSCIP_7312026",
  };
  record = await base44.entities.ScipRecord.update(record.id, { book_qc: bookQc });

  const manifest = {
    scip_record_id: record.id,
    candidate_id: clean(target(record)?.apn || target(record)?.id || String(record.active_target_index || 0)),
    qc_run_id: qcRunId,
    mode,
    status,
    repair_status: repairStatus,
    release_allowed: releaseAllowed,
    summary,
    checked_at: checkedAt,
    checked_by: checkedBy,
    ruleset_version: SITEHAWK_QC_RULESET_VERSION,
    model: SITEHAWK_QC_MODEL,
    source_versions: {
      original_record_hash: originalSourceHash,
      final_record_hash: finalSourceHash,
      record_updated_date: record.updated_date,
      active_target_index: record.active_target_index || 0,
    },
    artifact_hashes: { maps: mapsHash },
    checks,
    repairs: allRepairs,
    blockers,
    warnings,
    manual_review_reasons: manualReview,
    required_actions: requiredActions,
  };
  await base44.entities.ScipQcRun.create(manifest);
  return { manifest, record, book_qc: bookQc };
}
