import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { reviewSiteHawkResult } from "../../shared/siteHawkSupervisor.ts";

const REQUIRED_FIELDS = ["original_user_request", "proposed_action", "proposed_result", "supporting_evidence", "risk_level"];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const input = await req.json().catch(() => null);
    if (!input || typeof input !== "object") {
      return Response.json({ error: "A JSON request body is required" }, { status: 400 });
    }
    const missing = REQUIRED_FIELDS.filter((field) => input[field] === undefined || input[field] === null);
    if (missing.length) {
      return Response.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
    }
    if (typeof input.original_user_request !== "string" || typeof input.proposed_action !== "string" || typeof input.risk_level !== "string") {
      return Response.json({ error: "original_user_request, proposed_action, and risk_level must be strings" }, { status: 400 });
    }

    const decision = await reviewSiteHawkResult(input);
    const released = decision.approved === true && decision.requires_human_approval === false;
    return Response.json({
      released,
      status: released ? "approved" : decision.requires_human_approval ? "human_approval_required" : "correction_required",
      supervision: decision,
      result: released ? input.proposed_result : undefined,
    }, { status: released ? 200 : decision.requires_human_approval ? 409 : 422 });
  } catch (error) {
    console.error("siteHawkSupervisor error", error instanceof Error ? error.message : "Unknown error");
    return Response.json({
      released: false,
      status: "correction_required",
      supervision: {
        approved: false,
        confidence: 0,
        severity: "critical",
        issues: ["Supervisor execution failed."],
        required_corrections: ["Retry independent quality-control review."],
        corrected_result: null,
        requires_human_approval: false,
        reason: "Fail-closed policy withheld the proposed result.",
      },
    }, { status: 502 });
  }
}