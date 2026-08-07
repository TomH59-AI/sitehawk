/**
 * TalonFit® / HawkPerch — SiteHawk AI Siting Solver v2
 *
 * Implements the authoritative spec in src/components/guide/talonfitMath.js.
 * All geometry is planar and in DECIMAL FEET (project lat/lon first — see
 * projectParcelToFeet at the bottom).
 *
 * THE DOCTRINE — GRADER, NOT BOUNCER.
 * Nothing is ever "turned down". Every point gets a maximum achievable height, a
 * height rung, and ladder points. A failing point scores FAIL / 0 points and is
 * still reported with the exact binding constraint. That is what lets Targets
 * A, B and C be ranked against each other instead of silently dropped.
 *
 * What v2 fixes versus the live hawkfitGeometry.computeFit:
 *   - Per-edge setbacks. computeFit uses max(front, side, rear) as ONE number
 *     for every edge, so a point 30 ft off a side line (25 ft required) is
 *     rejected against the 50 ft frontage rule. That silently discards
 *     buildable positions on any parcel whose setbacks are not uniform.
 *   - The PE rescue as a real mode. computeFit only scales the fall zone by a
 *     multiplier clamped to 0.1–0.9. A PE-stamped breakpoint design is a FIXED
 *     collapse radius in feet, decoupled from height entirely — that is what
 *     lets a tight parcel clear the full cap.
 *   - Residential separation as a height multiple (Brevard-style 2xH).
 *   - Existing-tower separation buffers.
 *   - An optimizer that hunts the parcel, rather than assuming the centroid.
 *   - A codes ARRAY: a point can fail several ways at once, and the report
 *     should say so rather than surfacing whichever check ran first.
 */

export interface Point {
  x: number;
  y: number;
}

export type EdgeType = 'front' | 'side' | 'rear';

export interface EdgeSpec {
  type: EdgeType;
  /** Edge abuts residential zoning — triggers the residential separation rule. */
  abutsResidential?: boolean;
}

export interface Setbacks {
  front: number;
  side: number;
  rear: number;
}

export type FallZoneSpec =
  /** F_z = H x value. 1.0 standard, 1.1 where the ordinance demands it, 0.5 collapsible. */
  | { mode: 'percent'; value: number }
  /** PE-stamped engineered collapse radius, in feet, decoupled from tower height. */
  | { mode: 'certified_radius'; value: number };

export interface SeparationSpec {
  mode: 'height_multiple' | 'fixed_ft';
  value: number;
}

export interface ExistingTower {
  point: Point;
  /** Required separation from this tower, in feet. */
  buffer: number;
}

export interface SolverConfig {
  parcelCoords: Point[];
  /** One spec per edge, in vertex order. Omitted => every edge defaults to 'side'. */
  edgeSpecs?: EdgeSpec[];
  setbacks: Setbacks;
  /** District height cap. ALWAYS enforced — geometry never beats the ordinance. */
  maxHeightLimit: number;
  fallZone: FallZoneSpec;
  residentialSeparation?: SeparationSpec;
  existingTowers?: ExistingTower[];
  /** Macro-viability floor. Below this a point grades FAIL. Default 100 ft. */
  minViableHeight?: number;
}

export type ErrorCode = 'ERR_EXT_P' | 'ERR_STBK' | 'ERR_FZ_S' | 'ERR_H_MIN' | 'ERR_TWR_SEP';

export interface Violation {
  code: ErrorCode;
  /** What kind of rule produced it — lets the UI explain a shared code precisely. */
  kind: 'outside_parcel' | 'setback' | 'fall_zone' | 'residential_separation' | 'tower_separation' | 'min_height';
  message: string;
  edgeIndex?: number;
  edgeType?: EdgeType;
  requiredFt?: number;
  actualFt?: number;
}

export type Rung = number | 'FAIL';

export interface GradeResult {
  point: Point;
  inParcel: boolean;
  maxAchievableHeight: number;
  rung: Rung;
  ladderPoints: number;
  edgeClassification: 'explicit' | 'default_side';
  /** Which rule actually capped the height at this point. */
  bindingConstraint: 'height_cap' | 'fall_zone' | 'residential_separation' | 'setback' | 'tower_separation' | 'outside_parcel';
  nearestEdgeFt: number;
  violations: Violation[];
}

export interface ValidateResult {
  valid: boolean;
  codes: ErrorCode[];
  violations: Violation[];
  maxAchievableHeight: number;
}

export interface BestSiteResult {
  best: GradeResult;
  /** Fraction of the ordinance cap the best point actually achieves (0–1). */
  headroomRatio: number;
  /** Every candidate that tied the winning height, for tie-break inspection. */
  searchedPoints: number;
}

