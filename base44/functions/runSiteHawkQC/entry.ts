import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { runScipQcAndRepair } from "../../shared/scipQcManifest.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const scipRecordId = body.scip_record_id || body.scip_id;
    if (!scipRecordId) {
      return Response.json({ error: "scip_record_id is required" }, { status: 400 });
    }

    let record = null;
    for (let attempt = 0; attempt < 3 && !record; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 1500));
      record = await base44.entities.ScipRecord.get(scipRecordId).catch(() => null);
    }
    if (!record) return Response.json({ error: "SCIP record not found" }, { status: 404 });

    const result = await runScipQcAndRepair({
      base44,
      record,
      checkedBy: user.email || user.id || "authenticated-user",
      repairAllowed: body.repair_allowed !== false,
    });
    return Response.json({
      qc_manifest: result.manifest,
      book_qc: result.book_qc,
      record: result.record,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SiteHawk QC failed";
    console.error("runSiteHawkQC failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
});
