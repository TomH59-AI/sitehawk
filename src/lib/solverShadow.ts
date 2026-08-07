/**
 * Shadow mode — run HawkPerchSolver v2 alongside the live computeFit engine and
 * record where they disagree, WITHOUT changing anything a user sees.
 *
 * The live engine stays the source of truth until the diff has been reviewed.
 * The point is to answer, with evidence rather than argument: which sites change,
 * by how much, and in which direction. A change that makes more sites buildable
 * is the intended fix; a change that makes fewer buildable needs explaining
 * before it ships.
 *
 * Everything here is wrapped so a shadow failure can never surface to a user —
 * a diagnostic that breaks the product it is diagnosing is worse than no
 * diagnostic.
 */

import { HawkPerchSolver, projectParcelToFeet } from './HawkPerchSolver';
import type { EdgeSpec, FallZoneSpec, GradeResult, Point, Setbacks } from './HawkPerchSolver';
import { buildSolverInputs } from './ordinanceToSolver';
import type { OrdinanceRecord } from './ordinanceToSolver';

/**
 * Pull the outer ring out of a GeoJSON Polygon / MultiPolygon as [[lon,lat],...].
 * For a MultiPolygon the largest ring by vertex count is used — parcels are
 * occasionally stored as a multipolygon with slivers attached.
 */
export function ringFromGeometry(geometry: any): Array<[number, number]> | null {
  try {
    if (!geometry) return null;
    if (geometry.type === 'Polygon') {
      const ring = geometry.coordinates?.[0];
      return Array.isArray(ring) && ring.length >= 3 ? ring : null;
    }
    if (geometry.type === 'MultiPolygon') {
      let best: any = null;
      for (const poly of geometry.coordinates || []) {
        const ring = poly?.[0];
        if (Array.isArray(ring) && (!best || ring.length > best.length)) best = ring;
      }
      return best && best.length >= 3 ? best : null;
    }
    if (geometry.type === 'Feature') return ringFromGeometry(geometry.geometry);
    return null;
  } catch {
    return null;
  }
}

export interface LiveFitResult {
  status?: string;
  errorCode?: string | null;
  edgeDistanceFt?: number;
  maxAvailableHeight?: number;
  setbackFt?: number;
}

export interface ShadowDiff {
  agree: boolean;
  /** Positive = the new solver finds MORE height than the live engine. */
  heightDeltaFt: number | null;
  live: {
    errorCode: string | null;
    maxHeightFt: number | null;
    setbackApplied: number | null;
  };
  v2: {
    codes: string[];
    maxHeightFt: number;
    rung: GradeResult['rung'];
    bindingConstraint: string;
    edgeClassification: string;
  };
  /** Why they differ, in one line, for the log. */
  explanation: string;
  jurisdiction?: string | null;
  at?: { lat: number; lon: number } | null;
}

function classify(diff: ShadowDiff): string {
  const { live, v2, heightDeltaFt } = diff;
  const liveBlocked = Boolean(live.errorCode);
  const v2Blocked = v2.codes.length > 0;

  if (liveBlocked && !v2Blocked) {
    return `Live engine blocked with ${live.errorCode}; v2 allows it. Most likely the single max(front,side,rear) setback rejecting a point that clears its own edge's rule.`;
  }
  if (!liveBlocked && v2Blocked) {
    return `Live engine allowed it; v2 blocks with ${v2.codes.join(', ')}. v2 applies rules the live engine does not check (residential separation, tower separation, per-edge setbacks).`;
  }
  if (heightDeltaFt !== null && Math.abs(heightDeltaFt) >= 1) {
    return heightDeltaFt > 0
      ? `v2 finds ${heightDeltaFt.toFixed(1)} ft MORE height. Binding constraint: ${v2.bindingConstraint}.`
      : `v2 finds ${Math.abs(heightDeltaFt).toFixed(1)} ft LESS height. Binding constraint: ${v2.bindingConstraint} — a rule the live engine does not apply.`;
  }
  return 'Engines agree.';
}

/**
 * Compare the two engines at one point. Returns null (never throws) if the
 * shadow cannot be computed — the caller carries on with the live result.
 */
