// Derive how far the user has progressed through the 11-step SiteHawk workflow,
// based on the most recent ScipRecord (+ its CRM deal / mailer signals).
//
// Each step returns one of: "done" | "next" | "locked".
// Rule: a step is only unlocked once every step before it is done. The first
// not-done step is "next"; everything after it is "locked".
//
// We read ONLY already-loaded entity fields — no extra network calls.

// Returns a Set-like map { [stepNumber]: true } for steps that are complete.
function computeCompleted(scip, deal, hasMailer) {
  const done = {};
  if (!scip) return done;

  const targets = Array.isArray(scip.parcel_targets) ? scip.parcel_targets : [];
  const idx = scip.active_target_index || 0;
  const maps = scip.hawk_maps || {};
  const rf = scip.rf_enrichment?.[String(idx)] || scip.rf_enrichment?.[idx] || null;

  // 1. Enter Data — a SCIP record exists with coordinates.
  if (Number.isFinite(scip.latitude) && Number.isFinite(scip.longitude)) done[1] = true;
  // 2. Run a Site Scan — a SARF map was generated.
  if (scip.map_image_url || scip.status === "map_generated" || scip.status === "submitted") done[2] = true;
  // 3. Run a Zoning Report.
  if (scip.zoning_jurisdiction || (scip.zoning_report && Object.keys(scip.zoning_report).length)) done[3] = true;
  // 4. Pick Three Targets.
  if (targets.length > 0) done[4] = true;
  // 5. Run the Mapping Suite — any hawk map present.
  if (maps.aerial_url || maps.topography_url || maps.floodplain_url || maps.zoning_url) done[5] = true;
  // 6. Run Fiber Optics Map (carrier/fiber enrichment captured).
  if (rf?.rf?.fiber || rf?.coverage) done[6] = true;
  // 7. Run Power Map.
  if (scip.power_airport_maps?.power) done[7] = true;
  // 8. Run Propagation Map.
  if (rf?.coverage?.png_url) done[8] = true;
  // 9. Run a Compliance Report — handled by hasCompliance flag passed in deal arg.
  // (compliance lives in a separate entity; see deriveWorkflowSteps)

  // 10. CRM — a SCIP CRM deal exists and moved past initial generation.
  if (deal && deal.stage && deal.stage !== "scip_generated") done[10] = true;
  // 11. Send Mailers — a mailer order was placed.
  if (hasMailer) done[11] = true;

  return done;
}

// scip: latest ScipRecord | null
// deal: matching ScipCRMDeal | null
// hasCompliance: bool — a ComplianceCheck exists for this SCIP
// hasMailer: bool — a PostcardMailerOrder exists for this SCIP
export function deriveWorkflowSteps({ scip, deal, hasCompliance, hasMailer }) {
  const done = computeCompleted(scip, deal, hasMailer);
  if (hasCompliance) done[9] = true;

  // Find the first not-done step → that's "next"; everything after is "locked".
  let nextFound = false;
  const status = {};
  for (let n = 1; n <= 11; n++) {
    if (done[n]) {
      status[n] = "done";
    } else if (!nextFound) {
      status[n] = "next";
      nextFound = true;
    } else {
      status[n] = "locked";
    }
  }
  return status;
}