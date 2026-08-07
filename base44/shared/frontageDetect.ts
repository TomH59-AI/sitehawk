/**
 * Frontage detection — types every parcel edge as front / side / rear from
 * mapped road centerlines.
 *
 * This is what unlocks per-edge setbacks. Without it the solver has to treat
 * every property line as a side line and the front setback (usually the
 * strictest, often twice the side) never applies. Guessing wrong in the
 * PERMISSIVE direction is the dangerous failure, so when the roads are
 * ambiguous this returns default_side and says so rather than asserting a
 * frontage it cannot defend.
 *
 * Corner lots are handled explicitly: a lot with street frontage on two sides
 * genuinely carries TWO front setbacks under most codes. Calling the second
 * street a "side" would understate the requirement and manufacture buildable
 * area that does not exist.
 */

import type { Point, EdgeSpec, EdgeType } from './hawkPerchSolver';

export interface RoadLine {
  /** Polyline in the same planar frame (feet) as the parcel. */
  coords: Point[];
  name?: string;
  klass?: string;
}

export interface EdgeDiagnostic {
  index: number;
  type: EdgeType;
  roadDistFt: number;
  roadName?: string | null;
  lengthFt: number;
}

export interface FrontageResult {
  edgeSpecs: EdgeSpec[];
  confidence: 'high' | 'medium' | 'low';
  method: 'road_centerline' | 'default_side';
  frontEdgeIndices: number[];
  rearEdgeIndices: number[];
  diagnostics: EdgeDiagnostic[];
  note: string;
}

export interface FrontageOptions {
  /** Beyond this, the parcel has no direct frontage (easement access). */
  maxFrontageDistFt?: number;
  /** A second edge within this margin of the nearest is a second street frontage. */
  cornerToleranceFt?: number;
  /** Edge indices known to abut residential zoning, merged into the result. */
  residentialEdgeIndices?: number[];
}

const DEFAULTS = {
  maxFrontageDistFt: 250,
  cornerToleranceFt: 40,
};

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToRoads(p: Point, roads: RoadLine[]): { dist: number; name: string | null } {
  let best = Infinity;
  let name: string | null = null;
  for (const road of roads) {
    for (let i = 0; i < road.coords.length - 1; i++) {
      const d = distanceToSegment(p, road.coords[i], road.coords[i + 1]);
      if (d < best) {
        best = d;
        name = road.name || null;
      }
    }
  }
  return { dist: best, name };
}

function dedupeRing(coords: Point[]): Point[] {
  const pts = (coords || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return pts;
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) return pts.slice(0, -1);
  return pts;
}

function allSide(count: number, note: string, residential: number[]): FrontageResult {
  const edgeSpecs: EdgeSpec[] = Array.from({ length: Math.max(0, count) }, (_, i) => ({
    type: 'side' as EdgeType,
    ...(residential.includes(i) ? { abutsResidential: true } : {}),
  }));
  return {
    edgeSpecs,
    confidence: 'low',
    method: 'default_side',
    frontEdgeIndices: [],
    rearEdgeIndices: [],
    diagnostics: [],
    note,
  };
}

/**
 * Type each parcel edge from nearby road centerlines. Parcel and roads must
 * already be in the same planar frame, in feet (see projectParcelToFeet).
 */
