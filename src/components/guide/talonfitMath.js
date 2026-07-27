/**
 * TalonFit® / HawkPerch — SiteHawk AI Siting Solver
 * REFERENCE SPECIFICATION v2 (source: SiteHawk AI Siting Solver spec + HawkPerchSolver v2 smoke tests).
 *
 * This is the authoritative record of the math SiteHawk uses to FIND the targets,
 * PERCH them, and/or SITE them — and to explain WHY a tower will or will not work
 * at a given height. It works hand in hand with the local telecommunications
 * tower ordinance, which supplies the rule values plugged into these equations.
 *
 * Reference only — live solver code lives in src/lib/hawkfitGeometry.js /
 * towerSiterEngine.js. Keep this file in sync when the spec is revised.
 */

export const TALONFIT_MATH = `TALONFIT® / HAWKPERCH SITING SOLVER v2 — THE ACTUAL MATH (authoritative reference).
This is how SiteHawk finds the Targets, Perches them, and/or Sites them — and how it explains why a tower will or won't work at a given height. It works hand in hand with the local telecommunications tower ordinance, which supplies the rule values (per-edge setbacks, height cap, fall-zone standard, separation buffers) fed into these equations.

THE DOCTRINE — GRADER, NOT BOUNCER:
HawkPerch never "turns down" a parcel or a point — it GRADES it. Every point gets a maximum achievable height, a height RUNG, and ladder points; a failing point is scored (FAIL rung, 0 ladder points), never silently rejected. Ranking beats rejection: that's how Targets A/B/C get chosen and compared.

1) COORDINATE PROJECTION
- WGS84 lat/lon → State Plane Coordinate System (SPCS) in decimal FEET for sub-foot accuracy. Every calculation is in feet.

2) PARCEL POLYGON + EDGE CLASSIFICATION
- Parcel P = simple polygon of ordered vertices; edges E_i = (v_i, v_i+1).
- EVERY EDGE IS TYPED: front (road frontage), side, or rear — and each edge type carries ITS OWN setback (e.g. front 50 ft, side 25, rear 25). An edge can also be flagged abutsResidential.
- The old single-setback shortcut was a BUG (a point 30 ft off the frontage wrongly passed because 30 ≥ side 25); v2 checks each edge against its own rule, so that point correctly fails ERR_STBK.
- A closed ring (first vertex repeated at end) is tolerated. If no edge types are supplied, all edges default to side and the result is flagged edgeClassification = 'default_side' so nobody mistakes it for a verified frontage analysis.

3) DISTANCE FUNCTION
- Cursor C(x, y) is the tower base. Minimum perpendicular distance d(C, E_i) from C to each edge (point-to-segment with clamped projection); point-in-polygon by ray casting.

4) FALL ZONE — TWO MODES
- percent mode: F_z = H × value. value = 1.0 (100% of height, standard), 0.5 (PE-certified collapsible, TIA-222), can also EXCEED 1.0 (e.g. 1.1 = 110% where the ordinance demands it), or any project-specific 0.1–0.9.
- certified_radius mode (THE PE RESCUE / breakpoint design): a PE-stamped engineered collapse radius as a FIXED number of feet (e.g. 40 ft), fully DECOUPLED from tower height. A tight parcel that grades FAIL at a 100% fall zone can clear the full 199-ft cap on the SAME parcel with a certified radius — the single most important save in tight-parcel siting.

5) MAXIMUM ACHIEVABLE HEIGHT AT A POINT
- percent mode: H_max = min( H_limit , d(C, E_nearest) / M ) — and the district height cap H_limit is ALWAYS enforced (geometry may say 300, cap says 199 → answer is 199).
- certified_radius mode: height is not fall-zone-bound; H_max = H_limit provided the fixed radius and all setbacks clear.
- Per-edge constraints all apply: each edge's own setback, residential separation, tower separation.

6) RESIDENTIAL SEPARATION — height_multiple MODE
- When an edge abuts residential zoning, the required distance can be a MULTIPLE of tower height (Brevard-style 2×H): required d ≥ value × H from that edge. This "residential drag" can pull the parcel center's H_max far below what plain setbacks suggest.

7) EXISTING-TOWER SEPARATION
- Each known tower carries a buffer (e.g. 1500 ft). A point inside any buffer fires ERR_TWR_SEP.

8) GRADING: RUNGS + LADDER POINTS
- gradePoint(C) returns: inParcel, maxAchievableHeight, rung, edgeClassification, and violations.
- The RUNG is the standard carrier centerline height the point supports (…199, 150, 120…). H_max below the 100-ft macro-viability floor grades rung = FAIL.
- ladderPoints(rung) converts the rung to score points for target ranking (e.g. rung 150 → 28 points; FAIL → 0). Higher rung = more points = better target.

9) THE OPTIMIZER — findBestSite()
- Sweeps the parcel for the point with the highest H_max (e.g. dead center of a clean 300×300 square with M=1.0 → ~150 ft, rung 150).
- It BUYS BACK RUNGS: with a residential 2×H rear and a 110% fall zone, the center may grade ~100, but shifting the base toward the frontage balances the competing constraints (analytic optimum where (depth − y)/2 = y/1.1) and recovers the 120 rung (~129 ft). The best site is rarely the centroid on a constrained parcel.
- Also reports headroomRatio (0–1): how much of the ordinance cap the best point actually achieves.

10) ERROR CODES (returned as a codes ARRAY — a point can fail several ways at once)
- ERR_EXT_P — outside parcel boundary.
- ERR_STBK — closer to an edge than that edge type's required setback.
- ERR_FZ_S — fall zone spills over the property line.
- ERR_H_MIN — geometry allows a tower but max height < 100 ft.
- ERR_TWR_SEP — inside an existing tower's separation buffer.

HOW TO EXPLAIN THIS OUT LOUD: never dump formulas. Say it plainly — "we type every property line — frontage, side, rear — and hold the tower base to each line's own setback, the fall zone, and any residential or tower-separation buffer. The tightest constraint sets the tallest tower at that spot, capped by the ordinance limit. We don't reject sites, we grade them: every point gets a height rung and ladder points, the optimizer hunts the parcel for the highest rung — often off-center — and if a tight parcel fails at a full fall zone, a PE-certified collapse radius can rescue it to full height." Cite the binding constraint, the rung, and the exact error reason when asked why.`;