/**
 * Standard carrier centerline heights. A point's rung is the tallest of these it
 * supports. Deliberately excludes values between 120 and 150 that carriers do
 * not routinely build to — a site that grades 129 ft is a 120 ft site.
 */
export const RUNGS = [199, 180, 160, 150, 140, 130, 120, 110, 100];

const DEFAULT_MIN_VIABLE = 100;
/** Rung comparison tolerance: 0.01 ft is well under survey precision. */
const RUNG_EPS = 0.01;

/* ------------------------------------------------------------------ *
 * Planar geometry helpers
 * ------------------------------------------------------------------ */

function dedupeRing(coords: Point[]): Point[] {
  const pts = (coords || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  // A closed ring repeats the first vertex — tolerate it rather than treating
  // the duplicate as a zero-length edge.
  if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) return pts.slice(0, -1);
  return pts;
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersects = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Perpendicular distance from p to segment ab, with the projection clamped to the segment. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/* ------------------------------------------------------------------ *
 * The solver
 * ------------------------------------------------------------------ */

export class HawkPerchSolver {
  private poly: Point[];
  private edges: Array<{ a: Point; b: Point; spec: EdgeSpec; index: number }>;
  private cfg: SolverConfig;
  private minViable: number;
  readonly edgeClassification: 'explicit' | 'default_side';

  constructor(config: SolverConfig) {
    this.cfg = config;
    this.poly = dedupeRing(config.parcelCoords);
    this.minViable = Number.isFinite(config.minViableHeight as number)
      ? (config.minViableHeight as number)
      : DEFAULT_MIN_VIABLE;

    const specs = config.edgeSpecs;
    // No edge typing supplied means we cannot claim to know which line is the
    // road frontage. Everything defaults to 'side' and the result is FLAGGED, so
    // a default_side grade is never mistaken for a verified frontage analysis.
    const usingDefaults = !Array.isArray(specs) || specs.length === 0;
    this.edgeClassification = usingDefaults ? 'default_side' : 'explicit';

    this.edges = this.poly.map((a, i) => ({
      a,
      b: this.poly[(i + 1) % this.poly.length],
      spec: usingDefaults ? { type: 'side' as EdgeType } : specs![i] || { type: 'side' as EdgeType },
      index: i,
    }));
  }

  /** Score points for target ranking: 18 at the 100 ft floor, +1 per 5 ft above it. */
  static ladderPoints(rung: Rung): number {
    if (rung === 'FAIL' || !Number.isFinite(rung as number)) return 0;
    return Math.round(((rung as number) - 100) / 5) + 18;
  }

  static rungFor(maxHeight: number, minViable = DEFAULT_MIN_VIABLE): Rung {
    if (!Number.isFinite(maxHeight) || maxHeight < minViable - RUNG_EPS) return 'FAIL';
    for (const rung of RUNGS) {
      if (rung <= maxHeight + RUNG_EPS) return rung;
    }
    return 'FAIL';
  }

  private setbackFor(spec: EdgeSpec): number {
    const s = this.cfg.setbacks || ({} as Setbacks);
    const value = spec.type === 'front' ? s.front : spec.type === 'rear' ? s.rear : s.side;
    return Number.isFinite(value) ? value : 0;
  }

  private edgeDistances(p: Point) {
    return this.edges.map((e) => ({ edge: e, dist: distanceToSegment(p, e.a, e.b) }));
  }

  isInParcel(p: Point): boolean {
    return pointInPolygon(p, this.poly);
  }

  /**
   * Maximum tower height supportable at a point, in feet.
   *
   * percent mode:          H_max = min(cap, d_nearest / M)
   * certified_radius mode: height is not fall-zone-bound, so H_max = cap as long
   *                        as the fixed radius and every setback clear.
   * Residential edges add H <= d_edge / multiple, which is the "residential drag"
   * that pulls a parcel centre well below what plain setbacks suggest.
   */
  private computeMaxHeight(p: Point): { height: number; binding: GradeResult['bindingConstraint']; nearest: number } {
    if (!this.isInParcel(p)) return { height: 0, binding: 'outside_parcel', nearest: 0 };

    const dists = this.edgeDistances(p);
    const nearest = dists.reduce((min, d) => Math.min(min, d.dist), Infinity);

    // Setbacks are a validity gate, not a height reducer — a point inside any
    // edge's own setback cannot host a tower at any height.
    for (const { edge, dist } of dists) {
      if (dist < this.setbackFor(edge.spec) - 1e-9) return { height: 0, binding: 'setback', nearest };
    }

    for (const tower of this.cfg.existingTowers || []) {
      if (Math.hypot(p.x - tower.point.x, p.y - tower.point.y) < tower.buffer - 1e-9) {
        return { height: 0, binding: 'tower_separation', nearest };
      }
    }

    let height = this.cfg.maxHeightLimit;
    let binding: GradeResult['bindingConstraint'] = 'height_cap';

    const fz = this.cfg.fallZone;
    if (fz?.mode === 'percent') {
      const m = fz.value;
      const fallLimited = m > 0 ? nearest / m : Infinity;
      if (fallLimited < height) {
        height = fallLimited;
        binding = 'fall_zone';
      }
    } else if (fz?.mode === 'certified_radius') {
      // The engineered collapse radius must physically fit; beyond that, height
      // is unconstrained by the fall zone. This is the PE rescue.
      if (nearest < fz.value - 1e-9) return { height: 0, binding: 'fall_zone', nearest };
    }

    const res = this.cfg.residentialSeparation;
    if (res) {
      for (const { edge, dist } of dists) {
        if (!edge.spec.abutsResidential) continue;
        if (res.mode === 'height_multiple') {
          const limited = res.value > 0 ? dist / res.value : Infinity;
          if (limited < height) {
            height = limited;
            binding = 'residential_separation';
          }
        } else if (dist < res.value - 1e-9) {
          return { height: 0, binding: 'residential_separation', nearest };
        }
      }
    }

    return { height: Math.max(0, height), binding, nearest };
  }

  /**
   * Grade a point. Never rejects — returns a height, a rung and ladder points
   * even when the point is unbuildable.
   */
  gradePoint(p: Point): GradeResult {
    const inParcel = this.isInParcel(p);
    const { height, binding, nearest } = this.computeMaxHeight(p);
    const rung = HawkPerchSolver.rungFor(height, this.minViable);
    return {
      point: p,
      inParcel,
      maxAchievableHeight: height,
      rung,
      ladderPoints: HawkPerchSolver.ladderPoints(rung),
      edgeClassification: this.edgeClassification,
      bindingConstraint: binding,
      nearestEdgeFt: Number.isFinite(nearest) ? nearest : 0,
      violations: this.validateLocation(p, height).violations,
    };
  }

  /**
   * Check a specific proposed height at a point. Returns EVERY code that fires,
   * because a report that names one failure when three apply sends an agent back
   * for a second and third round trip.
   */
  validateLocation(p: Point, proposedHeight: number): ValidateResult {
    const violations: Violation[] = [];
    const inParcel = this.isInParcel(p);

    if (!inParcel) {
      violations.push({
        code: 'ERR_EXT_P',
        kind: 'outside_parcel',
        message: 'Outside the parcel boundary — this point is not on the property.',
      });
    }

    if (inParcel) {
      for (const { edge, dist } of this.edgeDistances(p)) {
        const required = this.setbackFor(edge.spec);
        if (dist < required - 1e-9) {
          violations.push({
            code: 'ERR_STBK',
            kind: 'setback',
            message: `${Math.round(dist)} ft from the ${edge.spec.type} line — ${Math.round(required)} ft required.`,
            edgeIndex: edge.index,
            edgeType: edge.spec.type,
            requiredFt: required,
            actualFt: dist,
          });
        }
      }

      const dists = this.edgeDistances(p);
      const nearest = dists.reduce((min, d) => Math.min(min, d.dist), Infinity);
      const fz = this.cfg.fallZone;
      const requiredRadius =
        fz?.mode === 'certified_radius' ? fz.value : fz?.mode === 'percent' ? proposedHeight * fz.value : 0;
      if (requiredRadius > 0 && nearest < requiredRadius - 1e-9) {
        violations.push({
          code: 'ERR_FZ_S',
          kind: 'fall_zone',
          message:
            fz?.mode === 'certified_radius'
              ? `PE-certified ${Math.round(fz.value)} ft collapse radius spills over the property line (${Math.round(nearest)} ft available).`
              : `Fall zone for a ${Math.round(proposedHeight)} ft tower needs ${Math.round(requiredRadius)} ft; only ${Math.round(nearest)} ft available.`,
          requiredFt: requiredRadius,
          actualFt: nearest,
        });
      }

      const res = this.cfg.residentialSeparation;
      if (res) {
        for (const { edge, dist } of dists) {
          if (!edge.spec.abutsResidential) continue;
          const required = res.mode === 'height_multiple' ? res.value * proposedHeight : res.value;
          if (dist < required - 1e-9) {
            violations.push({
              code: 'ERR_STBK',
              kind: 'residential_separation',
              message: `${Math.round(dist)} ft from residential — ${Math.round(required)} ft required${
                res.mode === 'height_multiple' ? ` (${res.value}x tower height)` : ''
              }.`,
              edgeIndex: edge.index,
              edgeType: edge.spec.type,
              requiredFt: required,
              actualFt: dist,
            });
          }
        }
      }
    }

    for (const tower of this.cfg.existingTowers || []) {
      const d = Math.hypot(p.x - tower.point.x, p.y - tower.point.y);
      if (d < tower.buffer - 1e-9) {
        violations.push({
          code: 'ERR_TWR_SEP',
          kind: 'tower_separation',
          message: `${Math.round(d)} ft from an existing tower — ${Math.round(tower.buffer)} ft separation required.`,
          requiredFt: tower.buffer,
          actualFt: d,
        });
      }
    }

    const { height } = this.computeMaxHeight(p);
    if (inParcel && height > 0 && height < this.minViable - 1e-9) {
      violations.push({
        code: 'ERR_H_MIN',
        kind: 'min_height',
        message: `Geometry allows only ${Math.round(height)} ft — below the ${this.minViable} ft macro-viability floor.`,
        requiredFt: this.minViable,
        actualFt: height,
      });
    }

    const codes = Array.from(new Set(violations.map((v) => v.code)));
    return { valid: codes.length === 0, codes, violations, maxAchievableHeight: height };
  }

  /**
   * Hunt the parcel for the point with the highest achievable height.
   *
   * A coarse sweep followed by successive local refinement. The best site is
   * rarely the centroid on a constrained parcel: with a residential rear and a
   * 110% fall zone, shifting toward the frontage balances the two competing
   * constraints and buys back an entire rung.
   */
  findBestSite(coarseSteps = 64, refinements = 40): BestSiteResult {
    if (!this.poly.length) {
      const empty = this.gradePoint({ x: 0, y: 0 });
      return { best: empty, headroomRatio: 0, searchedPoints: 0 };
    }

    const xs = this.poly.map((p) => p.x);
    const ys = this.poly.map((p) => p.y);
    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);

    let bestPoint: Point = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    let bestHeight = -1;
    let searched = 0;

    const sweep = (x0: number, x1: number, y0: number, y1: number, steps: number) => {
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps; j++) {
          const p = {
            x: x0 + ((x1 - x0) * i) / steps,
            y: y0 + ((y1 - y0) * j) / steps,
          };
          searched++;
          const { height } = this.computeMaxHeight(p);
          if (height > bestHeight) {
            bestHeight = height;
            bestPoint = p;
          }
        }
      }
    };

    sweep(minX, maxX, minY, maxY, coarseSteps);

    // Refine around the winner. Each pass halves the window, so the search
    // converges on the true optimum rather than the nearest grid node — which
    // matters because a fraction of a foot can decide a rung boundary.
    let windowX = (maxX - minX) / coarseSteps;
    let windowY = (maxY - minY) / coarseSteps;
    for (let pass = 0; pass < refinements && (windowX > 1e-4 || windowY > 1e-4); pass++) {
      const cx = bestPoint.x;
      const cy = bestPoint.y;
      sweep(cx - windowX, cx + windowX, cy - windowY, cy + windowY, 8);
      windowX /= 2;
      windowY /= 2;
    }

    const best = this.gradePoint(bestPoint);
    const cap = this.cfg.maxHeightLimit || 0;
    return {
      best,
      headroomRatio: cap > 0 ? Math.min(1, best.maxAchievableHeight / cap) : 0,
      searchedPoints: searched,
    };
  }

  /** Grade several candidate points and rank them — this is Target A / B / C. */
  rankTargets(points: Point[]): GradeResult[] {
    return points
      .map((p) => this.gradePoint(p))
      .sort((a, b) => b.ladderPoints - a.ladderPoints || b.maxAchievableHeight - a.maxAchievableHeight);
  }
}

