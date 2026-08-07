/**
 * Residential adjacency — which of a parcel's property lines abut residential
 * parcels.
 *
 * This is the input the residential-separation rule actually needs (Brevard's
 * "2x tower height from residential"), and it comes from ADJACENT-PARCEL ZONING
 * — data Realie already returns — not from road geometry. Roads can't tell you
 * what the neighbour is zoned.
 *
 * The residential classification is a copy of resolveZoneClass from
 * realieParcelsInRing, kept byte-compatible on purpose: TalonFit flagging a line
 * as residential while the parcel screen shows the same neighbour as COMM would
 * be two answers to one question.
 */

import type { Point } from './hawkPerchSolver.ts';

/* ------------------------------------------------------------------ *
 * Classification — mirrors realieParcelsInRing.resolveZoneClass
 * ------------------------------------------------------------------ */

const OS_EXPLICIT = new Set([714, 752, 4025, 4027, 4028, 9202]);
const VACANT_MAP: Record<number, string> = {
  8001: 'RES', 8002: 'COMM', 8003: 'IND', 8004: 'OS',
  8007: 'RES', 8008: 'AG', 8009: 'OS', 8010: 'OS', 8011: 'OS',
};

function classifyUseCode(useCode: unknown): string | null {
  if (useCode == null) return null;
  const n = parseInt(String(useCode).replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  if (OS_EXPLICIT.has(n)) return 'OS';
  if (n >= 8000 && n <= 8017) return VACANT_MAP[n] || 'OTHER';
  if (n >= 1000 && n <= 1999) return 'RES';
  if (n >= 2000 && n <= 4999) return 'COMM';
  if (n >= 5000 && n <= 6599) return 'IND';
  if (n >= 7000 && n <= 7999) return 'AG';
  return 'OTHER';
}

function classifyZoningString(z: unknown): string {
  if (!z) return 'OTHER';
  const s = String(z).toUpperCase().trim();
  if (/^(OS|OSC|CON|CONS|CONSERV|OPEN|GREEN|PARK|REC)/.test(s)) return 'OS';
  if (/^(AG|AGR|A[-\s]?\d|A$|EA|FR|RA[-\s]?\d?)/.test(s)) return 'AG';
  if (/^(R|SF|MF|MH|TH|DR|MDR|HDR|LDR)/.test(s)) return 'RES';
  if (/^(C|B|CB|CC|GB|NC|MU|MX|O[-\s]?\d|O$|OF|OP|PO|PD|RT|RETAIL|HOT|HC)/.test(s)) return 'COMM';
  if (/^(I|M|IL|IH|LI|HI|IND|MFG|IP|BP|LM|GM|W|WH)/.test(s)) return 'IND';
  return 'OTHER';
}

export function resolveZoneClass(p: any): string {
  const byUse = classifyUseCode(p?.useCode ?? p?.use_code);
  if (byUse) return byUse;
  return classifyZoningString(p?.zoningCode ?? p?.zoning_code ?? p?.zoning ?? p?.land_use);
}

export function isResidentialParcel(p: any): boolean {
  return resolveZoneClass(p) === 'RES';
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

function dedupeRing(coords: Point[]): Point[] {
  const pts = (coords || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return pts;
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) return pts.slice(0, -1);
  return pts;
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersects = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Extract outer rings from a GeoJSON Polygon / MultiPolygon / Feature. */
export function outerRings(geometry: any): Array<Array<[number, number]>> {
  try {
    if (!geometry) return [];
    if (geometry.type === 'Feature') return outerRings(geometry.geometry);
    if (geometry.type === 'Polygon') {
      const r = geometry.coordinates?.[0];
      return Array.isArray(r) && r.length >= 3 ? [r] : [];
    }
    if (geometry.type === 'MultiPolygon') {
      return (geometry.coordinates || [])
        .map((poly: any) => poly?.[0])
        .filter((r: any) => Array.isArray(r) && r.length >= 3);
    }
    return [];
  } catch {
    return [];
  }
}

export interface AdjacencyResult {
  /** Edge indices of the subject ring (solver indexing) that abut residential. */
  indices: number[];
  /** How many neighbour rings were tested. */
  ringsTested: number;
}

/**
 * Which subject edges abut a residential neighbour.
 *
 * For each edge, three interior sample points are probed a few feet OUTWARD
 * (away from the subject's interior). If a probe lands inside a residential
 * neighbour's ring, that edge abuts residential. Probing outward — rather than
 * measuring raw distance — is what keeps a residential parcel ACROSS THE STREET
 * from flagging the edge: the probe lands in the right-of-way gap, not in the
 * neighbour, which matches how "abuts" reads in an ordinance.
 *
 * Everything is in the subject's planar frame, in feet. probeFt of 12 clears
 * survey noise and boundary-digitisation slivers while staying far inside any
 * genuine neighbour parcel.
 */
export function residentialEdgeIndices(
  subjectRing: Point[],
  residentialRings: Point[][],
  probeFt = 12
): AdjacencyResult {
  const poly = dedupeRing(subjectRing);
  const rings = (residentialRings || []).map(dedupeRing).filter((r) => r.length >= 3);
  const indices: number[] = [];
  if (poly.length < 3 || !rings.length) return { indices, ringsTested: rings.length };

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;

    let abuts = false;
    for (const t of [0.25, 0.5, 0.75]) {
      const mx = a.x + (b.x - a.x) * t;
      const my = a.y + (b.y - a.y) * t;
      // The ring's winding is unknown, so the outward side is determined per
      // sample: whichever normal direction does NOT land inside the subject.
      const plusInside = pointInPolygon({ x: mx + nx * probeFt, y: my + ny * probeFt }, poly);
      const sign = plusInside ? -1 : 1;
      const probe = { x: mx + sign * nx * probeFt, y: my + sign * ny * probeFt };
      if (rings.some((r) => pointInPolygon(probe, r))) {
        abuts = true;
        break;
      }
    }
    if (abuts) indices.push(i);
  }
  return { indices, ringsTested: rings.length };
}

/**
 * Full pipeline for one subject parcel: classify the Realie neighbours, project
 * their rings into the subject frame, and return the abutting edge indices.
 * The subject parcel itself is excluded by skipping any neighbour whose ring
 * contains the subject centroid.
 */
export function computeResidentialAdjacency(args: {
  subjectRing: Point[];
  neighbors: any[];
  toFeet: (lon: number, lat: number) => Point;
}): AdjacencyResult & { residentialNeighbors: number; neighborsChecked: number } {
  const { subjectRing, neighbors, toFeet } = args;
  const poly = dedupeRing(subjectRing);
  const centroid = poly.length
    ? poly.reduce((acc, p) => ({ x: acc.x + p.x / poly.length, y: acc.y + p.y / poly.length }), { x: 0, y: 0 })
    : { x: 0, y: 0 };

  const residentialRings: Point[][] = [];
  let residentialNeighbors = 0;
  let neighborsChecked = 0;

  for (const n of neighbors || []) {
    const geometry = n?.geometry || n?.parcel_geometry || n?.parcelGeometry;
    const rings = outerRings(geometry).map((ring) => ring.map(([lon, lat]) => toFeet(lon, lat)));
    if (!rings.length) continue;
    // Skip the subject itself — its own record comes back in a location search.
    if (rings.some((r) => pointInPolygon(centroid, r))) continue;
    neighborsChecked++;
    if (!isResidentialParcel(n)) continue;
    residentialNeighbors++;
    residentialRings.push(...rings);
  }

  const result = residentialEdgeIndices(poly, residentialRings);
  return { ...result, residentialNeighbors, neighborsChecked };
}
