import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { runScipQcAndRepair } from "../../shared/scipQcManifest.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const payload = (await req.json().catch(() => ({}))) || {};
    const { event, data, payload_too_large } = payload;
    let record = data;
    if (!record || payload_too_large) {
      record = await base44.asServiceRole.entities.ScipRecord.get(event?.entity_id);
    }
    if (!record) return Response.json({ error: "ScipRecord not found" }, { status: 404 });
    if (record.status !== "submitted") {
      return Response.json({ skipped: true, reason: "status is not submitted" });
    }

    const result = await runScipQcAndRepair({
      base44,
      record,
      checkedBy: user.email || user.id || "workflow-user",
      repairAllowed: true,
    });
    const manifest = result.manifest;

    // A submitted label is a release state. Fail closed and return it to draft
    // when the fresh OpenRouter + deterministic gate does not authorize release.
    if (manifest.status !== "PASS" || manifest.release_allowed !== true) {
      await base44.entities.ScipRecord.update(record.id, { status: "draft" });
    }

    const owner = record.created_by;
    if (owner) {
      const findings = [
        ...(manifest.blockers || []).map((item: string) => "[BLOCKER] " + item),
        ...(manifest.manual_review_reasons || []).map((item: string) => "[REVIEW] " + item),
        ...(manifest.warnings || []).map((item: string) => "[WARNING] " + item),
      ].slice(0, 30);
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: owner,
        subject: "SCIP QC " + manifest.status + " — " + (record.site_name || record.id),
        body: [
          "OpenRouter QC + Repair ran when this SCIP was marked submitted.",
          "QC Run: " + manifest.qc_run_id,
          "Status: " + manifest.status,
          "Release allowed: " + (manifest.release_allowed ? "Yes" : "No"),
          "Repair status: " + manifest.repair_status,
          "",
          manifest.summary,
          findings.length ? "\nFindings:\n" + findings.join("\n") : "",
          manifest.release_allowed
            ? "\nThe submitted status was retained."
            : "\nRelease was blocked and the SCIP was returned to draft.",
        ].filter(Boolean).join("\n"),
        from_name: "SiteHawk OpenRouter Quality Control",
      });
    }

    return Response.json({
      qc_manifest: manifest,
      release_allowed: manifest.release_allowed,
      reverted_to_draft: !manifest.release_allowed,
      emailed: Boolean(owner),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submit QC failed";
    console.error("scipSubmitAudit failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
});
