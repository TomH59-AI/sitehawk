/**
 * HawkPerchSolver v2 — ADVERSARIAL HARDENING SUITE.
 *
 * The smoke tests prove the spec. This suite tries to break the solver on the
 * things a real parcel will actually throw at it: concave lots, slivers,
 * degenerate rings, boundary points, zero/missing config, and the modes the
 * smoke tests never exercise. Anything that fails here is a bug that would have
 * reached a subscriber's SCIP.
 */
import { HawkPerchSolver, SolverConfig, Point, projectParcelToFeet, RUNGS } from './HawkPerchSolver';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name} ${detail}`); }
  else      { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

const sq = (n: number): Point[] => [{ x: 0, y: 0 }, { x: n, y: 0 }, { x: n, y: n }, { x: 0, y: n }];
const cfg = (over: Partial<SolverConfig> = {}): SolverConfig => ({
  parcelCoords: sq(300),
  setbacks: { front: 25, side: 25, rear: 25 },
  maxHeightLimit: 199,
  fallZone: { mode: 'percent', value: 1.0 },
  ...over,
});

console.log('\n[H1] A clean, valid point reports NO violations (no false positives).');
{
  const s = new HawkPerchSolver(cfg());
  const g = s.gradePoint({ x: 150, y: 150 });
  check('violations empty at a good point', g.violations.length === 0,
    `violations=${JSON.stringify(g.violations.map((v) => v.code))}`);
  check('binding constraint is the fall zone at 150 ft', g.bindingConstraint === 'fall_zone',
    `binding=${g.bindingConstraint}, hMax=${g.maxAchievableHeight}`);
}

console.log('\n[H2] Concave (L-shaped) parcel — optimizer must stay inside the polygon.');
{
  // 400x400 with the top-right 200x200 quadrant removed.
  const L: Point[] = [
    { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 },
    { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 },
  ];
  const s = new HawkPerchSolver(cfg({ parcelCoords: L }));
  const r = s.findBestSite();
  check('best point is inside the L', r.best.inParcel, `pt=(${r.best.point.x.toFixed(1)}, ${r.best.point.y.toFixed(1)})`);
  check('notch is correctly outside', !s.isInParcel({ x: 300, y: 300 }));
  check('inside the lower arm is in-parcel', s.isInParcel({ x: 300, y: 100 }));
  check('best height beats the notch corner', r.best.maxAchievableHeight >= s.gradePoint({ x: 199, y: 199 }).maxAchievableHeight);
}

console.log('\n[H3] Sliver parcel — a 30 ft wide strip must not be missed by the coarse grid.');
{
  const sliver: Point[] = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 30 }, { x: 0, y: 30 }];
  const s = new HawkPerchSolver(cfg({ parcelCoords: sliver, setbacks: { front: 5, side: 5, rear: 5 } }));
  const r = s.findBestSite();
  check('finds a point inside the sliver', r.best.inParcel,
    `pt=(${r.best.point.x.toFixed(1)}, ${r.best.point.y.toFixed(1)}) hMax=${r.best.maxAchievableHeight.toFixed(1)}`);
  check('grades it FAIL (15 ft max) but does not crash', r.best.rung === 'FAIL',
    `hMax=${r.best.maxAchievableHeight.toFixed(1)}`);
}

console.log('\n[H4] Degenerate rings must not throw.');
{
  const empty = new HawkPerchSolver(cfg({ parcelCoords: [] }));
  check('empty ring: graded, not thrown', empty.gradePoint({ x: 0, y: 0 }).maxAchievableHeight === 0);
  check('empty ring: findBestSite returns', empty.findBestSite().best.rung === 'FAIL');

  const twoPt = new HawkPerchSolver(cfg({ parcelCoords: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }));
  check('2-point ring: no crash', twoPt.gradePoint({ x: 5, y: 5 }).inParcel === false);

  const collinear = new HawkPerchSolver(cfg({ parcelCoords: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }] }));
  check('collinear ring: no crash', collinear.gradePoint({ x: 10, y: 0 }).maxAchievableHeight === 0);
}

console.log('\n[H5] Zero / missing config values must not produce NaN or Infinity.');
{
  const zeroM = new HawkPerchSolver(cfg({ fallZone: { mode: 'percent', value: 0 } }));
  const g = zeroM.gradePoint({ x: 150, y: 150 });
  check('M=0 falls back to the height cap, not Infinity', g.maxAchievableHeight === 199, `hMax=${g.maxAchievableHeight}`);

  const noCap = new HawkPerchSolver(cfg({ maxHeightLimit: 0 }));
  const r = noCap.findBestSite();
  check('cap 0: headroomRatio is 0, not NaN', r.headroomRatio === 0 && Number.isFinite(r.headroomRatio));

  const noSetbacks = new HawkPerchSolver({ ...cfg(), setbacks: {} as any });
  check('missing setbacks treated as 0, still grades', noSetbacks.gradePoint({ x: 150, y: 150 }).maxAchievableHeight === 150);
}

console.log('\n[H6] certified_radius that does NOT fit must fail, not silently clear the cap.');
{
  const tight: Point[] = sq(60);
  const s = new HawkPerchSolver(cfg({ parcelCoords: tight, setbacks: { front: 5, side: 5, rear: 5 }, fallZone: { mode: 'certified_radius', value: 40 } }));
  const g = s.gradePoint({ x: 30, y: 30 }); // nearest edge only 30 ft, radius needs 40
  check('radius > available -> hMax 0', g.maxAchievableHeight === 0, `hMax=${g.maxAchievableHeight}`);
  check('and ERR_FZ_S is reported', s.validateLocation({ x: 30, y: 30 }, 199).codes.includes('ERR_FZ_S'));
}

console.log('\n[H7] residentialSeparation fixed_ft mode (not covered by the smoke tests).');
{
  const s = new HawkPerchSolver(cfg({
    edgeSpecs: [{ type: 'front' }, { type: 'side' }, { type: 'rear', abutsResidential: true }, { type: 'side' }],
    residentialSeparation: { mode: 'fixed_ft', value: 250 },
  }));
  const near = s.gradePoint({ x: 150, y: 200 }); // 100 ft from the residential rear line
  const far = s.gradePoint({ x: 150, y: 40 });   // 260 ft from it
  check('inside a fixed 250 ft residential buffer -> 0', near.maxAchievableHeight === 0, `hMax=${near.maxAchievableHeight}`);
  check('outside it -> buildable', far.maxAchievableHeight > 0, `hMax=${far.maxAchievableHeight.toFixed(1)}`);
}

console.log('\n[H8] Several residential edges — the tightest one must bind.');
{
  const s = new HawkPerchSolver(cfg({
    parcelCoords: sq(400),
    edgeSpecs: [
      { type: 'front' }, { type: 'side', abutsResidential: true },
      { type: 'rear', abutsResidential: true }, { type: 'side' },
    ],
    residentialSeparation: { mode: 'height_multiple', value: 2.0 },
  }));
  // At (300, 100): 100 ft from the right side edge (x=400), 300 ft from rear.
  const g = s.gradePoint({ x: 300, y: 100 });
  check('tightest residential edge binds (100/2 = 50)', Math.abs(g.maxAchievableHeight - 50) < 0.01,
    `hMax=${g.maxAchievableHeight}`);
  check('binding constraint named correctly', g.bindingConstraint === 'residential_separation', `binding=${g.bindingConstraint}`);
}

console.log('\n[H9] Rung ladder integrity.');
{
  check('RUNGS strictly descending', RUNGS.every((r, i) => i === 0 || r < RUNGS[i - 1]));
  check('ladderPoints monotonic with rung', RUNGS.every((r, i) => i === 0 || HawkPerchSolver.ladderPoints(r) < HawkPerchSolver.ladderPoints(RUNGS[i - 1])));
  check('150 -> 28 (spec-pinned)', HawkPerchSolver.ladderPoints(150) === 28);
  check('FAIL -> 0', HawkPerchSolver.ladderPoints('FAIL') === 0);
  check('exactly 100 is the floor, not FAIL', HawkPerchSolver.rungFor(100) === 100);
  check('99.9 is FAIL', HawkPerchSolver.rungFor(99.9) === 'FAIL');
  check('129 -> 120 (no phantom 125 rung)', HawkPerchSolver.rungFor(129) === 120);
  check('198.9 -> 180, not 199', HawkPerchSolver.rungFor(198.9) === 180);
  check('exactly 199 -> 199', HawkPerchSolver.rungFor(199) === 199);
}

console.log('\n[H10] Boundary and corner points must grade, never throw.');
{
  const s = new HawkPerchSolver(cfg());
  for (const p of [{ x: 0, y: 0 }, { x: 300, y: 300 }, { x: 150, y: 0 }, { x: 0, y: 150 }]) {
    const g = s.gradePoint(p);
    check(`boundary (${p.x},${p.y}) grades without throwing`, Number.isFinite(g.maxAchievableHeight) && g.rung === 'FAIL');
  }
}

console.log('\n[H11] rankTargets orders A / B / C by ladder points.');
{
  const s = new HawkPerchSolver(cfg());
  const ranked = s.rankTargets([{ x: 40, y: 150 }, { x: 150, y: 150 }, { x: 90, y: 150 }]);
  check('3 targets returned, none dropped', ranked.length === 3);
  check('best first', ranked[0].point.x === 150, `order=${ranked.map((r) => r.point.x).join(',')}`);
  check('descending ladder points', ranked[0].ladderPoints >= ranked[1].ladderPoints && ranked[1].ladderPoints >= ranked[2].ladderPoints,
    `pts=${ranked.map((r) => r.ladderPoints).join(',')}`);
}

console.log('\n[H12] Existing towers: only the violated buffer fires.');
{
  const s = new HawkPerchSolver(cfg({
    existingTowers: [
      { point: { x: 5000, y: 5000 }, buffer: 1000 },
      { point: { x: 200, y: 200 }, buffer: 500 },
    ],
  }));
  const v = s.validateLocation({ x: 150, y: 150 }, 100);
  check('one violation, not two', v.violations.filter((x) => x.code === 'ERR_TWR_SEP').length === 1,
    `n=${v.violations.filter((x) => x.code === 'ERR_TWR_SEP').length}`);
  check('far-away tower does not fire', s.validateLocation({ x: 150, y: 150 }, 100).violations.every((x) => (x.actualFt ?? 0) < 1000));
}

console.log('\n[H13] Winding order must not change the answer.');
{
  const cw = new HawkPerchSolver(cfg());
  const ccw = new HawkPerchSolver(cfg({ parcelCoords: [...sq(300)].reverse() }));
  check('same hMax either winding',
    cw.gradePoint({ x: 150, y: 150 }).maxAchievableHeight === ccw.gradePoint({ x: 150, y: 150 }).maxAchievableHeight);
}

console.log('\n[H14] lat/lon projection round-trip stays sub-foot.');
{
  // ~300 ft square near Mims, FL.
  const ring: Array<[number, number]> = [
    [-80.8621, 28.7081], [-80.86116, 28.7081], [-80.86116, 28.70892], [-80.8621, 28.70892],
  ];
  const { points, toFeet, toLngLat } = projectParcelToFeet(ring);
  const w = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const h = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y);
  check('width ~300 ft', Math.abs(w - 300) < 6, `w=${w.toFixed(1)} ft`);
  check('height ~300 ft', Math.abs(h - 300) < 6, `h=${h.toFixed(1)} ft`);
  const back = toLngLat(toFeet(ring[0][0], ring[0][1]));
  check('round-trip < 0.1 ft', Math.abs(back[0] - ring[0][0]) < 1e-7 && Math.abs(back[1] - ring[0][1]) < 1e-7);
}

console.log('\n[H15] Brevard County end-to-end: 199 cap, PE breakpoint rescue on a real-shaped lot.');
{
  const lot: Point[] = [{ x: 0, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 260 }, { x: 0, y: 260 }];
  const brevardStandard: SolverConfig = {
    parcelCoords: lot,
    edgeSpecs: [{ type: 'front' }, { type: 'side' }, { type: 'rear', abutsResidential: true }, { type: 'side' }],
    setbacks: { front: 50, side: 25, rear: 25 },
    maxHeightLimit: 199,
    fallZone: { mode: 'percent', value: 1.1 },       // 110% of full height
    residentialSeparation: { mode: 'height_multiple', value: 2.0 },
  };
  const noPE = new HawkPerchSolver(brevardStandard).findBestSite();
  const withPE = new HawkPerchSolver({ ...brevardStandard, fallZone: { mode: 'certified_radius', value: 55 } }).findBestSite();
  check('without PE the lot is limited', noPE.best.maxAchievableHeight < 120,
    `hMax=${noPE.best.maxAchievableHeight.toFixed(1)} rung=${noPE.best.rung}`);
  check('PE breakpoint rescues real height', withPE.best.maxAchievableHeight > noPE.best.maxAchievableHeight,
    `hMax=${withPE.best.maxAchievableHeight.toFixed(1)} rung=${withPE.best.rung}`);
  check('PE result still respects the residential 2xH drag', withPE.best.maxAchievableHeight <= 199);
}

console.log('\n[H16] Performance — the optimizer must be fast enough for a live cursor.');
{
  const s = new HawkPerchSolver(cfg({ parcelCoords: sq(1000) }));
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) s.findBestSite();
  const ms = (Date.now() - t0) / 5;
  check('findBestSite under 250 ms', ms < 250, `${ms.toFixed(1)} ms/run`);

  const t1 = Date.now();
  for (let i = 0; i < 2000; i++) s.gradePoint({ x: 400 + (i % 100), y: 500 });
  const perGrade = (Date.now() - t1) / 2000;
  check('gradePoint under 0.5 ms (cursor probe)', perGrade < 0.5, `${perGrade.toFixed(3)} ms/point`);
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (fail) throw new Error(`${fail} hardening test(s) failed`);
