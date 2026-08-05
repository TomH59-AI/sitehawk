import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

function normalizeJurisdiction(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\bCITY OF\b/g, "")
    .replace(/\bTOWN OF\b/g, "")
    .replace(/\bVILLAGE OF\b/g, "")
    .replace(/\bCOUNTY\b/g, "")
    .replace(/\bPARISH\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const bool = (v) => {
  if (v == null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return s === "true" || s === "yes" || s === "1";
};
const str = (v) => (v == null || v === "" ? undefined : String(v).trim());

const SCHEMA = {
  type: "object",
  properties: {
    height_limit_ft: { type: "number" },
    setback_ft: { type: "number" },
    fall_zone_ft: { type: "number" },
    residential_separation_ft: { type: "number" },
    tower_separation_ft: { type: "number" },
    permit_type: { type: "string" },
    setback_rule: { type: "string" },
    pe_fall_zone_allowed: { type: "boolean" },
    stealth_required: { type: "boolean" },
    collocation_required: { type: "boolean" },
    section_ref: { type: "string" },
    source_url: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    approval_timeframe: { type: "string" },
    zoning_fees: { type: "string" },
    verification_notes: { type: "string" },
  },
};

// Primary path — Gemini searches the web and reads the Municode/eCode360 page
// itself, so JS-heavy code portals no longer break the scrape.
async function extractViaWebSearch(base44, jurisdiction, state) {
  const prompt = `Search the web for the wireless telecommunications tower and antenna regulations in the municipal code for ${jurisdiction}, ${state}. Look on municode.com, ecode360.com, library.amlegal.com, or the official government website.

Extract these rules ONLY from what you find in the actual code text:
- height_limit_ft: Maximum tower height in feet (only if explicitly stated)
- setback_ft: Minimum setback from property line in feet
- fall_zone_ft: Required fall-zone radius in feet
- residential_separation_ft: Required separation from residential structures in feet
- tower_separation_ft: Required separation from other towers in feet
- permit_type: Permit/approval path — specify CUP, SUP, admin review, permitted use, etc.
- setback_rule: Setback rule if formula-based
- pe_fall_zone_allowed: Can a PE letter reduce fall zone/setback?
- stealth_required: Is stealth/concealment required?
- collocation_required: Is collocation required before new tower?
- section_ref: Code section reference (e.g. "Sec. 62-2109")
- source_url: The URL where you found the ordinance
- approval_timeframe: Estimated approval timeframe if stated
- zoning_fees: Application fees if stated
- confidence: high/medium/low based on how clearly the rules were stated

STRICT RULES: NEVER fabricate. Only return values explicitly stated in the code. Leave fields null/empty if not found. Always include source_url where you found the info.`;

  return await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: "gemini_3_flash",
    prompt,
    response_json_schema: SCHEMA,
    add_context_from_internet: true,
  });
}

async function oxylabsScrape(url, oxyUser, oxyPass) {
  const auth = `Basic ${btoa(`${oxyUser}:${oxyPass}`)}`;
  const r = await fetch("https://realtime.oxylabs.io/v1/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({
      source: "universal",
      url,
      render: "html",
      geo_location: "United States",
      user_agent_type: "desktop",
      timeout: 60000,
    }),
  });
  if (!r.ok) {
    console.warn(`[vacuum] OxyLabs HTTP ${r.status} for ${url}`);
    return "";
  }
  const data = await r.json();
  return data?.results?.[0]?.content || "";
}

function cleanHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Fallback path — only used when the web-search pass came back low confidence.
async function extractViaScrape(base44, jurisdiction, state, url, oxyUser, oxyPass) {
  const rawHtml = await oxylabsScrape(url, oxyUser, oxyPass);
  const text = cleanHtml(rawHtml);
  if (text.length < 200) return null;
  return await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: "gemini_3_flash",
    prompt: `Extract wireless telecom tower rules for ${jurisdiction}, ${state} from this ordinance text. NEVER fabricate. Only return explicitly stated values. Source: ${url}\n\nTEXT:\n${text.slice(0, 120000)}`,
    response_json_schema: SCHEMA,
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

    const { batch_size = 10, state_filter, dry_run = false } = await req.json().catch(() => ({}));
    const batchSize = Math.min(Number(batch_size) || 10, 25);
    const oxyUser = secrets.get("OXYLABS_USERNAME");
    const oxyPass = secrets.get("OXYLABS_PASSWORD");

    // Existing TelecomOrdinance keys — dedupe on state + normalized jurisdiction
    const existingKeys = new Set();
    let skipOrd = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.TelecomOrdinance.list(null, 500, skipOrd);
      for (const r of batch || []) existingKeys.add(`${r.state}|${normalizeJurisdiction(r.jurisdiction)}`);
      if (!batch || batch.length < 500) break;
      skipOrd += 500;
    }

    // Gaps in JurisdictionRegistry (skip cbsa/state rollups — not governing bodies)
    const gaps = [];
    let skipReg = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.JurisdictionRegistry.list(null, 500, skipReg);
      const filtered = state_filter
        ? (batch || []).filter((r) => String(r.state).toUpperCase() === String(state_filter).toUpperCase())
        : batch || [];
      for (const r of filtered) {
        if (!r.name || !r.state) continue;
        if (r.jurisdiction_type === "cbsa" || r.jurisdiction_type === "state") continue;
        const key = `${r.state}|${normalizeJurisdiction(r.name)}`;
        if (!existingKeys.has(key)) gaps.push({ name: r.name, state: r.state });
      }
      if (!batch || batch.length < 500) break;
      skipReg += 500;
    }

    const toProcess = gaps.slice(0, batchSize);
    const results = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const gap of toProcess) {
      const result = { jurisdiction: gap.name, state: gap.state, action: "pending" };
      try {
        let extracted = await extractViaWebSearch(base44, gap.name, gap.state);
        let method = "gemini_web_search";
        result.source_url = extracted?.source_url || null;
        result.confidence = extracted?.confidence || "low";

        if (extracted?.source_url && extracted?.confidence === "low" && oxyUser && oxyPass) {
          const scrapeResult = await extractViaScrape(base44, gap.name, gap.state, extracted.source_url, oxyUser, oxyPass);
          if (scrapeResult) {
            extracted = scrapeResult;
            method = "oxylabs_scrape";
          }
        }

        if (dry_run) {
          result.action = "dry_run";
          result.method = method;
          result.confidence = extracted?.confidence || "low";
          skipped++;
          results.push(result);
          continue;
        }

        const hasData =
          extracted &&
          (extracted.height_limit_ft ||
            extracted.permit_type ||
            extracted.section_ref ||
            extracted.setback_ft ||
            extracted.fall_zone_ft ||
            extracted.stealth_required != null ||
            extracted.collocation_required != null);
        if (!hasData) {
          result.action = "no_data_extracted";
          result.method = method;
          failed++;
          results.push(result);
          continue;
        }

        const record = {
          jurisdiction: gap.name,
          jurisdiction_normalized: normalizeJurisdiction(gap.name),
          state: String(gap.state).toUpperCase(),
        };
        if (str(extracted?.source_url)) record.source_url = str(extracted.source_url);
        if (num(extracted?.height_limit_ft) != null) record.height_limit_ft = num(extracted.height_limit_ft);
        if (num(extracted?.setback_ft) != null) record.setback_ft = num(extracted.setback_ft);
        if (num(extracted?.fall_zone_ft) != null) record.fall_zone_ft = num(extracted.fall_zone_ft);
        if (num(extracted?.residential_separation_ft) != null) record.residential_separation_ft = num(extracted.residential_separation_ft);
        if (num(extracted?.tower_separation_ft) != null) record.tower_separation_ft = num(extracted.tower_separation_ft);
        if (str(extracted?.permit_type)) record.permit_type = str(extracted.permit_type);
        if (str(extracted?.setback_rule)) record.setback_rule = str(extracted.setback_rule);
        if (str(extracted?.section_ref)) record.section_ref = str(extracted.section_ref);
        if (bool(extracted?.pe_fall_zone_allowed) != null) record.pe_fall_zone_allowed = bool(extracted.pe_fall_zone_allowed);
        if (bool(extracted?.stealth_required) != null) record.stealth_required = bool(extracted.stealth_required);
        if (bool(extracted?.collocation_required) != null) record.collocation_required = bool(extracted.collocation_required);

        const normKey = `${gap.state}|${normalizeJurisdiction(gap.name)}`;
        if (existingKeys.has(normKey)) {
          result.action = "duplicate_skipped";
          skipped++;
          results.push(result);
          continue;
        }

        await base44.asServiceRole.entities.TelecomOrdinance.create(record);
        existingKeys.add(normKey);
        result.action = "created";
        result.method = method;
        result.confidence = extracted?.confidence || "medium";
        result.fields_filled = Object.keys(record).length - 3;
        result.section_ref = record.section_ref || null;
        result.permit_type = record.permit_type || null;
        result.height_limit = record.height_limit_ft || null;
        created++;
      } catch (e) {
        result.action = "error";
        result.error = e.message?.slice(0, 200);
        failed++;
      }
      results.push(result);
    }

    return Response.json({
      ok: true,
      gaps_found: gaps.length,
      processed: toProcess.length,
      created,
      skipped_existing: skipped,
      failed,
      dry_run,
      results,
      next_batch_size: Math.min(batchSize, gaps.length - toProcess.length),
    });
  } catch (error) {
    console.error("[vacuum] error:", error?.message);
    return Response.json({ error: error?.message }, { status: 500 });
  }
}