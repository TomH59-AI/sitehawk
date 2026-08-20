import { runSiteHawkQC } from "@/functions/runSiteHawkQC";

export function isScipQcPass(record) {
  const qc = record?.book_qc;
  return qc?.status === "PASS" && qc?.release_allowed === true && qc?.print_ready === true;
}

export async function runScipQc(recordOrId, { repairAllowed = true } = {}) {
  const id = typeof recordOrId === "string" ? recordOrId : recordOrId?.id;
  if (!id) throw new Error("SCIP record id is required for quality control.");
  const response = await runSiteHawkQC({
    scip_record_id: id,
    repair_allowed: repairAllowed,
  });
  return response?.data || response || {};
}

export async function ensureScipQcPass(recordOrId, options) {
  const result = await runScipQc(recordOrId, options);
  const manifest = result?.qc_manifest;
  if (manifest?.status !== "PASS" || manifest?.release_allowed !== true) {
    const reason = manifest?.blockers?.[0]
      || manifest?.manual_review_reasons?.[0]
      || manifest?.summary
      || "OpenRouter QC did not authorize release.";
    const error = new Error(reason);
    error.qcManifest = manifest;
    error.qcRecord = result?.record;
    throw error;
  }
  return result;
}
