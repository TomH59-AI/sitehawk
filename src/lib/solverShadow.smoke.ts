/**
 * Shadow-mode tests. The critical property: it must NEVER throw, because it
 * runs inside the live path and a broken diagnostic that takes down the product
 * it is diagnosing is worse than no diagnostic at all.
 */
import { shadowComparePoint, logShadowDiff, summarizeShadow, __resetShadowCache } from './solverShadow';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name} ${detail}`); }
  else      { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

// ~300 ft square near Mims, FL, with the road along the south edge.
const ring: Array<[number, number]> = [
  [-80.8621, 28.7081], [-80.86116, 28.7081], [-80.86116, 28.70892], [-80.8621, 28.70892],
];
const centre: [number, number] = [-80.86163, 28.70851];
const edgeSpecs = [
  { type: 'front' as const },
  { type: 'side' as const },
  { type: 'rear' as const },
  { type: 'side' as const },
];
const BREVARD = {
  jurisdiction: 'Brevard County',
  state: 'FL',
  height_limit_ft: 199,
  pe_fall_zone_allowed: true,
  setback_rule: '2x proposed tower height from residential structures. Breakpoint design with PE certification of fall radius required.',
  section_ref: 'Sec. 62-2422',
};

console.log('\n[S1] Produces a diff and never throws on good input.');
{
  const d = shadowComparePoint({
    parcelRing: ring,
    towerLngLat: centre,
    proposedHeightFt: 199,
    ordinance: BREVARD,
    edgeSpecs,
    liveResult: { errorCode: null, maxAvailableHeight: 150, setbackFt: 50 },
  });
  check('diff returned', d !== null);
  check('v2 height is finite', Number.isFinite(d!.v2.maxHeightFt), `v2=${d!.v2.maxHeightFt.toFixed(1)} ft`);
  check('delta computed', d!.heightDeltaFt !== null, `delta=${d!.heightDeltaFt?.toFixed(1)} ft`);
  check('explanation present', d!.explanation.length > 10, d!.explanation);
  check('jurisdiction carried', d!.jurisdiction === 'Brevard County');
}

console.log('\n[S2] THE HEADLINE CASE — live blocks on the max() setback, v2 allows.');
{
  const d = shadowComparePoint({
    parcelRing: ring,
    towerLngLat: centre,
    proposedHeightFt: 120,
    ordinance: { height_limit_ft: 199 },
    edgeSpecs,
    liveResult: { errorCode: 'ERR_STBK', maxAvailableHeight: 0, setbackFt: 50 },
  });
  check('disagreement detected', d !== null && !d.agree);
  check('explanation names the max() setback cause', /max\(front,side,rear\)/.test(d!.explanation), d!.explanation);
}

console.log('\n[S3] v2 blocks where live allows — a rule the live engine never checks.');
{
  const d = shadowComparePoint({
    parcelRing: ring,
    towerLngLat: [-80.86121, 28.70885], // hard against the NE corner
    proposedHeightFt: 199,
    ordinance: { height_limit_ft: 199, residential_separation_ft: 500 },
    edgeSpecs: [
      { type: 'front' }, { type: 'side' },
      { type: 'rear', abutsResidential: true }, { type: 'side' },
    ],
    liveResult: { errorCode: null, maxAvailableHeight: 199, setbackFt: 25 },
  });
  check('disagreement detected', d !== null && !d.agree, `codes=${JSON.stringify(d?.v2.codes)}`);
  check('explanation says v2 applies rules live does not',
    /v2 applies rules the live engine does not check|LESS height/.test(d!.explanation), d!.explanation);
}

console.log('\n[S4] Never throws on garbage input — returns null instead.');
{
  const cases: Array<[string, any]> = [
    ['empty ring', { parcelRing: [], towerLngLat: centre, proposedHeightFt: 199, liveResult: {} }],
    ['null ring', { parcelRing: null, towerLngLat: centre, proposedHeightFt: 199, liveResult: {} }],
    ['2-point ring', { parcelRing: [[0, 0], [1, 1]], towerLngLat: centre, proposedHeightFt: 199, liveResult: {} }],
    ['NaN point', { parcelRing: ring, towerLngLat: [NaN, NaN], proposedHeightFt: 199, liveResult: {} }],
    ['undefined point', { parcelRing: ring, towerLngLat: undefined, proposedHeightFt: 199, liveResult: {} }],
    ['no live result', { parcelRing: ring, towerLngLat: centre, proposedHeightFt: 199, liveResult: null }],
    ['no ordinance', { parcelRing: ring, towerLngLat: centre, proposedHeightFt: 199, liveResult: {} }],
  ];
  for (const [label, args] of cases) {
    let threw = false;
    let out: any = undefined;
    try { out = shadowComparePoint(args); } catch { threw = true; }
    check(`${label}: no throw`, !threw, threw ? 'THREW' : `returned ${out === null ? 'null' : 'a diff'}`);
  }
  // A meaningless point must return null, not a diff full of NaN that pollutes the log.
  check('NaN point returns null, not a junk diff',
    shadowComparePoint({ parcelRing: ring, towerLngLat: [NaN, NaN], proposedHeightFt: 199, liveResult: {} } as any) === null);
}

console.log('\n[S5] logShadowDiff is safe and dedupes.');
{
  __resetShadowCache();
  const original = console.info;
  let calls = 0;
  console.info = () => { calls++; };
  try {
    const d = shadowComparePoint({
      parcelRing: ring, towerLngLat: centre, proposedHeightFt: 120,
      ordinance: { height_limit_ft: 199 }, edgeSpecs,
      liveResult: { errorCode: 'ERR_STBK', maxAvailableHeight: 0, setbackFt: 50 },
    });
    logShadowDiff(d, 'test');
    logShadowDiff(d, 'test');
    logShadowDiff(d, 'test');
    logShadowDiff(null, 'test');
  } finally {
    console.info = original;
  }
  check('logged exactly once despite 3 calls', calls === 1, `calls=${calls}`);
  let threw = false;
  try { logShadowDiff(undefined as any); logShadowDiff({} as any); } catch { threw = true; }
  check('logging garbage does not throw', !threw);
}

console.log('\n[S6] Summary rolls up the numbers that decide the switch.');
{
  const mk = (liveCode: string | null, liveMax: number, v2Codes: string[], v2Max: number): any => ({
    agree: false,
    heightDeltaFt: v2Max - liveMax,
    live: { errorCode: liveCode, maxHeightFt: liveMax, setbackApplied: 50 },
    v2: { codes: v2Codes, maxHeightFt: v2Max, rung: 120, bindingConstraint: 'fall_zone', edgeClassification: 'explicit' },
    explanation: '',
  });
  const s = summarizeShadow([
    mk('ERR_STBK', 0, [], 140),
    mk(null, 199, ['ERR_STBK'], 0),
    mk(null, 150, [], 160),
    mk(null, 150, [], 130),
    null,
  ]);
  check('total counts only real diffs', s.total === 4, `total=${s.total}`);
  check('live-blocked-v2-allows counted', s.liveBlockedV2Allows === 1);
  check('v2-blocks-live-allows counted', s.v2BlocksLiveAllows === 1);
  check('taller / shorter split', s.v2Taller === 2 && s.v2Shorter === 2, `taller=${s.v2Taller} shorter=${s.v2Shorter}`);
  check('mean abs delta computed', s.meanAbsDeltaFt > 0 && Number.isFinite(s.meanAbsDeltaFt), `mean=${s.meanAbsDeltaFt.toFixed(1)} ft`);
  check('empty input is safe', summarizeShadow([]).total === 0);
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (fail) throw new Error(`${fail} shadow test(s) failed`);
