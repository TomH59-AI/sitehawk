/**
 * TalonFit® / HawkPerch — SiteHawk AI Siting Solver
 * REFERENCE SPECIFICATION (source: SiteHawk AI Siting Solver Technical Specification).
 *
 * This is the authoritative record of the math TalonFit uses to pick targets and
 * explain WHY a tower will or will not work at a given height. It works hand in
 * hand with the local telecommunications tower ordinance (setbacks, height caps,
 * fall zone, separation), which supplies the rule values plugged into these
 * equations.
 *
 * Reference only — the live solver lives in src/lib/hawkfitGeometry.js /
 * towerSiterEngine.js. Keep this file in sync if the spec is revised.
 */

export const TALONFIT_MATH = `TALONFIT® / HAWKPERCH SITING SOLVER — THE ACTUAL MATH (authoritative reference).
This is how SiteHawk chooses Target A/B/C and how it explains why a tower will or won't work at a given height. It works hand in hand with the local telecommunications tower ordinance, which supplies the rule values (setbacks, height cap, fall-zone standard, separation buffers) fed into these equations.

1) COORDINATE PROJECTION
- Global WGS84 lat/lon is projected into a localized Cartesian system — the State Plane Coordinate System (SPCS), in decimal FEET — to hold sub-foot accuracy over the parcel with minimal distortion. Projection f(φ, λ) → (x, y). Every calculation is in feet.

2) PARCEL POLYGON
- Parcel P = a simple polygon of ordered vertices V = {v1…vn}. Boundary edges E_i = (v_i, v_i+1).

3) DISTANCE FUNCTION
- The cursor position C(x, y) IS the tower base. The solver computes the minimum perpendicular distance d from C to every boundary edge E_i:
  d(C, E_i) = |(y_i+1 − y_i)x_c − (x_i+1 − x_i)y_c + x_i+1·y_i − y_i+1·x_i| / sqrt((y_i+1 − y_i)² + (x_i+1 − x_i)²)
- Point-in-polygon uses ray casting; edge distance uses point-to-segment (clamped projection parameter t ∈ [0,1]).

4) SETBACK CONSTRAINTS (governed by ordinance + EIA/TIA-222 and ASCE 7)
- A location is "Allowable" only when d(C, E_type) ≥ S_min for every applicable rule:
  • Front setback — distance to road frontage.
  • Side / rear setback — distance to adjacent property lines.
  • Residential separation — a specialized buffer B_res when the parcel borders residential zoning.
  • Existing-tower separation buffer (ordinance-specified, e.g. 1500 ft).

5) FALL ZONE + THE PE LETTER TOGGLE
- Fall Zone F_z = the radius around the tower where debris could land on structural failure. By DEFAULT F_z equals 100% of tower height H.
- With the PE Letter (Professional Engineer letter) toggle active, a reduction multiplier M is applied for an engineered fold-over / collapse-upon-itself design:
  F_z = H × M
- Multipliers:
  • Standard lattice/monopole → M = 1.0 (100%) — standard fall zone per ordinance.
  • Engineered, PE certified → M = 0.5 (50%) — TIA-222 collapsible design.
  • Custom engineered → M variable 0.1–0.9 — project-specific PE-stamped design.

6) LIVE CURSOR STATE (continuous event loop as the cursor moves across P)
- GREEN (allowable): C ∈ P AND d(C, E_i) ≥ max(setback, fall zone) for ALL i.
- RED (unallowable): any spatial or height constraint violated.

7) MAXIMUM ALLOWABLE HEIGHT — the answer to "how tall can it be here?"
  H_max = min( H_limit , d(C, E_nearest) / M )
  where H_limit is the ordinance height cap.
- For the site to be viable it must yield H_max ≥ 100 ft, the standard carrier requirement for macro-site viability.
- Worked logic: required buffer at a point = max(side setback, requested height × M). If the nearest edge distance is less than that buffer, the point fails; if (edge distance / M) < 100 the failure is a HEIGHT problem, otherwise it's a fall-zone spillover.

8) ERROR CODES (why a point is red)
- ERR_EXT_P — Outside parcel boundary: cursor is not inside polygon P.
- ERR_STBK — Setback violation: d(C, E_i) is less than the required zoning setback.
- ERR_FZ_S — Fall zone spillover: the engineered fall zone crosses the property line.
- ERR_H_MIN — Below minimum 100 ft: geometry allows a tower, but max height is under 100 ft.

9) SESSION CONFIG SHAPE
- parcel_data: { projection (e.g. EPSG:2263), vertices [{x, y}…] }
- zoning_constraints: { classification, setbacks { front, side, rear }, max_height_limit (e.g. 199), separation_requirements { residential_buffer (e.g. 200), existing_tower_buffer (e.g. 1500) } }
- tower_request: { proposed_height, has_pe_letter, engineered_multiplier }

HOW TO EXPLAIN THIS OUT LOUD: never dump the formulas. Say it plainly — "we project the parcel into feet, measure from the proposed base to every property line, then compare that distance against the ordinance setback and the fall zone, which is the tower height (or half of it with a PE letter). The tightest edge sets the tallest tower that fits — capped by the ordinance height limit — and it has to clear 100 feet to be worth a carrier's time." Cite the specific binding constraint and the error reason when a point fails.`;