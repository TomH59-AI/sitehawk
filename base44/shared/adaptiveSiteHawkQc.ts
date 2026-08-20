import { secrets } from "base44:runtime";
import { SITEHAWK_APP_FINGERPRINT, SITEHAWK_TASK_MANIFEST } from "./siteHawkAppManifest.ts";

export const ADAPTIVE_QC_MODEL = "openai/gpt-5.6-sol-pro";
export const ADAPTIVE_QC_RULESET = "SITEHAWK_APP_QC_1.0.0";

const CRITICAL_FAMILIES = new Set(["auth_admin", "legal", "zoning", "talonfit"]);
const HIGH_RISK_FAMILIES = new Set(["parcel", "permits", "scip"]);
const PROTECTED_RE = /(secret|token|password|authorization|cookie|api[_-]?key|service[_-]?role|latitude|longitude|coordinate|geometry|zoning|ordinance|setback|fall[_-]?zone|height|permit|fee|price|payment|bank|legal|engineering|owner|email|phone|address)/i;
const PLACEHOLDER_RE = /^(tbd|todo|unknown|n\/?a|not available|needs[_ ]human[_ ]review|requires verification)$/i;
const SAFE_PATH_RE = /^(?:[a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9_-]+)*$/;

export type AppQcStatus = "PASS" | "REVIEW_REQUIRED" | "FAIL";

export const DEFAULT_POLICIES = Object.fromEntries(
  Object.keys(SITEHAWK_TASK_MANIFEST.families).map((family) => [family, {
    task_family: family,
    version: 1,
    status: "VALIDATED",
    risk_level: CRITICAL_FAMILIES.has(family) ? "critical" : HIGH_RISK_FAMILIES.has(family) ? "high" : family === "general" ? "low" : "medium",
    ai_review_mode: CRITICAL_FAMILIES.has(family) ? "ALWAYS" : "ON_CHANGE",
    auto_retry_idempotent: !CRITICAL_FAMILIES.has(family),
    max_retries: 1,
    required_output_paths: [],
    protected_fact_patterns: [PROTECTED_RE.source],
    repairable_paths: ["*"],
    policy_notes: "Validate completion, errors, placeholders, evidence, and safe provenance-backed blank repair. Never relax protected facts.",
    validated_source_hash: (SITEHAWK_TASK_MANIFEST.families as any)[family].hash,
  }]),
);

export function currentManifestSummary() {
  return {
    ruleset: ADAPTIVE_QC_RULESET,
    fingerprint: SITEHAWK_APP_FINGERPRINT,
    families: Object.fromEntries(Object.entries(SITEHAWK_TASK_MANIFEST.families).map(([family, value]: any) => [family, {
      hash: value.hash,
      files: value.files.map((file: any) => ({ path: file.path, hash: file.hash })),
    }])),
  };
}

export function familyForTask(taskKey: string) {
  const needle = `/functions/${String(taskKey || "").toLowerCase()}/`;
  for (const [family, value] of Object.entries(SITEHAWK_TASK_MANIFEST.families) as any) {
    if (value.files.some((file: any) => file.path.toLowerCase().includes(needle))) return family;
  }
  const key = String(taskKey || "").toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["auth_admin", /auth|login|user|billing|stripe|checkout|admin|delete/],
    ["legal", /law|legal|redline|lease/],
    ["outreach", /mail|campaign|email|invite|notify|skip|ownercontact/],
    ["crm", /crm|hubspot|tracker|followup/],
    ["permits", /permit|form|hawkdoc/],
    ["scip", /scip/],
    ["talonfit", /talonfit|towersiter|solver|frontage/],
    ["zoning", /zoning|ordinance|codehawk|municode|landuse/],
    ["parcel", /parcel|realie|regrid|property|target/],
    ["rf", /cloudrf|propagation|spectrum|coverage|fcc|tower|airport|airspace/],
    ["infrastructure", /fiber|electric|power|utility|hifld/],
    ["environment", /fema|wetland|haz|historic|tribal|species|elevation|wind/],
    ["maps", /map|satellite|tiles|viewshed|render|vision/],
  ];
  return rules.find(([, regex]) => regex.test(key))?.[0] || "general";
}

export function sourceHashForFamily(family: string) {
  return (SITEHAWK_TASK_MANIFEST.families as any)[family]?.hash || SITEHAWK_APP_FINGERPRINT.slice(0, 24);
}

function sorted(value: any): any {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  return value;
}