export function typeParcelEdges(
  parcelCoords: Point[],
  roads: RoadLine[],
  options: FrontageOptions = {}
): FrontageResult {
  const maxDist = options.maxFrontageDistFt ?? DEFAULTS.maxFrontageDistFt;
  const cornerTol = options.cornerToleranceFt ?? DEFAULTS.cornerToleranceFt;
  const residential = options.residentialEdgeIndices || [];

  const poly = dedupeRing(parcelCoords);
  if (poly.length < 3) {
    return allSide(poly.length, 'Parcel ring has fewer than three vertices — edges cannot be typed.', residential);
  }

  const usableRoads = (roads || []).filter((r) => r?.coords?.length >= 2);
  if (!usableRoads.length) {
    return allSide(poly.length, 'No mapped roads near this parcel — every line is treated as a side line.', residential);
  }

  const edges = poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length], index: i }));

  // Sample the INTERIOR of each edge. Endpoints are shared with the neighbouring
  // edge, so measuring from them makes both edges look equally close to a road
  // that only touches their shared corner — which would fake a corner lot on
  // every ordinary parcel.
  const measured = edges.map((e) => {
    let dist = Infinity;
    let name: string | null = null;
    for (const t of [0.25, 0.5, 0.75]) {
      const s = { x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y + (e.b.y - e.a.y) * t };
      const r = distanceToRoads(s, usableRoads);
      if (r.dist < dist) {
        dist = r.dist;
        name = r.name;
      }
    }
    return {
      index: e.index,
      dist,
      name,
      lengthFt: Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y),
      dir: { x: e.b.x - e.a.x, y: e.b.y - e.a.y },
    };
  });

  const nearest = Math.min(...measured.map((m) => m.dist));
  if (!Number.isFinite(nearest) || nearest > maxDist) {
    return allSide(
      poly.length,
      `Nearest mapped road is ${Number.isFinite(nearest) ? Math.round(nearest) : 'over 1000'} ft away — no direct frontage, so every line is treated as a side line. Confirm access and frontage manually.`,
      residential
    );
  }

  // Front: the nearest edge, plus any other edge within the corner tolerance —
  // a genuine second street frontage, which carries its own front setback.
  const frontIdx = measured.filter((m) => m.dist <= nearest + cornerTol).map((m) => m.index);

  // Rear: the edge farthest from a road that runs roughly parallel to a front
  // edge. The parallelism test keeps a long flanking side line from being
  // mistyped as the rear on an irregular lot.
  const frontDirs = measured.filter((m) => frontIdx.includes(m.index)).map((m) => m.dir);
  const isParallel = (d: { x: number; y: number }) =>
    frontDirs.some((f) => {
      const la = Math.hypot(f.x, f.y);
      const lb = Math.hypot(d.x, d.y);
      if (la === 0 || lb === 0) return false;
      return Math.abs((f.x * d.x + f.y * d.y) / (la * lb)) > 0.85;
    });

  const notFront = measured.filter((m) => !frontIdx.includes(m.index));
  const parallelPool = notFront.filter((m) => isParallel(m.dir));
  const pool = parallelPool.length ? parallelPool : notFront;
  const rearIdx = pool.length ? [pool.reduce((best, m) => (m.dist > best.dist ? m : best)).index] : [];

  const edgeSpecs: EdgeSpec[] = measured.map((m) => {
    const type: EdgeType = frontIdx.includes(m.index) ? 'front' : rearIdx.includes(m.index) ? 'rear' : 'side';
    return { type, ...(residential.includes(m.index) ? { abutsResidential: true } : {}) };
  });

  // Confidence: a clean read is a road tight against one edge and clearly
  // farther from every other edge.
  const otherDists = notFront.map((m) => m.dist);
  const gap = otherDists.length ? Math.min(...otherDists) - nearest : Infinity;
  const confidence: FrontageResult['confidence'] =
    nearest <= 120 && gap >= 60 ? 'high' : gap >= 20 ? 'medium' : 'low';

  const frontName = measured.find((m) => m.index === frontIdx[0])?.name;
  const base =
    frontIdx.length > 1
      ? `Corner lot — ${frontIdx.length} street frontages detected, each carrying the front setback.`
      : `Frontage detected ${Math.round(nearest)} ft from ${frontName || 'the nearest mapped road'}.`;

  return {
    edgeSpecs,
    confidence,
    method: 'road_centerline',
    frontEdgeIndices: frontIdx,
    rearEdgeIndices: rearIdx,
    diagnostics: measured.map((m) => ({
      index: m.index,
      type: edgeSpecs[m.index].type,
      roadDistFt: m.dist,
      roadName: m.name,
      lengthFt: m.lengthFt,
    })),
    note:
      confidence === 'low'
        ? `${base} Confidence is low — confirm the frontage before relying on the front setback.`
        : base,
  };
}

/**
 * Convert an Overpass/GeoJSON road payload (lon/lat) into the parcel's planar
 * frame using the projector returned by projectParcelToFeet.
 */
export function projectRoads(
  roads: Array<{ coords: Array<[number, number]>; name?: string; klass?: string }>,
  toFeet: (lon: number, lat: number) => Point
): RoadLine[] {
  return (roads || [])
    .map((r) => ({
      coords: (r.coords || []).map(([lon, lat]) => toFeet(lon, lat)),
      name: r.name,
      klass: r.klass,
    }))
    .filter((r) => r.coords.length >= 2);
}