export function shadowComparePoint(args: {
  parcelRing: Array<[number, number]>;
  towerLngLat: [number, number];
  proposedHeightFt: number;
  ordinance?: OrdinanceRecord | null;
  edgeSpecs?: EdgeSpec[];
  liveResult: LiveFitResult;
  jurisdiction?: string | null;
  /**
   * Rule overrides. Shadow mode should isolate the ENGINE difference, not the
   * rule-sourcing difference — so when the live call site already has setbacks,
   * a height cap and a fall-zone multiplier, we feed the solver the identical
   * values. Any disagreement that remains is the engines, not the inputs.
   */
  setbacks?: Setbacks;
  maxHeightFt?: number;
  fallZone?: FallZoneSpec;
}): ShadowDiff | null {
  try {
    const { parcelRing, towerLngLat, proposedHeightFt, ordinance, edgeSpecs, liveResult } = args;
    if (!Array.isArray(parcelRing) || parcelRing.length < 3) return null;
    // A non-finite tower position produces a technically-valid but meaningless
    // diff, which would quietly pollute the shadow log with noise.
    if (!Array.isArray(towerLngLat) || !Number.isFinite(towerLngLat[0]) || !Number.isFinite(towerLngLat[1])) return null;

    const { points, toFeet } = projectParcelToFeet(parcelRing);
    const inputs = buildSolverInputs(ordinance || null, { coords: points, edgeSpecs });

    const config = { ...inputs.config };
    if (args.setbacks) config.setbacks = args.setbacks;
    if (Number.isFinite(args.maxHeightFt as number)) config.maxHeightLimit = args.maxHeightFt as number;
    if (args.fallZone) config.fallZone = args.fallZone;

    const solver = new HawkPerchSolver(config);

    const at: Point = toFeet(towerLngLat[0], towerLngLat[1]);
    const grade = solver.gradePoint(at);
    const validation = solver.validateLocation(at, proposedHeightFt);

    const liveMax = Number.isFinite(liveResult?.maxAvailableHeight as number)
      ? (liveResult!.maxAvailableHeight as number)
      : null;
    const heightDeltaFt = liveMax !== null ? grade.maxAchievableHeight - liveMax : null;

    const diff: ShadowDiff = {
      agree:
        Boolean(liveResult?.errorCode) === validation.codes.length > 0 &&
        (heightDeltaFt === null || Math.abs(heightDeltaFt) < 1),
      heightDeltaFt,
      live: {
        errorCode: liveResult?.errorCode ?? null,
        maxHeightFt: liveMax,
        setbackApplied: Number.isFinite(liveResult?.setbackFt as number) ? (liveResult!.setbackFt as number) : null,
      },
      v2: {
        codes: validation.codes,
        maxHeightFt: grade.maxAchievableHeight,
        rung: grade.rung,
        bindingConstraint: grade.bindingConstraint,
        edgeClassification: grade.edgeClassification,
      },
      explanation: '',
      jurisdiction: args.jurisdiction ?? ordinance?.jurisdiction ?? null,
      at: { lat: towerLngLat[1], lon: towerLngLat[0] },
    };
    diff.agree = Boolean(liveResult?.errorCode) === (validation.codes.length > 0) &&
      (heightDeltaFt === null || Math.abs(heightDeltaFt) < 1);
    diff.explanation = classify(diff);
    return diff;
  } catch {
    return null;
  }
}

const SEEN = new Set<string>();

/**
 * Log a disagreement once per distinct site+point, so a cursor drag does not
 * flood the console with the same finding.
 */
export function logShadowDiff(diff: ShadowDiff | null, label = 'TalonFit'): void {
  if (!diff || diff.agree) return;
  try {
    const key = `${label}|${diff.at?.lat?.toFixed(5)},${diff.at?.lon?.toFixed(5)}|${diff.live.errorCode}|${diff.v2.codes.join(',')}`;
    if (SEEN.has(key)) return;
    SEEN.add(key);
    console.info(
      `[SHADOW ${label}] ${diff.jurisdiction || 'unknown jurisdiction'} @ ${diff.at?.lat?.toFixed(5)}, ${diff.at?.lon?.toFixed(5)}\n` +
        `  live: ${diff.live.errorCode || 'ok'} · max ${diff.live.maxHeightFt ?? '—'} ft (setback applied ${diff.live.setbackApplied ?? '—'} ft)\n` +
        `  v2  : ${diff.v2.codes.join(', ') || 'ok'} · max ${diff.v2.maxHeightFt.toFixed(1)} ft · rung ${diff.v2.rung} · binding ${diff.v2.bindingConstraint} · edges ${diff.v2.edgeClassification}\n` +
        `  ${diff.explanation}`
    );
  } catch {
    /* a diagnostic must never break the caller */
  }
}

