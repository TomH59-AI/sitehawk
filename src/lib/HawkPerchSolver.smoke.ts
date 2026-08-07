/**
 * HawkPerchSolver v2 smoke tests — proves the bug fixes AND the
 * grader-not-bouncer doctrine (nothing gets "turned down", it gets ranked).
 *
 * Run: npx esbuild src/lib/HawkPerchSolver.smoke.ts --bundle --platform=node \
 *        --format=esm --outfile=/tmp/hps.mjs && node /tmp/hps.mjs
 */
import { HawkPerchSolver, SolverConfig, Point } from './HawkPerchSolver';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name} ${detail}`); }
  else      { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

// 300 x 300 ft rectangle. Edge 0 (bottom) = road frontage.
const rect300: Point[] = [
  { x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 },
];
const edges300 = [
  { type: 'front' as const },
  { type: 'side' as const },
  { type: 'rear' as const },
  { type: 'side' as const },
];
const base: SolverConfig = {
  parcelCoords: rect300,
  edgeSpecs: edges300,
  setbacks: { front: 50, side: 25, rear: 25 },
  maxHeightLimit: 199,
  fallZone: { mode: 'percent', value: 1.0 },
};

console.log('\n[1] Front setback bug fix — old code passed this point (30 ft >= side 25).');
{
  const s = new HawkPerchSolver(base);
  const v = s.validateLocation({ x: 150, y: 30 }, 100);
  check('cursor 30 ft off frontage is ERR_STBK', !v.valid && v.codes.includes('ERR_STBK'),
    `codes=${JSON.stringify(v.codes)}`);
}

console.log('\n[2] ERR_STBK is now reachable; side violation labeled correctly.');
{
  const s = new HawkPerchSolver(base);
  const v = s.validateLocation({ x: 10, y: 150 }, 50);
  check('10 ft off side line -> ERR_STBK', v.codes.includes('ERR_STBK'));
}

console.log('\n[3] District cap enforced — M=0.5 geometry says 300, cap says 199.');
{
  const s = new HawkPerchSolver({ ...base, fallZone: { mode: 'percent', value: 0.5 } });
  const g = s.gradePoint({ x: 150, y: 150 });
  check('hMax capped at 199', g.maxAchievableHeight === 199, `hMax=${g.maxAchievableHeight}`);
  check('rung = 199', g.rung === 199);
}

console.log('\n[4] Optimizer finds center of clean square, M=1.0 -> ~150 ft, rung 150.');
{
  const s = new HawkPerchSolver(base);
  const r = s.findBestSite();
  check('best hMax ~150', Math.abs(r.best.maxAchievableHeight - 150) < 2,
    `hMax=${r.best.maxAchievableHeight} at (${r.best.point.x.toFixed(1)}, ${r.best.point.y.toFixed(1)})`);
  check('rung 150, ladderPoints 28', r.best.rung === 150 && HawkPerchSolver.ladderPoints(r.best.rung) === 28);
  check('headroomRatio sane', r.headroomRatio > 0 && r.headroomRatio <= 1, `ratio=${r.headroomRatio}`);
}

console.log('\n[5] THE PE RESCUE — tight 120x120 parcel.');
{
  const tight: Point[] = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 120 }, { x: 0, y: 120 }];
  const cfgFail: SolverConfig = {
    parcelCoords: tight,
    setbacks: { front: 20, side: 20, rear: 20 },
    maxHeightLimit: 199,
    fallZone: { mode: 'percent', value: 1.0 },
  };
  const sFail = new HawkPerchSolver(cfgFail);
  const rFail = sFail.findBestSite();
  check('100% fall zone: FAIL rung (hMax ~60)', rFail.best.rung === 'FAIL',
    `hMax=${rFail.best.maxAchievableHeight}`);
  check('...but still graded, not rejected (0 ladder pts)',
    HawkPerchSolver.ladderPoints(rFail.best.rung) === 0);

  // Same parcel, PE-certified 40 ft collapse radius (breakpoint path):
  const sPE = new HawkPerchSolver({ ...cfgFail, fallZone: { mode: 'certified_radius', value: 40 } });
  const rPE = sPE.findBestSite();
  check('certified radius: SAME parcel now clears 199', rPE.best.maxAchievableHeight === 199,
    `hMax=${rPE.best.maxAchievableHeight}, rung=${rPE.best.rung}`);
}

console.log('\n[6] OPTIMIZER BUYS BACK A RUNG — 300x400 parcel, rear abuts residential (Brevard-style 2xH), 110% fall zone.');
{
  const deep: Point[] = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }];
  const s = new HawkPerchSolver({
    parcelCoords: deep,
    edgeSpecs: [
      { type: 'front' }, { type: 'side' },
      { type: 'rear', abutsResidential: true }, { type: 'side' },
    ],
    setbacks: { front: 50, side: 25, rear: 25 },
    maxHeightLimit: 199,
    fallZone: { mode: 'percent', value: 1.1 },
    residentialSeparation: { mode: 'height_multiple', value: 2.0 },
  });
  const center = s.gradePoint({ x: 150, y: 200 });
  const r = s.findBestSite();
  // Analytic optimum: (400-y)/2 = y/1.1 -> y ~= 141.9, hMax ~= 129
  check('parcel center is only ~100 (residential drag)', center.maxAchievableHeight < 105,
    `center hMax=${center.maxAchievableHeight}`);
  check('optimizer shifts toward frontage, clears 120 rung',
    r.best.rung === 120 && r.best.maxAchievableHeight > 125,
    `best hMax=${r.best.maxAchievableHeight} at y=${r.best.point.y.toFixed(1)} (analytic ~141.9 -> ~129)`);
}

console.log('\n[7] Existing-tower 1500 ft separation.');
{
  const s = new HawkPerchSolver({ ...base, existingTowers: [{ point: { x: 1000, y: 150 }, buffer: 1500 }] });
  const v = s.validateLocation({ x: 150, y: 150 }, 100);
  check('ERR_TWR_SEP fires', v.codes.includes('ERR_TWR_SEP'), `codes=${JSON.stringify(v.codes)}`);
}

console.log('\n[8] Housekeeping: outside-parcel, closed-ring tolerance, default-edge flag.');
{
  const s = new HawkPerchSolver(base);
  check('outside -> ERR_EXT_P', s.validateLocation({ x: -50, y: 150 }, 100).codes.includes('ERR_EXT_P'));

  const closed = new HawkPerchSolver({ ...base, parcelCoords: [...rect300, rect300[0]], edgeSpecs: undefined });
  const g = closed.gradePoint({ x: 150, y: 150 });
  check('closed ring tolerated + default_side flag set',
    g.inParcel && g.edgeClassification === 'default_side');
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (fail) throw new Error(`${fail} test(s) failed`);
