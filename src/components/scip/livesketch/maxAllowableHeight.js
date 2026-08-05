/**
 * Maximum allowable tower height for a parcel — grader, not bouncer.
 *
 * Uses the SAME Talon FT geometry engine as the sketch (computeExhibit), so the
 * height that gets drawn is the height the fit math actually allows: the tallest
 * whole-foot tower whose compound clears the setbacks AND whose fall zone stays
 * on the parcel, then capped by the ordinance maximum when one is on record.
 *
 * Returns { maxAllowableFt, drawnHeightFt, limitedBy } —
 *   limitedBy: null | "fall_zone" | "ordinance"
 * Never rounds up, never converts units: feet in, whole feet out.
 */
import { computeExhibit } from "@/lib/towerFitExhibit";

const withHeight = (cfg, h) => ({ ...cfg, tower: { ...cfg.tower, heightFt: h } });
const passes = (cfg, h) => {
  const m = computeExhibit(withHeight(cfg, h));
  return m.compound.fits && !m.fallZone.spills;
};

export function resolveDrawnHeight(cfg, requestedFt, ordinanceMaxFt) {
  const requested = Math.max(1, Math.round(Number(requestedFt) || 0));

  // Geometric ceiling — largest whole foot that still passes, at or below requested.
  let geoMax = null;
  if (passes(cfg, requested)) geoMax = requested;
  else {
    let lo = 1, hi = requested;
    if (passes(cfg, lo)) {
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (passes(cfg, mid)) lo = mid; else hi = mid;
      }
      geoMax = lo;
    }
  }

  const ordMax = Number(ordinanceMaxFt) > 0 ? Math.round(Number(ordinanceMaxFt)) : null;
  const candidates = [requested, geoMax, ordMax].filter((v) => Number.isFinite(v) && v > 0);
  const drawn = Math.min(...candidates);

  let limitedBy = null;
  if (drawn < requested) limitedBy = ordMax !== null && drawn === ordMax ? "ordinance" : "fall_zone";

  return {
    maxAllowableFt: geoMax,
    drawnHeightFt: drawn,
    limitedBy,
    requestedFt: requested,
    ordinanceMaxFt: ordMax,
  };
}