/** Reset the dedupe cache — used by tests. */
export function __resetShadowCache(): void {
  SEEN.clear();
  BUFFER.length = 0;
}

/* ------------------------------------------------------------------ *
 * Collection
 *
 * A console line only helps someone with devtools open. Disagreements are
 * buffered in memory and persisted (deduped, fire-and-forget) so the cutover
 * decision can be made from real usage rather than from argument.
 * ------------------------------------------------------------------ */

const BUFFER: ShadowDiff[] = [];
const BUFFER_CAP = 300;
let persistFn: ((diff: ShadowDiff, surface: string) => void) | null = null;

/** Install the persistence sink once, at app start. Optional by design. */
export function setShadowPersister(fn: ((diff: ShadowDiff, surface: string) => void) | null): void {
  persistFn = fn;
}

export function getShadowBuffer(): ShadowDiff[] {
  return BUFFER.slice();
}

/**
 * The one call site helper: compare, log, buffer, persist. Returns the diff so
 * a caller can use it, but callers are expected to ignore it — this must never
 * influence what the user sees while the live engine is still authoritative.
 */
export function recordShadow(
  args: Parameters<typeof shadowComparePoint>[0] & { surface?: string }
): ShadowDiff | null {
  try {
    const surface = args.surface || 'TalonFit';
    const diff = shadowComparePoint(args);
    if (!diff || diff.agree) return diff;

    const key = `${surface}|${diff.at?.lat?.toFixed(5)},${diff.at?.lon?.toFixed(5)}|${diff.live.errorCode}|${diff.v2.codes.join(',')}`;
    const isNew = !SEEN.has(key);

    logShadowDiff(diff, surface);

    if (isNew) {
      BUFFER.push(diff);
      if (BUFFER.length > BUFFER_CAP) BUFFER.shift();
      try {
        persistFn?.(diff, surface);
      } catch {
        /* persistence must never break the live path */
      }
    }
    return diff;
  } catch {
    return null;
  }
}

export interface ShadowSummary {
  total: number;
  agreements: number;
  liveBlockedV2Allows: number;
  v2BlocksLiveAllows: number;
  v2Taller: number;
  v2Shorter: number;
  meanAbsDeltaFt: number;
}

/** Roll a batch of diffs into the numbers that decide whether to switch over. */
export function summarizeShadow(diffs: Array<ShadowDiff | null>): ShadowSummary {
  const real = diffs.filter(Boolean) as ShadowDiff[];
  let liveBlockedV2Allows = 0;
  let v2BlocksLiveAllows = 0;
  let v2Taller = 0;
  let v2Shorter = 0;
  let deltaSum = 0;
  let deltaCount = 0;

  for (const d of real) {
    const liveBlocked = Boolean(d.live.errorCode);
    const v2Blocked = d.v2.codes.length > 0;
    if (liveBlocked && !v2Blocked) liveBlockedV2Allows++;
    if (!liveBlocked && v2Blocked) v2BlocksLiveAllows++;
    if (d.heightDeltaFt !== null) {
      if (d.heightDeltaFt >= 1) v2Taller++;
      else if (d.heightDeltaFt <= -1) v2Shorter++;
      deltaSum += Math.abs(d.heightDeltaFt);
      deltaCount++;
    }
  }

  return {
    total: real.length,
    agreements: real.filter((d) => d.agree).length,
    liveBlockedV2Allows,
    v2BlocksLiveAllows,
    v2Taller,
    v2Shorter,
    meanAbsDeltaFt: deltaCount ? deltaSum / deltaCount : 0,
  };
}