export async function valueHash(value: any) {
  const bytes = new TextEncoder().encode(JSON.stringify(sorted(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const NEVER_DISCLOSE_KEY_RE = /(secret|token|password|authorization|cookie|api[_-]?key|service[_-]?role|email|phone|owner|contact|mailing|address|client|customer|user|payment|card|bank|account|latitude|longitude|coordinate|geometry|parcel[_-]?id|apn)/i;
const PUBLIC_EVIDENCE_KEY_RE = /(jurisdiction|county|state|zoning|ordinance|citation|source|official|url|code|section|requirement|rule|district|permit|setback|fall[_-]?zone|tower[_-]?height|max[_-]?height|distance|elevation|wind|flood|wetland|acreage|area|radius|status|confidence|version|date)/i;

function structureOf(value: any, depth = 0): any {
  if (depth > 6) return "depth_limit";
  if (Array.isArray(value)) return { type: "array", length: value.length, sample_structure: value.length ? structureOf(value[0], depth + 1) : null };
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 120).map(([key, item]) => [key, structureOf(item, depth + 1)]));
  if (value === null || value === undefined) return "blank";
  if (typeof value === "string") return value.trim() ? "string_present" : "blank";
  return `${typeof value}_present`;
}

function publicEvidence(value: any, key = "", depth = 0): any {
  if (depth > 6) return undefined;
  if (NEVER_DISCLOSE_KEY_RE.test(key)) return value === null || value === undefined || value === "" ? null : "[PRIVATE_VALUE_PRESENT]";
  if (Array.isArray(value)) {
    const items = value.slice(0, 30).map((item) => publicEvidence(item, key, depth + 1)).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [childKey, item] of Object.entries(value).slice(0, 120)) {
      const disclosed = publicEvidence(item, childKey, depth + 1);
      if (disclosed !== undefined) out[childKey] = disclosed;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (!PUBLIC_EVIDENCE_KEY_RE.test(key)) return undefined;
  if (typeof value === "string") {
    let disclosed = value;
    if (/(url|source|official)/i.test(key)) {
      try {
        const parsed = new URL(value);
        disclosed = `${parsed.origin}${parsed.pathname}`;
      } catch {
        disclosed = "[PUBLIC_REFERENCE_PRESENT]";
      }
    }
    if (/(bearer\s+|api[_-]?key|token|password|secret|authorization|cookie)/i.test(disclosed)) return "[REDACTED]";
    return disclosed.length > 800 ? `${disclosed.slice(0, 800)}…[TRUNCATED]` : disclosed;
  }
  return value;
}

function openRouterContext(context: any) {
  return {
    privacy_mode: "HYBRID_PUBLIC_EVIDENCE",
    task_key: context.task_key,
    task_family: context.task_family,
    attempt: context.attempt,
    idempotent: context.idempotent,
    policy: {
      version: context.policy?.version,
      risk_level: context.policy?.risk_level,
      ai_review_mode: context.policy?.ai_review_mode,
      required_output_paths: context.policy?.required_output_paths || [],
      repairable_paths: context.policy?.repairable_paths || [],
      policy_notes_present: Boolean(context.policy?.policy_notes),
    },
    change_state: {
      status: context.change_state?.status,
      current_source_hash: context.change_state?.current_source_hash,
      validated_source_hash: context.change_state?.validated_source_hash,
    },
    input_structure: structureOf(context.input),
    output_structure: structureOf(context.output),
    public_input_evidence: publicEvidence(context.input),
    public_output_evidence: publicEvidence(context.output),
    failure: context.error ? {
      name: context.error.name || "Error",
      http_status: context.error.status || null,
      code: context.error.code || null,
      message_disclosed: false,
    } : null,
  };
}

function getPath(value: any, path: string) {
  if (!SAFE_PATH_RE.test(path)) return undefined;
  return path.split(".").reduce((current, key) => current == null ? undefined : current[key], value);
}

function setPath(value: any, path: string, next: any) {
  if (!SAFE_PATH_RE.test(path)) return false;
  const parts = path.split(".");
  let current = value;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) current[key] = {};
    current = current[key];
  }
  current[parts.at(-1)!] = next;
  return true;
}

function isBlank(value: any) {
  return value === null || value === undefined || (typeof value === "string" && (!value.trim() || PLACEHOLDER_RE.test(value.trim())));
}

function scanPlaceholders(value: any, prefix = "", found: string[] = [], depth = 0) {
  if (depth > 7 || found.length >= 30) return found;
  if (Array.isArray(value)) value.slice(0, 50).forEach((item, index) => scanPlaceholders(item, `${prefix}.${index}`, found, depth + 1));
  else if (value && typeof value === "object") Object.entries(value).slice(0, 100).forEach(([key, item]) => scanPlaceholders(item, prefix ? `${prefix}.${key}` : key, found, depth + 1));
  else if (typeof value === "string" && PLACEHOLDER_RE.test(value.trim())) found.push(prefix || "result");
  return found;
}

const AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["PASS", "REVIEW_REQUIRED", "FAIL"] },
    task_complete: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    retry_same_input: { type: "boolean" },
    repair_proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          output_path: { type: "string" },
          input_path: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["output_path", "input_path", "reason", "confidence"],
      },
    },
  },
  required: ["status", "task_complete", "issues", "summary", "retry_same_input", "repair_proposals"],
};

