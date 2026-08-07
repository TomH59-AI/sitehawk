/**
 * Frontage detection tests. The failure that matters is typing a line as
 * "side" when it is really the frontage — that under-applies the setback and
 * manufactures buildable area. Several cases below target exactly that.
 */
import { typeParcelEdges, projectRoads, RoadLine } from './frontageDetect';
import { projectParcelToFeet, HawkPerchSolver, Point } from './HawkPerchSolver';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name} ${detail}`); }
  else      { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

// 300x300 lot. Edge 0 = bottom (y=0), 1 = right, 2 = top, 3 = left.
const lot: Point[] = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }];
const road = (coords: Array<[number, number]>, name?: string): RoadLine => ({
  coords: coords.map(([x, y]) => ({ x, y })),
  name,
});

console.log('\n[F1] Single street along the bottom.');
{
  const r = typeParcelEdges(lot, [road([[-200, -25], [500, -25]], 'Main St')]);
  check('edge 0 typed front', r.edgeSpecs[0].type === 'front');
  check('edge 2 typed rear', r.edgeSpecs[2].type === 'rear', `types=${r.edgeSpecs.map((e) => e.type).join(',')}`);
  check('edges 1 and 3 are sides', r.edgeSpecs[1].type === 'side' && r.edgeSpecs[3].type === 'side');
  check('high confidence', r.confidence === 'high', `conf=${r.confidence} note="${r.note}"`);
  check('road name surfaced', r.note.includes('Main St'));
}

console.log('\n[F2] Corner lot — two street frontages, both must be front.');
{
  const r = typeParcelEdges(lot, [
    road([[-200, -25], [500, -25]], 'Main St'),
    road([[-25, -200], [-25, 500]], 'Oak Ave'),
  ]);
  check('two front edges detected', r.frontEdgeIndices.length === 2,
    `fronts=${JSON.stringify(r.frontEdgeIndices)} types=${r.edgeSpecs.map((e) => e.type).join(',')}`);
  check('bottom and left are the fronts',
    r.frontEdgeIndices.includes(0) && r.frontEdgeIndices.includes(3));
  check('note calls out the corner lot', /corner lot/i.test(r.note), r.note);
}

console.log('\n[F3] Shared-corner false positive — ONE road must not fake a corner lot.');
{
  // A road that only touches the bottom-left corner region.
  const r = typeParcelEdges(lot, [road([[-400, -30], [500, -30]], 'Main St')]);
  check('exactly one frontage', r.frontEdgeIndices.length === 1,
    `fronts=${JSON.stringify(r.frontEdgeIndices)}`);
}

console.log('\n[F4] No road within range -> default_side, never a guessed frontage.');
{
  const r = typeParcelEdges(lot, [road([[-5000, -5000], [-4000, -4000]], 'Far Rd')]);
  check('method is default_side', r.method === 'default_side');
  check('every edge is side', r.edgeSpecs.every((e) => e.type === 'side'));
  check('confidence low', r.confidence === 'low');
  check('note explains why', /no direct frontage/i.test(r.note), r.note);
}

console.log('\n[F5] No roads at all, and degenerate rings.');
{
  const none = typeParcelEdges(lot, []);
  check('no roads -> default_side', none.method === 'default_side' && none.edgeSpecs.length === 4);
  const tiny = typeParcelEdges([{ x: 0, y: 0 }, { x: 1, y: 1 }], [road([[0, 0], [1, 0]])]);
  check('2-vertex ring does not throw', tiny.method === 'default_side');
  const empty = typeParcelEdges([], []);
  check('empty ring does not throw', empty.edgeSpecs.length === 0);
}

console.log('\n[F6] Residential edge hints merge into the result.');
{
  const r = typeParcelEdges(lot, [road([[-200, -25], [500, -25]], 'Main St')], { residentialEdgeIndices: [2] });
  check('rear edge carries abutsResidential', r.edgeSpecs[2].abutsResidential === true);
  check('front edge does not', !r.edgeSpecs[0].abutsResidential);
}

console.log('\n[F7] Irregular 5-sided lot — rear must be parallel-ish, not just far.');
{
  const irregular: Point[] = [
    { x: 0, y: 0 }, { x: 300, y: 0 }, { x: 340, y: 180 }, { x: 150, y: 320 }, { x: -40, y: 180 },
  ];
  const r = typeParcelEdges(irregular, [road([[-300, -30], [600, -30]], 'Main St')]);
  check('front is the bottom edge', r.edgeSpecs[0].type === 'front', `types=${r.edgeSpecs.map((e) => e.type).join(',')}`);
  check('exactly one rear assigned', r.edgeSpecs.filter((e) => e.type === 'rear').length === 1);
  check('all five edges typed', r.edgeSpecs.length === 5);
}

console.log('\n[F8] Closed ring (first vertex repeated) is tolerated.');
{
  const r = typeParcelEdges([...lot, lot[0]], [road([[-200, -25], [500, -25]], 'Main St')]);
  check('4 edges, not 5', r.edgeSpecs.length === 4, `n=${r.edgeSpecs.length}`);
  check('front still edge 0', r.edgeSpecs[0].type === 'front');
}

console.log('\n[F9] THE PAYOFF — per-edge setbacks change the answer.');
{
  const withFrontage = typeParcelEdges(lot, [road([[-200, -25], [500, -25]], 'Main St')]);
  const cfg = {
    parcelCoords: lot,
    setbacks: { front: 50, side: 25, rear: 25 },
    maxHeightLimit: 199,
    fallZone: { mode: 'percent' as const, value: 1.0 },
  };
  // A point 30 ft off the LEFT side line: legal (side 25), and today's live
  // engine rejects it because it applies max(50,25,25)=50 to every edge.
  const typed = new HawkPerchSolver({ ...cfg, edgeSpecs: withFrontage.edgeSpecs });
  const sidePoint = { x: 30, y: 150 };
  check('30 ft off a SIDE line is legal with per-edge setbacks',
    typed.validateLocation(sidePoint, 30).codes.length === 0,
    `codes=${JSON.stringify(typed.validateLocation(sidePoint, 30).codes)}`);
  // ...but 30 ft off the FRONT line is still a violation.
  check('30 ft off the FRONT line still violates',
    typed.validateLocation({ x: 150, y: 30 }, 30).codes.includes('ERR_STBK'));
  // Untyped (default_side) would wrongly allow the front point.
  const untyped = new HawkPerchSolver(cfg);
  check('untyped default_side would have allowed the front point (why typing matters)',
    !untyped.validateLocation({ x: 150, y: 30 }, 30).codes.includes('ERR_STBK'));
}

console.log('\n[F10] lat/lon roads project into the parcel frame correctly.');
{
  const ring: Array<[number, number]> = [
    [-80.8621, 28.7081], [-80.86116, 28.7081], [-80.86116, 28.70892], [-80.8621, 28.70892],
  ];
  const { points, toFeet } = projectParcelToFeet(ring);
  const roads = projectRoads(
    [{ coords: [[-80.8630, 28.70800], [-80.8600, 28.70800]], name: 'US-1' }],
    toFeet
  );
  const r = typeParcelEdges(points, roads);
  check('projected road is found', r.method === 'road_centerline', `note="${r.note}"`);
  check('a front edge was assigned', r.frontEdgeIndices.length >= 1);
  check('road name carried through', r.note.includes('US-1') || r.frontEdgeIndices.length > 1, r.note);
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (fail) throw new Error(`${fail} frontage test(s) failed`);
