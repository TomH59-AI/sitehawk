// jurisdictionPanels — read the Jurisdiction entity (the full SCIP zoning
// template: Zoning Overview, Tower Specifics, Site Plan Overview, Building
// Permit Information) and overlay it onto the four SCIP report panels.
//
// The Jurisdiction entity is written by zoningScraperIngest from the Notion
// "The United States Zoning URL" library. TelecomOrdinance holds the numeric
// tower rules SiteHawk's compliance math runs on; Jurisdiction holds everything
// AROUND them — who to call, what it costs, how long it takes, how a site plan
// and a building permit are actually filed. Nothing else in the report fills
// those rows, so without this overlay two of the four SCIP panels stay empty
// even when the data is sitting in the backend.

import { normalizeJurisdiction } from './telecomOrdinance.ts';
import { countyWordPattern } from './codehawk.ts';

function clean(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || null;
}

function yn(v: any): string | null {
  return v === true ? 'Yes' : v === false ? 'No' : null;
}

function contact(name: any, email: any, phone: any): string | null {
  return [clean(name), clean(email), clean(phone)].filter(Boolean).join(' · ') || null;
}

function distance(value: any, unit: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (unit === 'pct') return `${value}% of tower height`;
  if (unit === 'multiple') return `${value}× tower height`;
  return `${value} ft`;
}

// zoningScraperIngest packs three template rows into zoning_process because the
// entity has one column for them. Split them back out for the panel.
function splitZoningProcess(text: string | null) {
  const out: { process: string | null; cup: string | null; pe: string | null } = { process: null, cup: null, pe: null };
  if (!text) return out;
  for (const part of String(text).split(' | ')) {
    const cup = part.match(/^CUP \/ Special Exception:\s*(.+)$/i);
    const pe = part.match(/^PE Self-Certification:\s*(.+)$/i);
    if (cup) out.cup = cup[1].trim();
    else if (pe) out.pe = pe[1].trim();
    else out.process = [out.process, part.trim()].filter(Boolean).join(' | ');
  }
  return out;
}

function splitFallZone(text: string | null) {
  const out: { fallZone: string | null; peLetter: string | null } = { fallZone: null, peLetter: null };
  if (!text) return out;
  for (const part of String(text).split(' | ')) {
    const pe = part.match(/^PE letter relief:\s*(.+)$/i);
    if (pe) out.peLetter = pe[1].trim();
    else out.fallZone = [out.fallZone, part.trim()].filter(Boolean).join(' | ');
  }
  return out;
}

/**
 * Find the Jurisdiction row for a state + jurisdiction label. Uses the SAME
 * normalizer and county-word test as findOrdinance, which is state-aware:
 * a Borough is a county-equivalent in Alaska but a MUNICIPALITY in Pennsylvania
 * and New Jersey. A private copy of that test rejected every PA/NJ borough.
 */
export async function getJurisdictionRecord(base44: any, state: string, jurisdiction: string): Promise<any> {
  const st = String(state || '').toUpperCase();
  const name = clean(jurisdiction);
  if (!st || !name) return null;

  const exact = await base44.asServiceRole.entities.Jurisdiction.filter({ name, state: st }, null, 1).catch(() => []);
  if (exact && exact[0]) return exact[0];

  const bare = normalizeJurisdiction(name);
  if (!bare) return null;
  const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = await base44.asServiceRole.entities.Jurisdiction
    .filter({ state: st, name: { $regex: escaped, $options: 'i' } }, null, 10)
    .catch(() => []);
  const countyWord = countyWordPattern(st);
  const wantCounty = countyWord.test(name);
  return (candidates || []).find((r: any) => countyWord.test(r.name || '') === wantCounty) || null;
}

/**
 * Overlay a Jurisdiction record onto the report panels.
 *
 * `row` is the report's own cell builder ({ value, source, confidence }).
 * Only fields the record actually holds are written — anything absent keeps
 * whatever the LLM gap-fill produced. Call this BEFORE the TelecomOrdinance
 * overlay so the cited registry still wins on the numeric tower rows.
 */
