import { secrets } from "base44:runtime";

export const SITE_HAWK_SUPERVISOR_INSTRUCTION = "You are SiteHawk’s independent Quality Control Supervisor and AI Handyman. Verify that every requested task is complete, correct, reproducible, and directly supported by the supplied evidence. When a task fails, identify the earliest cause and the smallest safe correction. Populate corrected_result only when the correction is exactly supported by authoritative evidence or deterministic computation; never guess, invent, use a nearby jurisdiction, or treat another AI statement as evidence. A successful request or rendered artifact proves execution, not correctness. Missing, stale, conflicting, ambiguous, or inaccessible evidence blocks approval. Coordinates and spatial calculations must come from deterministic versioned tools using GeoJSON [longitude, latitude]. Never expose secrets or unnecessary PII. Flag legal, engineering, destructive, financial, privacy-sensitive, production, or irreversible actions for human approval. Never weaken a check to obtain approval.";

const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    approved: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    severity: { type: "string", enum: ["none", "low", "medium", "high", "critical"] },
    issues: { type: "array", items: { type: "string" } },
    required_corrections: { type: "array", items: { type: "string" } },
    corrected_result: { type: ["string", "null"] },
    requires_human_approval: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["approved", "confidence", "severity", "issues", "required_corrections", "corrected_result", "requires_human_approval", "reason"],
};

const failClosed = (reason: string) => ({
  approved: false,
  confidence: 0,
  severity: "critical",
  issues: [reason],
  required_corrections: ["Retry independent quality-control review before releasing this result."],
  corrected_result: null,
  requires_human_approval: false,
  reason,
});

function validDecision(value: any) {
  return value &&
    typeof value.approved === "boolean" &&
    typeof value.confidence === "number" && value.confidence >= 0 && value.confidence <= 1 &&
    ["none", "low", "medium", "high", "critical"].includes(value.severity) &&
    Array.isArray(value.issues) && value.issues.every((item: any) => typeof item === "string") &&
    Array.isArray(value.required_corrections) && value.required_corrections.every((item: any) => typeof item === "string") &&
    (typeof value.corrected_result === "string" || value.corrected_result === null) &&
    typeof value.requires_human_approval === "boolean" &&
    typeof value.reason === "string";
}

export async function reviewSiteHawkResult(input: any) {
  try {
    const apiKey = secrets.get("OPEN_ROUTER_API_KEY");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol-pro",
        provider: { zdr: true, data_collection: "deny" },
        messages: [
          { role: "system", content: SITE_HAWK_SUPERVISOR_INSTRUCTION },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "site_hawk_supervisor_decision", strict: true, schema: DECISION_SCHEMA },
        },
        max_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error("Site Hawk supervisor OpenRouter failure", response.status, errorBody?.error?.message || "Unknown error");
      return failClosed("Independent quality-control service failed; result withheld.");
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const decision = typeof content === "string" ? JSON.parse(content) : content;
    return validDecision(decision)
      ? decision
      : failClosed("Independent quality-control returned invalid output; result withheld.");
  } catch (error) {
    console.error("Site Hawk supervisor error", error instanceof Error ? error.message : "Unknown error");
    return failClosed("Independent quality-control could not be completed; result withheld.");
  }
}

export async function supervisedResponse(input: any, proposedResult: any) {
  const supervision = await reviewSiteHawkResult({ ...input, proposed_result: proposedResult });
  if (supervision.approved === true && supervision.requires_human_approval === false) {
    return Response.json({ ...proposedResult, _supervision: supervision });
  }
  return Response.json({
    supervisor_blocked: true,
    status: supervision.requires_human_approval ? "human_approval_required" : "correction_required",
    supervision,
  }, { status: supervision.requires_human_approval ? 409 : 422 });
}