async function aiReview(context: any) {
  const apiKey = secrets.get("OPEN_ROUTER_API_KEY");
  if (!apiKey) throw new Error("OPEN_ROUTER_API_KEY is not configured");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ADAPTIVE_QC_MODEL,
      provider: { zdr: true, data_collection: "deny" },
      messages: [
        { role: "system", content: "You are SiteHawk app-wide Quality Control and AI Handyman. Decide whether the supplied task result fully answers its input and policy. A successful call proves execution, not correctness. Never invent facts. Repair proposals may ONLY copy an exact existing value from input_path into a blank output_path. Never propose copying or changing coordinates, geometry, zoning, ordinance, permitting, legal, engineering, financial, secret, owner, contact, or PII fields. Retry the same input only for a transient, idempotent failure. Missing, conflicting, ambiguous, stale, or unsupported high-risk facts require REVIEW_REQUIRED. Return strict JSON only." },
        { role: "user", content: JSON.stringify(openRouterContext(context)) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "sitehawk_adaptive_task_qc", strict: true, schema: AI_SCHEMA } },
      plugins: [{ id: "response-healing" }],
      max_tokens: 1400,
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter QC failed (${response.status})`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = typeof content === "string" ? JSON.parse(content) : content;
  if (!parsed || !["PASS", "REVIEW_REQUIRED", "FAIL"].includes(parsed.status) || !Array.isArray(parsed.issues) || !Array.isArray(parsed.repair_proposals)) {
    throw new Error("OpenRouter QC returned invalid output");
  }
  return parsed;
}

export async function evaluateAdaptiveTask({ taskKey, family, policy, changeState, input, output, error, attempt = 1, idempotent = false }: any) {
  const issues: string[] = [];
  if (error) issues.push(`Task failed (${String(error.name || "Error")}${error.status ? `, HTTP ${Number(error.status)}` : ""}${error.code ? `, code ${String(error.code).replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40)}` : ""}).`);
  if (output === undefined || output === null) issues.push("Task returned no result.");
  if (output && typeof output === "object" && typeof output.error === "string" && output.error.trim()) issues.push("Result contains a reported error; raw error text was not persisted.");
  const placeholders = scanPlaceholders(output);
  if (placeholders.length) issues.push(`Unresolved placeholders: ${placeholders.slice(0, 12).join(", ")}`);
  for (const path of policy.required_output_paths || []) {
    if (isBlank(getPath(output, path))) issues.push(`Required output is missing: ${path}`);
  }

  const changed = changeState?.current_source_hash !== changeState?.validated_source_hash;
  const needsAi = policy.ai_review_mode === "ALWAYS" || changed || issues.length > 0;
  let decision: any = {
    status: issues.length ? (error ? "FAIL" : "REVIEW_REQUIRED") : "PASS",
    task_complete: issues.length === 0,
    issues,
    summary: issues.length ? "Deterministic QC found unresolved issues." : "Deterministic task checks passed.",
    retry_same_input: Boolean(error && idempotent && policy.auto_retry_idempotent && attempt <= Number(policy.max_retries || 1)),
    repair_proposals: [],
  };
  if (needsAi) {
    decision = await aiReview({ task_key: taskKey, task_family: family, policy, change_state: changeState, attempt, idempotent, input, output, error });
    decision.issues = [...new Set([...issues, ...decision.issues])];
    if (issues.length && decision.status === "PASS") decision.status = error ? "FAIL" : "REVIEW_REQUIRED";
  }

  const repaired = output && typeof output === "object" ? structuredClone(output) : output;
  const repairs: any[] = [];
  for (const proposal of decision.repair_proposals || []) {
    const outputPath = String(proposal.output_path || "");
    const inputPath = String(proposal.input_path || "");
    if (Number(proposal.confidence) < 0.9 || !SAFE_PATH_RE.test(outputPath) || !SAFE_PATH_RE.test(inputPath)) continue;
    if (PROTECTED_RE.test(outputPath) || PROTECTED_RE.test(inputPath)) continue;
    if (!(policy.repairable_paths || []).includes("*") && !(policy.repairable_paths || []).includes(outputPath)) continue;
    const sourceValue = getPath(input, inputPath);
    if (isBlank(sourceValue) || !isBlank(getPath(repaired, outputPath))) continue;
    if (setPath(repaired, outputPath, structuredClone(sourceValue))) repairs.push({ output_path: outputPath, input_path: inputPath, method: "EXACT_INPUT_COPY", confidence: proposal.confidence, reason: proposal.reason });
  }
  const protectedIssue = decision.issues.some((issue: string) => PROTECTED_RE.test(issue));
  if (protectedIssue && decision.status === "PASS") decision.status = "REVIEW_REQUIRED";
  if (changeState?.status === "ADMIN_REVIEW" || changeState?.status === "BLOCKED") decision.status = decision.status === "FAIL" ? "FAIL" : "REVIEW_REQUIRED";
  const released = decision.status === "PASS";
  return {
    status: decision.status as AppQcStatus,
    released,
    issues: decision.issues,
    summary: decision.summary,
    retry_same_input: Boolean(decision.retry_same_input && idempotent && policy.auto_retry_idempotent),
    repaired_result: repairs.length ? repaired : output,
    repairs,
    repair_status: repairs.length ? "AUTO_REPAIRED" : decision.status === "PASS" ? "NONE" : "HUMAN_REQUIRED",
  };
}

export { CRITICAL_FAMILIES };
