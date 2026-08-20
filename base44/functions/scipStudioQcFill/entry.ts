import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { runScipQcAndRepair } from "../../shared/scipQcManifest.ts";

function qualityRow(doc: any, manifest: any) {
  return [...(doc?.quality_gate || []), {
    check: "OpenRouter QC + Repair",
    required: true,
    result: manifest.status === "PASS" ? "Pass" : "Fail",
    reviewed_by: "OpenRouter GPT-5.6 Sol + deterministic SiteHawk gate",
    review_date: new Date().toISOString().slice(0, 10),
    notes: manifest.summary + " QC Run: " + manifest.qc_run_id,
  }];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { scip_record_id } = (await req.json().catch(() => ({}))) || {};
    if (!scip_record_id) {
      return Response.json({ error: "scip_record_id required" }, { status: 400 });
    }

    const scip = await base44.entities.ScipRecord.get(scip_record_id);
    if (!scip) return Response.json({ error: "SCIP record not found" }, { status: 404 });

    let docs = await base44.entities.ScipStudioDoc.filter({ scip_record_id });
    let doc = docs?.[0];
    if (!doc) {
      return Response.json({ error: "Assemble the Studio document first" }, { status: 400 });
    }

    const qc = await runScipQcAndRepair({
      base44,
      record: scip,
      checkedBy: user.email || user.id || "authenticated-user",
      repairAllowed: true,
    });
    const manifest = qc.manifest;

    // Reassemble once after evidence-backed repairs so the Studio receives the
    // repaired canonical fields. Existing analyst-authored content is preserved
    // by scipStudioAssemble.
    if ((manifest.repairs || []).some((repair: any) => repair.status === "APPLIED")) {
      const refreshed = await base44.functions.invoke("scipStudioAssemble", {
        scip_record_id,
        rebuild: false,
      }).catch(() => null);
      doc = refreshed?.data?.doc || refreshed?.doc || doc;
    }

    const updated = await base44.entities.ScipStudioDoc.update(doc.id, {
      quality_gate: qualityRow(doc, manifest),
      // A configured QC PASS moves the Studio to human review; it is not legal or engineering approval.
      doc_status: manifest.status === "PASS" ? "review" : "draft",
    });
    const fills = (manifest.repairs || [])
      .filter((repair: any) => repair.status === "APPLIED")
      .map((repair: any) => ({
        field: repair.field_key,
        value: repair.applied_value,
        source_url: repair.source_url || null,
        confidence: repair.confidence,
      }));

    return Response.json({
      doc: updated,
      fills,
      verdict: manifest.status === "PASS" ? "ready" : "needs_review",
      status: manifest.status,
      release_allowed: manifest.release_allowed,
      summary: manifest.summary,
      gaps_remaining: manifest.manual_review_reasons || [],
      blockers: manifest.blockers || [],
      qc_run_id: manifest.qc_run_id,
      model: manifest.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Studio QC failed";
    console.error("scipStudioQcFill failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
});
