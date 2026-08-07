/**
 * TelecomOrdinance (CodeHawk registry) -> HawkPerchSolver config.
 *
 * This is the seam between the two halves of TalonFit: CodeHawk establishes
 * WHAT THE RULES ARE, with a quote and a section number behind each value, and
 * the solver applies them across the parcel.
 *
 * Two principles drive the mapping:
 *
 *  1. NEVER SILENTLY INVENT A RULE. Every field the solver receives is tagged
 *     with where it came from — a cited ordinance value, an uncited registry
 *     value, or a SiteHawk default. A deliverable can then say "199 ft per Sec.
 *     62-2422(2)" for one row and "50 ft assumed — not stated in the code" for
 *     another, instead of presenting both with equal authority.
 *
 *  2. DEFAULTS MUST BE CONSERVATIVE AND VISIBLE. Where the ordinance is silent
 *     we assume the stricter of the plausible readings and flag it for
 *     verification, because a false green light costs a client a site.
 */

import type { SolverConfig, Setbacks, FallZoneSpec, SeparationSpec, EdgeSpec, Point } from './hawkPerchSolver';

export interface OrdinanceRecord {
  jurisdiction?: string;
  state?: string;
  height_limit_ft?: number | null;
  setback_ft?: number | null;
  fall_zone_ft?: number | null;
  fall_zone_pct_of_height?: number | null;
  residential_separation_ft?: number | null;
  tower_separation_ft?: number | null;
  setback_rule?: string | null;
  permit_type?: string | null;
  pe_fall_zone_allowed?: boolean | null;
  pe_letter_required?: boolean | null;
  stealth_required?: boolean | null;
  collocation_required?: boolean | null;
  section_ref?: string | null;
  source_url?: string | null;
  field_citations?: Record<string, { quote?: string; section_ref?: string; source_url?: string; confidence?: string }>;
  verification_status?: string | null;
}

export type Provenance = 'cited' | 'registry' | 'default';

export interface InputProvenance {
  field: string;
  value: unknown;
  provenance: Provenance;
  /** Human-readable basis, for the deliverable and the "why" panel. */
  basis: string;
  section_ref?: string | null;
  source_url?: string | null;
  quote?: string | null;
  needsVerification: boolean;
}

export interface SolverInputs {
  config: SolverConfig;
  provenance: InputProvenance[];
  /** True when the ordinance offers a PE-certified fall-zone reduction path. */
  peReductionAvailable: boolean;
  /** Set when a PE letter is mandatory regardless of the fall-zone path. */
  peLetterRequired: boolean;
  /** Fields the ordinance did not address — these carry SiteHawk defaults. */
  assumedFields: string[];
  notes: string[];
}

/** SiteHawk defaults, used only where the ordinance is silent. */
export const DEFAULTS = {
  maxHeightLimit: 199,
  setbacks: { front: 50, side: 25, rear: 25 } as Setbacks,
  fallZonePercent: 1.0,
  minViableHeight: 100,
};

/**
 * Pull "2x tower height", "2 times the height of the tower", "200% of tower
 * height" out of ordinance prose. Deliberately narrow — a wrong multiple is
 * worse than no multiple, so anything ambiguous returns null and the caller
 * falls back to the fixed-feet value.
 *
 * Note the tight anchor on "height": Brevard's "110% of top-to-breakpoint
 * distance" is NOT 110% of tower height, and must not be read as one.
 */
export function parseHeightMultiple(text?: string | null): number | null {
  const s = String(text || '').toLowerCase();
  if (!s) return null;

  const times = s.match(/(\d+(?:\.\d+)?)\s*(?:x|×|times)\s*(?:the\s*)?(?:proposed\s*|overall\s*)?(?:tower\s*)?height/);
  if (times) {
    const n = Number(times[1]);
    if (Number.isFinite(n) && n > 0 && n <= 10) return n;
  }

  const pct = s.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s*)?(?:the\s*)?(?:proposed\s*|overall\s*)?(?:tower\s*)?height/);
  if (pct) {
    const n = Number(pct[1]);
    if (Number.isFinite(n) && n > 0 && n <= 1000) return n / 100;
  }
  return null;
}

