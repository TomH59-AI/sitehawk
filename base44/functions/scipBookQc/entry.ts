import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * scipBookQc — Gemini quality-control pass for the SCIP Book.
 *
 * The frontend sends the list of blank template fields. Gemini (with live web
 * grounding) fills ONLY values it can verify from public sources — jurisdiction
 * contacts, fees, processes, providers, districts. Anything it cannot verify is
 * returned as needs_human, never guessed. Results persist on record.book_qc so
 * filled values appear in the viewer and the printed package.
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { scip_id, missing, context } = await req.json().catch(() => ({}));
    if (!scip_id) return Response.json({ error: "scip_id required" }, { status: 400 });
    const record = await base44.entities.ScipRecord.get(scip_id);
    if (!record) return Response.json({ error: "SCIP not found" }, { status: 404 });

    const fields = Array.isArray(missing) ? missing.slice(0, 60) : [];
    if (!fields.length) {
      return Response.json({ book_qc: record.book_qc || null, record, message: "No blank fields" });
    }

    const ctx = context || {};
    const prompt = `You are the final quality-control reviewer for a cell tower SITE CANDIDATE INFORMATION PACKAGE (SCIP) about to be delivered to a client. The package must be as complete as possible.

SITE CONTEXT:
- Site name: ${ctx.site_name || "unknown"}
- Coordinates: ${ctx.latitude}, ${ctx.longitude}
- Address: ${ctx.address || "unknown"}
- County/State: ${ctx.county || "unknown"}, ${ctx.state || "unknown"}
- Zoning jurisdiction: ${ctx.jurisdiction || "unknown"}

The following SCIP fields are BLANK. For each, research public sources (official county/municipal websites, government directories, utility service maps) and provide a value ONLY if you can verify it. Typical verifiable fields: zoning/building department contact info, permit processes, fees, approval timeframes, water management district, power/telco providers serving the area, local police and fire departments (non-emergency), nearest airport.

STRICT RULES:
1. NEVER guess, estimate, or fabricate. If you cannot verify a value from a real source, put the field in needs_human with a one-line reason.
2. Parcel-specific facts you cannot look up (owner contact person, taxes paid, centerlines, compound size, site notes) always go to needs_human.
3. Keep each filled value concise (one line, include phone numbers where relevant).
4. The printable SCIP may not contain blank responses. If a value cannot be verified, include it in needs_human AND provide a concise non-factual completion in filled using this exact pattern: "Requires human verification — <reason>". This is a disclosure, not a guessed answer.

BLANK FIELDS (key | label | section):
${fields.map((f: any) => `- ${f.key} | ${f.label} | ${f.section || ""}`).join("\n")}

Return JSON. Every verified value MUST appear as an item in the "filled" array as {"key": "<field key>", "value": "<verified value>"}, e.g. {"key": "water_mgmt_district", "value": "St. Johns River Water Management District"}. A field you claim to have verified but do not include in "filled" is a failure. Every field NOT in "filled" must appear in "needs_human" with a one-line reason. "summary" is 1-2 sentences on package readiness.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: "gemini_3_1_pro",
      response_json_schema: {
        type: "object",
        properties: {
          filled: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                value: { type: "string" },
              },
              required: ["key", "value"],
            },
          },
          needs_human: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                why: { type: "string" },
              },
            },
          },
          summary: { type: "string" },
        },
        required: ["filled", "needs_human", "summary"],
      },
    });

    // Only accept fills for keys that were actually requested; merge over prior runs.
    const askedKeys = new Set(fields.map((f: any) => f.key));
    const cleanFilled: Record<string, string> = { ...(record.book_qc?.filled || {}) };
    const filledList = Array.isArray(result?.filled) ? result.filled : [];
    for (const item of filledList) {
      const k = item?.key, v = item?.value;
      if (k && askedKeys.has(k) && v != null && String(v).trim() !== "") cleanFilled[k] = String(v);
    }
    // The uploaded template cannot print with empty response cells. Gemini must
    // either verify an answer or explicitly disclose why human verification is required.
    const needsHuman = Array.isArray(result?.needs_human) ? result.needs_human : [];
    for (const field of fields) {
      if (cleanFilled[field.key]) continue;
      const issue = needsHuman.find((item: any) => item?.key === field.key);
      cleanFilled[field.key] = `Requires human verification — ${issue?.why || "no authoritative public source was found"}`;
    }

    const book_qc = {
      filled: cleanFilled,
      needs_human: needsHuman,
      summary: result?.summary || "",
      ran_at: new Date().toISOString(),
      ran_by: user.email,
    };

    const updated = await base44.entities.ScipRecord.update(scip_id, { book_qc });
    return Response.json({ book_qc, record: updated });
  } catch (error) {
    console.error("scipBookQc error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}