/**
 * Residential adjacency tests.
 *
 * The two failure modes that matter:
 *  - Flagging an edge that does NOT abut residential (e.g. a house across the
 *    street) — over-restricts, kills viable height for no reason.
 *  - Missing an edge that DOES abut residential — the permissive failure that
 *    puts an unbuildable number in a deliverable.
 */
import { isResidentialParcel, resolveZoneClass, residentialEdgeIndices, computeResidentialAdjacency, outerRings } from './residentialAdjacency';
import { projectParcelToFeet, Point } from './HawkPerchSolver';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name} ${detail}`); }
  else      { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

// Subject: 300x300. Ring order: (0,0)->(300,0)->(300,300)->(0,300).
// Edge 0 = south, 1 = east, 2 = north, 3 = west.
const subject: Point[] = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }];
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

console.log('\n[R1] Classification mirrors resolveZoneClass exactly.');
{
  check('R-1 zoning is residential', isResidentialParcel({ zoningCode: 'R-1' }));
  check('SF-10 is residential', isResidentialParcel({ zoningCode: 'SF-10' }));
  check('MH (mobile home) is residential', isResidentialParcel({ zoningCode: 'MH' }));
  check('useCode 1200 is residential', isResidentialParcel({ useCode: 1200 }));
  check('vacant-residential 8001 is residential', isResidentialParcel({ useCode: 8001 }));
  check('C-2 is not', !isResidentialParcel({ zoningCode: 'C-2' }));
  check('useCode 2100 (commercial) is not', !isResidentialParcel({ useCode: 2100 }));
  check('AG is not', !isResidentialParcel({ zoningCode: 'AG-1' }));
  check('useCode wins over zoning string', resolveZoneClass({ useCode: 2100, zoningCode: 'R-1' }) === 'COMM');
  check('empty record is not residential', !isResidentialParcel({}));
}

console.log('\n[R2] Shared boundary flags exactly that edge.');
{
  // Residential neighbour sharing the full east line (x=300).
  const r = residentialEdgeIndices(subject, [rect(300, 0, 600, 300)]);
  check('east edge (1) flagged', r.indices.length === 1 && r.indices[0] === 1, JSON.stringify(r.indices));
  // Two residential neighbours, east and north.
  const r2 = residentialEdgeIndices(subject, [rect(300, 0, 600, 300), rect(0, 300, 300, 600)]);
  check('east + north flagged', r2.indices.join(',') === '1,2', JSON.stringify(r2.indices));
}

console.log('\n[R3] Across the street is NOT abutting.');
{
  // A 60 ft right-of-way between the subject and the neighbour.
  const r = residentialEdgeIndices(subject, [rect(360, 0, 660, 300)]);
  check('no edge flagged across a 60 ft ROW', r.indices.length === 0, JSON.stringify(r.indices));
}

console.log('\n[R4] Winding order and closed rings do not change the answer.');
{
  const reversed = [...subject].reverse();
  const r = residentialEdgeIndices(reversed, [rect(300, 0, 600, 300)]);
  check('reversed subject still flags exactly one edge', r.indices.length === 1, JSON.stringify(r.indices));
  const closed = residentialEdgeIndices([...subject, subject[0]], [rect(300, 0, 600, 300)]);
  check('closed ring flags edge 1', closed.indices.join(',') === '1', JSON.stringify(closed.indices));
}

console.log('\n[R5] Degenerate inputs never throw.');
{
  check('empty subject', residentialEdgeIndices([], [rect(0, 0, 10, 10)]).indices.length === 0);
  check('no neighbours', residentialEdgeIndices(subject, []).indices.length === 0);
  check('2-point neighbour ring ignored', residentialEdgeIndices(subject, [[{ x: 300, y: 0 }, { x: 600, y: 0 }]]).indices.length === 0);
  check('zero-length subject edge skipped', residentialEdgeIndices([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }], [rect(300, 0, 600, 300)]).indices.length >= 1);
}

console.log('\n[R6] outerRings handles GeoJSON shapes.');
{
  const poly = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
  const multi = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[2, 2], [3, 2], [3, 3], [2, 2]]]] };
  check('Polygon -> 1 ring', outerRings(poly).length === 1);
  check('MultiPolygon -> 2 rings', outerRings(multi).length === 2);
  check('Feature unwraps', outerRings({ type: 'Feature', geometry: poly }).length === 1);
  check('garbage -> []', outerRings({ type: 'Nope' }).length === 0 && outerRings(null).length === 0);
}

console.log('\n[R7] End to end in lat/lon — the Realie shape, subject excluded.');
{
  // Subject: ~300 ft square near Mims. Neighbour to the EAST shares the line.
  const ring: Array<[number, number]> = [
    [-80.8621, 28.7081], [-80.86116, 28.7081], [-80.86116, 28.70892], [-80.8621, 28.70892],
  ];
  const { points, toFeet } = projectParcelToFeet(ring);
  const eastNeighbor = {
    zoningCode: 'R-1',
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[[[-80.86116, 28.7081], [-80.86022, 28.7081], [-80.86022, 28.70892], [-80.86116, 28.70892], [-80.86116, 28.7081]]]],
    },
  };
  const selfRecord = {
    zoningCode: 'R-1', // even if the subject itself is zoned residential…
    geometry: { type: 'Polygon', coordinates: [[...ring.map((c) => [...c]), [...ring[0]]]] },
  };
  const commercialNorth = {
    zoningCode: 'C-2',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-80.8621, 28.70892], [-80.86116, 28.70892], [-80.86116, 28.70974], [-80.8621, 28.70974], [-80.8621, 28.70892]]],
    },
  };

  const adj = computeResidentialAdjacency({ subjectRing: points, neighbors: [selfRecord, eastNeighbor, commercialNorth], toFeet });
  check('subject parcel excluded from its own neighbours', adj.neighborsChecked === 2, `checked=${adj.neighborsChecked}`);
  check('one residential neighbour found', adj.residentialNeighbors === 1, `res=${adj.residentialNeighbors}`);
  check('exactly one edge flagged (east)', adj.indices.length === 1, JSON.stringify(adj.indices));
  check('commercial neighbour does not flag its edge', !adj.indices.includes(2) || adj.indices.length === 1);
}

console.log('\n[R8] THE PAYOFF — flagged edges change the solved height like Brevard says they should.');
{
  const { HawkPerchSolver } = await import('./HawkPerchSolver');
  const cfg = (edgeSpecs: any) => ({
    parcelCoords: subject,
    edgeSpecs,
    setbacks: { front: 50, side: 50, rear: 50 },
    maxHeightLimit: 199,
    fallZone: { mode: 'percent' as const, value: 1.0 },
    residentialSeparation: { mode: 'height_multiple' as const, value: 2.0 },
  });
  const adj = residentialEdgeIndices(subject, [rect(300, 0, 600, 300)]);
  const specs = subject.map((_, i) => ({ type: 'side' as const, abutsResidential: adj.indices.includes(i) }));
  const flagged = new HawkPerchSolver(cfg(specs)).findBestSite();
  const blind = new HawkPerchSolver(cfg(undefined)).findBestSite();
  check('blind solve reaches 150 (rule silently dropped)', Math.abs(blind.best.maxAchievableHeight - 150) < 2,
    `blind=${blind.best.maxAchievableHeight.toFixed(1)}`);
  check('flagged solve is LOWER — the 2xH drag is real', flagged.best.maxAchievableHeight < blind.best.maxAchievableHeight,
    `flagged=${flagged.best.maxAchievableHeight.toFixed(1)} vs blind=${blind.best.maxAchievableHeight.toFixed(1)}`);
  // Analytic: optimum where east drag d/2 = min(other dists)… best shifts west.
  // x from east line = 300-x_pos; H = min((300-x)/2, x, y, 300-y). Optimum x=100: H=100.
  check('flagged optimum ~100 ft (hand-derived)', Math.abs(flagged.best.maxAchievableHeight - 100) < 2,
    `flagged=${flagged.best.maxAchievableHeight.toFixed(1)} (analytic 100)`);
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (fail) throw new Error(`${fail} adjacency test(s) failed`);