/* ------------------------------------------------------------------ *
 * lat/lon -> feet
 * ------------------------------------------------------------------ */

const FT_PER_DEG_LAT = 364000; // ~69.0 mi/deg

/**
 * Project a lat/lon ring to a local planar frame in feet, centred on the
 * parcel. Over a single parcel the local tangent plane is accurate to well
 * under a foot, which is what the solver needs. Returns the projector so a
 * cursor position can be pushed through the same frame.
 */
export function projectParcelToFeet(ring: Array<[number, number]>): {
  points: Point[];
  toFeet: (lon: number, lat: number) => Point;
  toLngLat: (p: Point) => [number, number];
} {
  const lons = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  const lon0 = lons.reduce((a, b) => a + b, 0) / lons.length;
  const lat0 = lats.reduce((a, b) => a + b, 0) / lats.length;
  const ftPerDegLon = FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);

  const toFeet = (lon: number, lat: number): Point => ({
    x: (lon - lon0) * ftPerDegLon,
    y: (lat - lat0) * FT_PER_DEG_LAT,
  });
  const toLngLat = (p: Point): [number, number] => [lon0 + p.x / ftPerDegLon, lat0 + p.y / FT_PER_DEG_LAT];

  return { points: ring.map((c) => toFeet(c[0], c[1])), toFeet, toLngLat };
}