/**
 * Split ordinance prose into clauses so a multiple can be attributed to the rule
 * it actually belongs to.
 *
 * This exists because of a real defect: Brevard's setback_rule contains BOTH
 * "2x proposed tower height from residential" and a separate breakpoint fall-zone
 * provision. A whole-string parse returned 2 for whichever rule asked first, so
 * the residential multiple silently became the fall-zone multiple — halving the
 * achievable height and killing a viable site. A multiple now only counts if it
 * appears in a clause about the rule being asked for.
 */
function clausesOf(text?: string | null): string[] {
  return String(text || '')
    .split(/(?<=\))\s*(?=[A-Z])|[.;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

const CLAUSE_TOPIC = {
  residential: /residential|dwelling|school|child\s*care|habitable/i,
  fall_zone: /fall\s*zone|fall\s*radius|collapse|breakpoint|break\s*point|topple/i,
};

/**
 * Parse a height multiple ONLY from clauses that concern the given rule.
 * Returns null when no clause on that topic states one — which is a correct and
 * useful answer, not a failure.
 */
export function parseHeightMultipleFor(text: string | null | undefined, topic: 'residential' | 'fall_zone'): number | null {
  const pattern = CLAUSE_TOPIC[topic];
  for (const clause of clausesOf(text)) {
    if (!pattern.test(clause)) continue;
    const n = parseHeightMultiple(clause);
    if (n !== null) return n;
  }
  return null;
}

/**
 * Detect a PE-certified breakpoint / engineered collapse path in the ordinance
 * text, which is what unlocks certified_radius mode.
 */
export function detectPEBreakpoint(record: OrdinanceRecord): boolean {
  if (record.pe_fall_zone_allowed === true) return true;
  const text = `${record.setback_rule || ''} ${record.permit_type || ''}`.toLowerCase();
  if (!text.trim()) return false;
  const hasEngineer = /(professional engineer|registered engineer|licensed engineer|\bpe\b|p\.e\.)/.test(text);
  const hasBreakpoint = /(breakpoint|break point|collapse radius|fall radius|engineered fall|certified fall)/.test(text);
  return hasEngineer && hasBreakpoint;
}

function citationFor(record: OrdinanceRecord, field: string) {
  return record.field_citations?.[field] || null;
}

function provenanceOf(record: OrdinanceRecord, field: string, value: unknown): Provenance {
  if (value === null || value === undefined) return 'default';
  return citationFor(record, field)?.quote ? 'cited' : 'registry';
}

/**
 * Build a solver config from an ordinance record plus the parcel geometry.
 *
 * `certifiedRadiusFt` is supplied by the caller when a PE has actually produced
 * a breakpoint design. It is never guessed: an assumed collapse radius is the
 * single most dangerous number in tower siting, because it makes a tight parcel
 * look buildable when nobody has engineered it.
 */
export function buildSolverInputs(
  record: OrdinanceRecord | null | undefined,
  parcel: { coords: Point[]; edgeSpecs?: EdgeSpec[] },
  options: { certifiedRadiusFt?: number | null; existingTowers?: Array<{ point: Point }> } = {}
): SolverInputs {
  const rec = record || {};
  const provenance: InputProvenance[] = [];
  const assumed: string[] = [];
  const notes: string[] = [];

  const record_ = (
    field: string,
    value: unknown,
    provenanceKind: Provenance,
    basis: string,
    needsVerification: boolean
  ) => {
    const cite = citationFor(rec, field);
    provenance.push({
      field,
      value,
      provenance: provenanceKind,
      basis,
      section_ref: cite?.section_ref || rec.section_ref || null,
      source_url: cite?.source_url || rec.source_url || null,
      quote: cite?.quote || null,
      needsVerification,
    });
    if (provenanceKind === 'default') assumed.push(field);
  };

  // ── Height cap ────────────────────────────────────────────────────────
  const capStated = Number.isFinite(rec.height_limit_ft as number) ? (rec.height_limit_ft as number) : null;
  const maxHeightLimit = capStated ?? DEFAULTS.maxHeightLimit;
  record_(
    'height_limit_ft',
    maxHeightLimit,
    provenanceOf(rec, 'height_limit_ft', capStated),
    capStated !== null ? 'Maximum tower height stated in the ordinance.' : `No height cap found — using the ${DEFAULTS.maxHeightLimit} ft SiteHawk default.`,
    capStated === null
  );

  // ── Setbacks ──────────────────────────────────────────────────────────
  // The registry stores ONE setback figure. Applying it to every edge is the
  // honest reading: without per-edge language we cannot claim to know the
  // frontage rule differs. When nothing is stated we fall back to the SiteHawk
  // default set and flag all three for verification.
  const setbackStated = Number.isFinite(rec.setback_ft as number) ? (rec.setback_ft as number) : null;
  const setbacks: Setbacks = setbackStated !== null
    ? { front: setbackStated, side: setbackStated, rear: setbackStated }
    : { ...DEFAULTS.setbacks };
  record_(
    'setback_ft',
    setbacks,
    provenanceOf(rec, 'setback_ft', setbackStated),
    setbackStated !== null
      ? `${setbackStated} ft applied to every property line — the ordinance states a single setback.`
      : 'No numeric setback found — using SiteHawk defaults (front 50 / side 25 / rear 25). Verify against the code.',
    setbackStated === null
  );
  if (setbackStated === null && rec.setback_rule) {
    notes.push(`Setback is expressed as a rule, not a number: "${String(rec.setback_rule).slice(0, 240)}"`);
  }

  // ── Fall zone ─────────────────────────────────────────────────────────
  // A fixed fall_zone_ft is a distance requirement decoupled from height, which
  // is exactly certified_radius mode. A percentage is percent mode.
  let fallZone: FallZoneSpec;
  let fallProv: Provenance;
  let fallBasis: string;
  let fallNeedsVerify = false;

  // Scoped to fall-zone clauses only. A multiple that lives in the residential
  // sentence must never end up here.
  const ruleMultiple = parseHeightMultipleFor(rec.setback_rule, 'fall_zone');
  const peAvailable = detectPEBreakpoint(rec);
  const certified = Number.isFinite(options.certifiedRadiusFt as number) ? (options.certifiedRadiusFt as number) : null;

  if (certified !== null && peAvailable) {
    fallZone = { mode: 'certified_radius', value: certified };
    fallProv = 'registry';
    fallBasis = `PE-certified ${certified} ft collapse radius, permitted by the ordinance's engineered-reduction provision.`;
  } else if (Number.isFinite(rec.fall_zone_pct_of_height as number)) {
    const pct = rec.fall_zone_pct_of_height as number;
    fallZone = { mode: 'percent', value: pct > 10 ? pct / 100 : pct };
    fallProv = provenanceOf(rec, 'fall_zone_pct_of_height', pct);
    fallBasis = `Fall zone is ${pct > 10 ? pct : pct * 100}% of tower height per the ordinance.`;
  } else if (Number.isFinite(rec.fall_zone_ft as number)) {
    fallZone = { mode: 'certified_radius', value: rec.fall_zone_ft as number };
    fallProv = provenanceOf(rec, 'fall_zone_ft', rec.fall_zone_ft);
    fallBasis = `Fixed ${rec.fall_zone_ft} ft fall zone stated in the ordinance, independent of tower height.`;
  } else if (ruleMultiple !== null) {
    fallZone = { mode: 'percent', value: ruleMultiple };
    fallProv = 'registry';
    fallBasis = `Fall zone parsed as ${ruleMultiple}x tower height from the ordinance's setback rule.`;
    notes.push(`Fall-zone multiple ${ruleMultiple}x was parsed from prose — confirm against the code text.`);
    fallNeedsVerify = true;
  } else {
    fallZone = { mode: 'percent', value: DEFAULTS.fallZonePercent };
    fallProv = 'default';
    fallBasis = 'No fall-zone standard found — using 100% of tower height, the conservative default.';
    fallNeedsVerify = true;
  }
  record_('fall_zone', fallZone, fallProv, fallBasis, fallNeedsVerify);

  if (peAvailable && certified === null) {
    notes.push(
      'This ordinance allows a PE-certified fall-zone reduction. Supply an engineered collapse radius to model the rescue — SiteHawk will not assume one.'
    );
  }

  // ── Residential separation ────────────────────────────────────────────
  let residentialSeparation: SeparationSpec | undefined;
  const resStated = Number.isFinite(rec.residential_separation_ft as number) ? (rec.residential_separation_ft as number) : null;
  const resMultiple = parseHeightMultipleFor(rec.setback_rule, 'residential');

  if (resMultiple !== null) {
    residentialSeparation = { mode: 'height_multiple', value: resMultiple };
    record_('residential_separation_ft', residentialSeparation, 'registry',
      `Residential separation is ${resMultiple}x tower height per the ordinance's setback rule.`, true);
  } else if (resStated !== null) {
    residentialSeparation = { mode: 'fixed_ft', value: resStated };
    record_('residential_separation_ft', residentialSeparation, provenanceOf(rec, 'residential_separation_ft', resStated),
      `${resStated} ft separation from residential stated in the ordinance.`, false);
  } else {
    record_('residential_separation_ft', null, 'default',
      'No residential separation found in the ordinance — none applied. Verify before relying on it.', true);
  }

  // ── Existing-tower separation ─────────────────────────────────────────
  const towerSep = Number.isFinite(rec.tower_separation_ft as number) ? (rec.tower_separation_ft as number) : null;
  const existingTowers = (options.existingTowers || []).map((t) => ({ point: t.point, buffer: towerSep ?? 0 }));
  record_('tower_separation_ft', towerSep, provenanceOf(rec, 'tower_separation_ft', towerSep),
    towerSep !== null
      ? `${towerSep} ft separation from existing towers stated in the ordinance.`
      : 'No tower-to-tower separation found in the ordinance — none applied.',
    towerSep === null);

  const config: SolverConfig = {
    parcelCoords: parcel.coords,
    edgeSpecs: parcel.edgeSpecs,
    setbacks,
    maxHeightLimit,
    fallZone,
    residentialSeparation,
    existingTowers: towerSep !== null && existingTowers.length ? existingTowers : undefined,
    minViableHeight: DEFAULTS.minViableHeight,
  };

  if (!parcel.edgeSpecs?.length) {
    notes.push('No frontage typing supplied — every property line is treated as a side line and the result is flagged default_side.');
  }

  return {
    config,
    provenance,
    peReductionAvailable: peAvailable,
    peLetterRequired: rec.pe_letter_required === true,
    assumedFields: assumed,
    notes,
  };
}

/**
 * One-line explanation of why a point grades the way it does, for the SCIP and
 * the cursor probe. Names the binding constraint and cites it.
 */
export function explainBinding(
  binding: string,
  inputs: SolverInputs,
  maxHeight: number
): string {
  const cite = (field: string) => {
    const p = inputs.provenance.find((x) => x.field === field);
    if (!p) return '';
    if (p.provenance === 'cited' && p.section_ref) return ` (${p.section_ref})`;
    if (p.provenance === 'default') return ' (SiteHawk default — not stated in the code)';
    return p.section_ref ? ` (${p.section_ref})` : '';
  };
  const h = Math.round(maxHeight);
  switch (binding) {
    case 'height_cap':
      return `Capped at ${h} ft by the district height limit${cite('height_limit_ft')}.`;
    case 'fall_zone':
      return `Limited to ${h} ft by the fall-zone requirement${cite('fall_zone')} — the distance to the nearest property line is the binding constraint.`;
    case 'residential_separation':
      return `Limited to ${h} ft by the residential separation requirement${cite('residential_separation_ft')}.`;
    case 'setback':
      return `Unbuildable here — inside a required setback${cite('setback_ft')}.`;
    case 'tower_separation':
      return `Unbuildable here — inside an existing tower's separation buffer${cite('tower_separation_ft')}.`;
    case 'outside_parcel':
      return 'This point is outside the parcel boundary.';
    default:
      return `Maximum achievable height here is ${h} ft.`;
  }
}
