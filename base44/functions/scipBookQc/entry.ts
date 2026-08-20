import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { runScipQcAndRepair } from "../../shared/scipQcManifest.ts";

/**
 * Backward-compatible SCIP Book entry point.
 *
 * OpenRouter GPT-5.6 Sol is both the quality supervisor and evidence-backed
 * repair agent. Safe repairs are persisted, the entire deterministic audit is
 * rerun, and printing remains locked unless the final manifest is PASS.
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const scipId = body.scip_id || body.scip_record_id;
    if (!scipId) return Response.json({ error: "scip_id is required" }, { status: 400 });

    let record = null;
    for (let attempt = 0; attempt < 3 && !record; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 1500));
      record = await base44.entities.ScipRecord.get(scipId).catch(() => null);
    }
    if (!record) return Response.json({ error: "SCIP not found" }, { status: 404 });

    const result = await runScipQcAndRepair({
      base44,
      record,
      checkedBy: user.email || user.id || "authenticated-user",
      repairAllowed: body.repair_allowed !== false,
    });
    return Response.json({
      book_qc: result.book_qc,
      record: result.record,
      qc_manifest: result.manifest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SCIP QC failed";
    console.error("scipBookQc failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
