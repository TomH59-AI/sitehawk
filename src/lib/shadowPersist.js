/**
 * Installs the shadow-mode persistence sink.
 *
 * Imported once for its side effect. Kept apart from solverShadow.ts so the
 * solver library stays pure and testable in node — the tests must not need a
 * network client.
 *
 * Every call here is fire-and-forget. The live engine is still authoritative
 * while shadow mode runs, so a logging failure must be invisible.
 */
import { setShadowPersister } from "@/lib/solverShadow";
import { solverShadowLog } from "@/functions/solverShadowLog";

// A user dragging the probe can generate diffs faster than they are worth
// storing. The client already dedupes by site+outcome; this bounds the rest.
const MIN_INTERVAL_MS = 1500;
let lastSent = 0;

setShadowPersister((diff, surface) => {
  const now = Date.now();
  if (now - lastSent < MIN_INTERVAL_MS) return;
  lastSent = now;

  solverShadowLog({
    action: "record",
    diff: {
      surface,
      jurisdiction: diff.jurisdiction || null,
      lat: diff.at?.lat,
      lon: diff.at?.lon,
      live_code: diff.live.errorCode || "",
      live_max_ft: diff.live.maxHeightFt,
      live_setback_ft: diff.live.setbackApplied,
      v2_codes: diff.v2.codes,
      v2_max_ft: diff.v2.maxHeightFt,
      v2_rung: String(diff.v2.rung),
      binding_constraint: diff.v2.bindingConstraint,
      edge_classification: diff.v2.edgeClassification,
      delta_ft: diff.heightDeltaFt,
      explanation: diff.explanation,
    },
  }).catch(() => {
    /* never surfaces to the user */
  });
});