export function overlayJurisdictionPanels(report: any, j: any, row: (v: any, s: string, c?: string) => any): number {
  if (!j) return 0;
  const source = 'SiteHawk Zoning Library';
  let written = 0;

  const put = (section: string, field: string, value: any) => {
    const v = clean(value);
    if (!v) return;
    report[section] = report[section] || {};
    const cell = row(v, source, 'high');
    if (j.source_url) cell.source_url = j.source_url;
    if (j.ldc_section_reference && section === 'tower_specifics') cell.section_ref = j.ldc_section_reference;
    report[section][field] = cell;
    written += 1;
  };

  const zp = splitZoningProcess(j.zoning_process);
  const fz = splitFallZone(j.fall_zone_requirements);

  // ── ZONING OVERVIEW ──
  put('zoning_overview', 'zoning_jurisdiction', j.zoning_jurisdiction || j.name);
  put('zoning_overview', 'zoning_contact_information', contact(j.zoning_contact_name, j.zoning_contact_email, j.zoning_contact_phone));
  put('zoning_overview', 'zoning_process', zp.process);
  put('zoning_overview', 'cup_or_special_exception', zp.cup);
  put('zoning_overview', 'pe_self_certification', zp.pe);
  put('zoning_overview', 'zoning_fees', j.zoning_fees);
  put('zoning_overview', 'zoning_approval_timeframe', j.zoning_approval_timeframe);
  // property_zoning_district / future_land_use / current_usage / minimum-lot are
  // PARCEL facts, not jurisdiction facts. Writing a jurisdiction-wide value into
  // them would block the Realie/Regrid parcel data that fills them later.

  // ── TOWER SPECIFICS ──
  put('tower_specifics', 'ldc_section_references', j.ldc_section_reference);
  put('tower_specifics', 'maximum_tower_height', j.max_tower_height_ft != null ? `${j.max_tower_height_ft} ft` : null);
  put('tower_specifics', 'stealth_required', yn(j.stealth_required));
  put('tower_specifics', 'required_collocations', j.required_collocations != null ? `${j.required_collocations}` : null);
  put('tower_specifics', 'residential_separation', distance(j.residential_separation, j.residential_separation_unit));
  put('tower_specifics', 'tower_separation', distance(j.tower_separation, j.tower_separation_unit));
  put('tower_specifics', 'measured_from_base_or_center', j.measured_from);
  put('tower_specifics', 'fall_zone_requirements', fz.fallZone || (j.fall_zone_ft != null ? `${j.fall_zone_ft} ft` : null));
  put('tower_specifics', 'pe_letter', fz.peLetter);
  put('tower_specifics', 'special_tower_landscaping', yn(j.special_tower_landscaping));

  // ── SITE PLAN OVERVIEW ──
  put('site_plan', 'site_plan_jurisdiction', j.site_plan_jurisdiction);
  put('site_plan', 'site_plan_contact_info', contact(j.site_plan_contact_name, j.site_plan_contact_email, j.site_plan_contact_phone));
  put('site_plan', 'site_plan_fees', j.site_plan_fees);
  put('site_plan', 'site_plan_timeframe', j.site_plan_timeframe);
  put('site_plan', 'existing_site_plan_amend', yn(j.existing_site_plan_to_amend));
  put('site_plan', 'concurrent_to_zoning_or_bp', yn(j.concurrent_to_zoning_or_bp));
  put('site_plan', 'submittal_deadlines', j.site_plan_submittal_deadlines);
  put('site_plan', 'electronic_hard_or_both',
    j.site_plan_submission_format === 'electronic' ? 'Electronic'
      : j.site_plan_submission_format === 'hard_copy' ? 'Hard copy'
      : j.site_plan_submission_format === 'both' ? 'Electronic and hard copy'
      : null);

  // ── BUILDING PERMIT INFORMATION ──
  put('building_permit', 'building_permit_jurisdiction', j.building_permit_jurisdiction);
  put('building_permit', 'building_dept_contact_info', contact(j.building_dept_contact_name, j.building_dept_contact_email, j.building_dept_contact_phone));
  put('building_permit', 'gc_must_submit', yn(j.gc_must_submit));
  put('building_permit', 'building_permit_fees', j.building_permit_fees);
  put('building_permit', 'building_permit_timeframe', j.building_permit_timeframe);
  put('building_permit', 'bond_required', yn(j.bond_required));
  put('building_permit', 'e911_address_assigned', yn(j.e911_address_assigned));

  report._zoning_library = {
    jurisdiction: j.name || null,
    state: j.state || null,
    fields_written: written,
    source_url: j.source_url || null,
    last_researched_at: j.last_researched_at || null,
  };

  return written;
}
