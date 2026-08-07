/**
 * CodeHawk ordinance record -> TalonFit solver: adapter tests.
 * Uses the REAL Brevard County registry record as the primary fixture.
 */
import { buildSolverInputs, parseHeightMultiple, parseHeightMultipleFor, detectPEBreakpoint, explainBinding } from './ordinanceToSolver';
import { HawkPerchSolver, Point } from './HawkPerchSolver';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name} ${detail}`); }
  else      { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

const lot: Point[] = [{ x: 0, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 260 }, { x: 0, y: 260 }];
const edges = [
  { type: 'front' as const },
  { type: 'side' as const },
  { type: 'rear' as const, abutsResidential: true },
  { type: 'side' as const },
];

// Verbatim from the SiteHawk registry (id 6a5e8cd46b20300499062f7c).
const BREVARD = {
  jurisdiction: 'Brevard County',
  state: 'FL',
  height_limit_ft: 199,
  setback_ft: null,
  fall_zone_ft: null,
  residential_separation_ft: null,
  tower_separation_ft: null,
  stealth_required: false,
  collocation_required: true,
  pe_fall_zone_allowed: true,
  setback_rule:
    'Heights (62-2422(2)) master plan recommended max: 80 ft coastal / 120 ft urban / 199 ft rural; exceeding requires CUP. Setbacks (62-2422(1)): 2x proposed tower height from residential, child care, public and nonpublic school STRUCTURES (min 100 ft if no tower utilized). All other WTCFs: breakpoint design = 110% of top-to-breakpoint distance OR min side/rear yard, whichever greater, PE certification of breakpoint design and fall radius required.',
  permit_type: 'Level III conditional use permit (Board of County Commissioners)',
  section_ref: 'Sec. 62-2420; 62-2422',
  source_url: 'https://library.municode.com/fl/brevard_county/codes/code_of_ordinances',
};

console.log('\n[A1] Height-multiple parser.');
{
  check('"2x proposed tower height" -> 2', parseHeightMultiple('2x proposed tower height from residential') === 2);
  check('"2 times the height of the tower" -> 2', parseHeightMultiple('2 times the tower height') === 2);
  check('"110% of tower height" -> 1.1', parseHeightMultiple('110% of tower height') === 1.1);
  check('no multiple -> null', parseHeightMultiple('setback shall be 50 feet') === null);
  check('empty -> null', parseHeightMultiple(null) === null);
  check('absurd multiple rejected', parseHeightMultiple('50x tower height') === null);
}

console.log('\n[A2] PE breakpoint detection.');
{
  check('explicit flag wins', detectPEBreakpoint({ pe_fall_zone_allowed: true }) === true);
  check('detected from Brevard prose', detectPEBreakpoint({ ...BREVARD, pe_fall_zone_allowed: null }) === true);
  check('plain ordinance -> false', detectPEBreakpoint({ setback_rule: 'towers shall be set back 100 feet' }) === false);
  check('engineer without breakpoint -> false', detectPEBreakpoint({ setback_rule: 'plans sealed by a professional engineer' }) === false);
}

console.log('\n[A3] Brevard record -> solver inputs.');
{
  const inputs = buildSolverInputs(BREVARD, { coords: lot, edgeSpecs: edges });
  check('height cap taken from the ordinance', inputs.config.maxHeightLimit === 199);
  check('PE reduction flagged available', inputs.peReductionAvailable === true);
  check('setbacks fall back to defaults and are flagged', inputs.assumedFields.includes('setback_ft'),
    `assumed=${JSON.stringify(inputs.assumedFields)}`);
  check('residential 2xH parsed from the rule',
    inputs.config.residentialSeparation?.mode === 'height_multiple' && inputs.config.residentialSeparation?.value === 2,
    `res=${JSON.stringify(inputs.config.residentialSeparation)}`);
  check('a PE note is surfaced, no radius invented',
    inputs.notes.some((n) => /will not assume one/i.test(n)) && inputs.config.fallZone.mode === 'percent',
    `fallZone=${JSON.stringify(inputs.config.fallZone)}`);

  // THE REGRESSION THAT MATTERS. Brevard's rule text contains BOTH "2x proposed
  // tower height from residential" AND a separate breakpoint fall-zone clause.
  // A whole-string parse leaked the residential 2x into the fall zone, which
  // halved the achievable height and turned a viable site into a FAIL.
  check('residential 2x does NOT leak into the fall zone',
    !(inputs.config.fallZone.mode === 'percent' && inputs.config.fallZone.value === 2),
    `fallZone=${JSON.stringify(inputs.config.fallZone)}`);
  check('fall zone falls back to the conservative 100% default',
    inputs.config.fallZone.mode === 'percent' && inputs.config.fallZone.value === 1.0,
    `fallZone=${JSON.stringify(inputs.config.fallZone)}`);
  check('"110% of top-to-breakpoint distance" is not read as 110% of HEIGHT',
    parseHeightMultipleFor(BREVARD.setback_rule, 'fall_zone') === null);
  check('every provenance entry has a basis', inputs.provenance.every((p) => Boolean(p.basis)));
}

console.log('\n[A4] Provenance separates cited from assumed.');
{
  const cited = {
    ...BREVARD,
    field_citations: {
      height_limit_ft: { quote: 'shall not exceed 199 feet', section_ref: 'Sec. 62-2422(2)', source_url: 'https://x' },
    },
  };
  const inputs = buildSolverInputs(cited, { coords: lot, edgeSpecs: edges });
  const cap = inputs.provenance.find((p) => p.field === 'height_limit_ft')!;
  const sb = inputs.provenance.find((p) => p.field === 'setback_ft')!;
  check('cap is CITED with its section', cap.provenance === 'cited' && cap.section_ref === 'Sec. 62-2422(2)');
  check('cap does not need verification', cap.needsVerification === false);
  check('setback is a DEFAULT and flagged', sb.provenance === 'default' && sb.needsVerification === true);
  check('explainBinding cites the section',
    explainBinding('height_cap', inputs, 199).includes('Sec. 62-2422(2)'),
    explainBinding('height_cap', inputs, 199));
  check('explainBinding marks the default honestly',
    explainBinding('setback', inputs, 0).includes('SiteHawk default'),
    explainBinding('setback', inputs, 0));
}

console.log('\n[A1b] Clause scoping — a multiple only counts for its own rule.');
{
  const mixed = 'Setbacks: 2x tower height from residential structures. Fall zone shall equal 50% of tower height.';
  check('residential picks 2x', parseHeightMultipleFor(mixed, 'residential') === 2);
  check('fall zone picks 0.5, not 2', parseHeightMultipleFor(mixed, 'fall_zone') === 0.5,
    `got=${parseHeightMultipleFor(mixed, 'fall_zone')}`);

  const residentialOnly = 'Towers shall be set back 3x tower height from any residential dwelling.';
  check('no fall-zone clause -> null (no leak)', parseHeightMultipleFor(residentialOnly, 'fall_zone') === null);
  check('residential still parses', parseHeightMultipleFor(residentialOnly, 'residential') === 3);

  const fallOnly = 'The fall zone shall be 100% of the tower height.';
  check('no residential clause -> null (no leak)', parseHeightMultipleFor(fallOnly, 'residential') === null);
  check('fall zone parses', parseHeightMultipleFor(fallOnly, 'fall_zone') === 1);
}

console.log('\n[A5] End to end: Brevard rules solved across a real lot.');
{
  const inputs = buildSolverInputs(BREVARD, { coords: lot, edgeSpecs: edges });
  const solver = new HawkPerchSolver(inputs.config);
  const r = solver.findBestSite();
  check('produces a real max height', r.best.maxAchievableHeight > 0 && r.best.maxAchievableHeight <= 199,
    `hMax=${r.best.maxAchievableHeight.toFixed(1)} rung=${r.best.rung}`);
  // Analytic: at x=105, nearest = min(y, 260-y, 105); binding y = (260-y)/2 -> y = 86.67, H = 86.67.
  check('matches the hand-derived optimum (~86.7 ft)', Math.abs(r.best.maxAchievableHeight - 86.67) < 1.5,
    `hMax=${r.best.maxAchievableHeight.toFixed(2)} (analytic 86.67)`);
  check('residential drag is doing work (below the 199 cap)', r.best.maxAchievableHeight < 199);
  check('binding constraint is explained', explainBinding(r.best.bindingConstraint, inputs, r.best.maxAchievableHeight).length > 20,
    explainBinding(r.best.bindingConstraint, inputs, r.best.maxAchievableHeight));

  // Now the PE rescue with an engineered radius supplied by the caller.
  const pe = buildSolverInputs(BREVARD, { coords: lot, edgeSpecs: edges }, { certifiedRadiusFt: 55 });
  const peR = new HawkPerchSolver(pe.config).findBestSite();
  check('PE radius switches to certified mode', pe.config.fallZone.mode === 'certified_radius');
  check('PE rescue raises the achievable height', peR.best.maxAchievableHeight > r.best.maxAchievableHeight,
    `${r.best.maxAchievableHeight.toFixed(1)} -> ${peR.best.maxAchievableHeight.toFixed(1)} ft`);
}

console.log('\n[A6] Empty / missing ordinance must still produce a usable, honest config.');
{
  const inputs = buildSolverInputs(null, { coords: lot });
  check('defaults applied', inputs.config.maxHeightLimit === 199 && inputs.config.setbacks.front === 50);
  check('everything flagged as assumed',
    ['height_limit_ft', 'setback_ft', 'fall_zone'].every((f) => inputs.assumedFields.includes(f)),
    `assumed=${JSON.stringify(inputs.assumedFields)}`);
  check('conservative 100% fall zone', inputs.config.fallZone.mode === 'percent' && inputs.config.fallZone.value === 1.0);
  check('no PE path claimed', inputs.peReductionAvailable === false);
  // Defaults are now UNIFORM (50/50/50): tower ordinances write one setback
  // "from all property lines", so edge typing cannot change the answer and no
  // default_side warning is needed.
  check('uniform default setback on every line',
    inputs.config.setbacks.front === 50 && inputs.config.setbacks.side === 50 && inputs.config.setbacks.rear === 50,
    JSON.stringify(inputs.config.setbacks));
  check('no default_side warning for uniform setbacks', !inputs.notes.some((n) => /default_side/.test(n)));
  const r = new HawkPerchSolver(inputs.config).findBestSite();
  check('still solves and grades', Number.isFinite(r.best.maxAchievableHeight), `hMax=${r.best.maxAchievableHeight.toFixed(1)}`);
}

console.log('\n[A6b] Residential rule without edge flags is called out, never silently dropped.');
{
  // Rule exists, but no edge is flagged abutsResidential — the solver cannot
  // apply it. Silently dropping a known rule is the permissive failure.
  const inputs = buildSolverInputs(BREVARD, { coords: lot });
  check('warning note present',
    inputs.notes.some((n) => /residential separation rule applies.*NOT applied/i.test(n)),
    inputs.notes.join(' | '));
  const flagged = buildSolverInputs(BREVARD, { coords: lot, edgeSpecs: edges });
  check('no warning when an edge is flagged',
    !flagged.notes.some((n) => /NOT applied/i.test(n)));
}

console.log('\n[A7] A fixed fall_zone_ft maps to certified_radius, not percent.');
{
  const inputs = buildSolverInputs({ fall_zone_ft: 120, height_limit_ft: 250 }, { coords: lot });
  check('fixed feet -> certified_radius', inputs.config.fallZone.mode === 'certified_radius' && inputs.config.fallZone.value === 120,
    JSON.stringify(inputs.config.fallZone));
  check('cap respected over default', inputs.config.maxHeightLimit === 250);
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (fail) throw new Error(`${fail} adapter test(s) failed`);
