/**
 * zoning.js — SiteHawk Full Zoning Engine v1.0.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates the full lookup pipeline for all four MCP tools:
 *
 *   checkZoning          → Cache → GIS → Municode → AmLegal
 *   getZoningDetails     → Cache → Municode → AmLegal
 *   listPermittedUses    → Cache → Municode → AmLegal
 *   runZoningFeasibility → checkZoning + getZoningDetails + listPermittedUses
 *
 * Local repo path:  C:/Users/Hodge/sitehawk/mcp/zoning/zoning.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { geocodeAddress, reverseGeocode }                          from './lib/geocoder.js';
import { gisZoningLookup }                                         from './lib/gis-lookup.js';
import { findMunicipality as mcFind, fetchZoningOrdinance as mcOrdinance,
         fetchPermittedUses as mcUses }                            from './lib/municode.js';
import { findMunicipality as alFind, fetchZoningOrdinance as alOrdinance,
         fetchPermittedUses as alUses }                            from './lib/amlegal.js';
import {
  buildCacheKey,
  readZoningCache,   writeZoningCache,
  readDistrictCache, writeDistrictCache,
  readUsesCache,     writeUsesCache,
} from './lib/supabase-cache.js';

// ── State abbreviation map (FIPS state → abbr) ───────────────────────────────
const FIPS_TO_STATE = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT',
  '10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL',
  '18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD',
  '25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE',
  '32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND',
  '39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD',
  '47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV',
  '55':'WI','56':'WY',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. checkZoning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up the zoning district for a location.
 *
 * @param {{ address?: string, parcelId?: string, lat?: number, lng?: number }} params
 * @returns {Promise<ZoningResult>}
 */
export async function checkZoning({ address, parcelId, lat, lng }) {
  validateAtLeastOne({ address, parcelId, lat, lng });

  const cacheKey = buildCacheKey({ address, parcelId, lat, lng });

  // 1a. Supabase cache hit
  const cached = await readZoningCache(cacheKey);
  if (cached) {
    console.info(`[zoning] cache HIT: ${cacheKey}`);
    return cached;
  }
  console.info(`[zoning] cache MISS: ${cacheKey} — running live lookup`);

  // 1b. Resolve coordinates
  let geo;
  if (lat != null && lng != null) {
    geo = await reverseGeocode(lat, lng);
    if (address) geo.address = address;
  } else if (address) {
    geo = await geocodeAddress(address);
  } else {
    // parcelId only — we can't geocode without an address/coords; return partial
    throw new Error(
      `Cannot resolve parcelId "${parcelId}" without coordinates. ` +
      'Provide address or lat+lng alongside parcelId.'
    );
  }

  const stateAbbr = FIPS_TO_STATE[geo.fips?.state] ?? null;

  // 1c. GIS lookup (ArcGIS REST — fastest, most accurate)
  const gis = await gisZoningLookup(geo.lat, geo.lng, {
    placeName: geo.placeName,
    fipsState: geo.fips?.state,
  });

  let result;

  if (gis?.districtCode) {
    console.info(`[zoning] GIS resolved district: ${gis.districtCode}`);
    result = {
      districtCode: gis.districtCode,
      districtName: gis.districtName ?? `${gis.districtCode} District`,
      jurisdiction:  geo.placeName ?? geo.countyName ?? 'Unknown',
      lat:           geo.lat,
      lng:           geo.lng,
      parcelId:      parcelId ?? null,
      fips:          geo.fips,
      geometry:      gis.geometry,
      source:        gis.source,
    };
  } else {
    // 1d. Municode fallback (district from ordinance search)
    console.info('[zoning] GIS unavailable — trying Municode');
    const mcEntry = geo.placeName && stateAbbr
      ? await mcFind(geo.placeName, stateAbbr)
      : null;

    if (mcEntry) {
      result = {
        districtCode: 'UNKNOWN',
        districtName: 'District could not be automatically determined',
        jurisdiction:  mcEntry.name ?? geo.placeName,
        lat:           geo.lat,
        lng:           geo.lng,
        parcelId:      parcelId ?? null,
        fips:          geo.fips,
        source:        `municode:${mcEntry.id ?? mcEntry.clientId}`,
        _notice:       'GIS layer not configured for this jurisdiction. ' +
                       'District code must be confirmed from local zoning map. ' +
                       'Use getZoningDetails(districtCode) once you have the code.',
      };
    } else {
      throw new Error(
        `Could not determine zoning district for "${address ?? `${lat},${lng}`}". ` +
        'No GIS layer is configured for this jurisdiction. ' +
        'Add a ZONING_GIS_URL to .env.local or register the ArcGIS endpoint in gis-lookup.js.'
      );
    }
  }

  // 1e. Write to cache
  await writeZoningCache(cacheKey, { address, parcelId, lat, lng }, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. getZoningDetails
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return full ordinance details for a zoning district code.
 *
 * @param {string} districtCode  e.g. "R-1", "C-2", "I-M"
 * @param {string} [jurisdiction] - municipality name; improves lookup accuracy
 * @returns {Promise<DistrictDetails>}
 */
export async function getZoningDetails(districtCode, jurisdiction) {
  if (!districtCode) throw new Error('districtCode is required');
  const code  = districtCode.toUpperCase().trim();
  const juris = (jurisdiction ?? process.env.DEFAULT_JURISDICTION ?? '').trim();

  // 2a. Cache
  if (juris) {
    const cached = await readDistrictCache(code, juris);
    if (cached) { console.info(`[zoning] district cache HIT: ${code}@${juris}`); return cached; }
  }

  // 2b. Municode
  const details = await fetchDetailsFromSources(code, juris);
  if (!details) {
    throw new Error(
      `No ordinance data found for district "${code}" in "${juris || 'unknown jurisdiction'}". ` +
      'Ensure the jurisdiction is on Municode or AmLegal, or provide DEFAULT_JURISDICTION in .env.local.'
    );
  }

  // 2c. Cache write
  if (juris) {
    await writeDistrictCache(code, juris, details, details._rawHtml);
  }

  return omit(details, ['_rawHtml']);
}

async function fetchDetailsFromSources(code, jurisdiction) {
  const stateAbbr = resolveStateFromJurisdiction(jurisdiction);

  // Try Municode
  const mcEntry = jurisdiction && stateAbbr
    ? await mcFind(jurisdiction, stateAbbr).catch(() => null)
    : null;

  if (mcEntry) {
    const clientId = mcEntry.clientId ?? mcEntry.id;
    const ord = await mcOrdinance(clientId, code).catch(() => null);
    if (ord) {
      return {
        code,
        name:         ord.name        ?? `${code} District`,
        description:  ord.description ?? null,
        setbacks:     ord.setbacks    ?? {},
        maxHeight:    ord.maxHeight   ?? null,
        maxFAR:       ord.maxFAR      ?? null,
        minLotSize:   ord.minLotSize  ?? null,
        ordinanceUrl: ord.ordinanceUrl,
        source:       ord.source,
        _rawHtml:     ord.rawHtml,
      };
    }
  }

  // Fallback: AmLegal
  const alEntry = jurisdiction && stateAbbr
    ? await alFind(jurisdiction, stateAbbr).catch(() => null)
    : null;

  if (alEntry) {
    const codeId = alEntry.id ?? alEntry.codeId;
    const ord = await alOrdinance(codeId, code).catch(() => null);
    if (ord) {
      return {
        code,
        name:         ord.name        ?? `${code} District`,
        description:  ord.description ?? null,
        setbacks:     ord.setbacks    ?? {},
        maxHeight:    ord.maxHeight   ?? null,
        maxFAR:       ord.maxFAR      ?? null,
        minLotSize:   ord.minLotSize  ?? null,
        ordinanceUrl: ord.ordinanceUrl,
        source:       ord.source,
        _rawHtml:     ord.rawHtml,
      };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. listPermittedUses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List permitted, conditional, and prohibited land uses for a district.
 *
 * @param {string} districtCode
 * @param {string} [jurisdiction]
 * @returns {Promise<UseMatrix>}
 */
export async function listPermittedUses(districtCode, jurisdiction) {
  if (!districtCode) throw new Error('districtCode is required');
  const code  = districtCode.toUpperCase().trim();
  const juris = (jurisdiction ?? process.env.DEFAULT_JURISDICTION ?? '').trim();

  // 3a. Cache
  if (juris) {
    const cached = await readUsesCache(code, juris);
    if (cached) { console.info(`[zoning] uses cache HIT: ${code}@${juris}`); return cached; }
  }

  // 3b. Fetch from sources
  const stateAbbr = resolveStateFromJurisdiction(juris);
  let uses = null;

  // Municode
  const mcEntry = juris && stateAbbr
    ? await mcFind(juris, stateAbbr).catch(() => null)
    : null;
  if (mcEntry) {
    uses = await mcUses(mcEntry.clientId ?? mcEntry.id, code).catch(() => null);
  }

  // AmLegal fallback
  if (!uses || (!uses.permitted.length && !uses.conditional.length)) {
    const alEntry = juris && stateAbbr
      ? await alFind(juris, stateAbbr).catch(() => null)
      : null;
    if (alEntry) {
      uses = await alUses(alEntry.id ?? alEntry.codeId, code).catch(() => null);
    }
  }

  if (!uses) {
    throw new Error(
      `No use matrix found for district "${code}" in "${juris || 'unknown jurisdiction'}".`
    );
  }

  // 3c. Cache write
  if (juris) {
    await writeUsesCache(code, juris, { ...uses });
  }

  return uses;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. runZoningFeasibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full feasibility analysis: zoning lookup + ordinance + use matrix combined.
 *
 * @param {{ address: string, proposedUse: string, units?: number, sqft?: number }} params
 * @returns {Promise<FeasibilityReport>}
 */
export async function runZoningFeasibility({ address, proposedUse, units, sqft }) {
  if (!address)     throw new Error('address is required');
  if (!proposedUse) throw new Error('proposedUse is required');

  // 4a. Get district
  const zone = await checkZoning({ address });

  // 4b. Get ordinance details + use matrix in parallel
  const [details, uses] = await Promise.allSettled([
    getZoningDetails(zone.districtCode, zone.jurisdiction),
    listPermittedUses(zone.districtCode, zone.jurisdiction),
  ]);

  const ordinance = details.status === 'fulfilled' ? details.value : null;
  const useMatrix = uses.status    === 'fulfilled' ? uses.value    : null;

  // 4c. Determine use status
  const useStatus = classifyUse(proposedUse, useMatrix);

  // 4d. Collect flags (FAR, height, density, setbacks, etc.)
  const flags = [];
  const conditions = [];

  if (useStatus === 'conditional') {
    conditions.push(
      `"${proposedUse}" is a conditional use in ${zone.districtCode} — ` +
      `a Conditional Use Permit (CUP) or Special Use Permit (SUP) is typically required.`
    );
  }

  if (sqft && ordinance?.maxFAR) {
    // Estimate required lot size to accommodate sqft at max FAR
    const requiredLotSize = Math.ceil(sqft / ordinance.maxFAR);
    flags.push(`FAR ${ordinance.maxFAR}: ${sqft.toLocaleString()} sq ft of floor area requires ≥ ${requiredLotSize.toLocaleString()} sq ft lot`);
  }

  if (ordinance?.maxHeight) {
    flags.push(`Max building height: ${ordinance.maxHeight} ft`);
  }

  if (units && ordinance?.minLotSize) {
    const densityNote = `Minimum lot size is ${ordinance.minLotSize.toLocaleString()} sq ft`;
    flags.push(densityNote);
  }

  if (ordinance?.setbacks?.front) {
    const sb = ordinance.setbacks;
    flags.push(
      `Setbacks — Front: ${sb.front ?? '?'} ft, Rear: ${sb.rear ?? '?'} ft, Side: ${sb.side ?? '?'} ft`
    );
  }

  // 4e. Build summary
  const feasible = useStatus === 'permitted' || useStatus === 'conditional';
  const summary  = buildSummary({ address, proposedUse, zone, useStatus, units, sqft, ordinance, conditions, flags });

  return {
    feasible,
    status:     useStatus,
    districtCode: zone.districtCode,
    districtName: zone.districtName,
    jurisdiction: zone.jurisdiction,
    conditions,
    flags,
    summary,
    ordinance:  ordinance ? omit(ordinance, ['source', '_rawHtml']) : null,
    sources: [
      zone.source,
      ordinance?.source,
      useMatrix?.source,
    ].filter(Boolean),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyUse(proposedUse, useMatrix) {
  if (!useMatrix) return 'unknown';

  const norm = proposedUse.toLowerCase().trim();
  const score = (list) => list?.filter(u => {
    const u2 = u.toLowerCase();
    return norm.includes(u2) || u2.includes(norm) || partialMatch(norm, u2);
  }).length ?? 0;

  const pScore = score(useMatrix.permitted);
  const cScore = score(useMatrix.conditional);
  const xScore = score(useMatrix.prohibited);

  if (xScore > 0 && xScore >= pScore && xScore >= cScore) return 'prohibited';
  if (pScore > 0 && pScore >= cScore)                      return 'permitted';
  if (cScore > 0)                                          return 'conditional';
  return 'unknown';
}

function partialMatch(a, b) {
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  return wordsA.filter(w => w.length > 3 && wordsB.includes(w)).length >= 2;
}

function buildSummary({ address, proposedUse, zone, useStatus, units, sqft, ordinance, conditions, flags }) {
  const loc  = `${zone.districtCode} (${zone.districtName}) in ${zone.jurisdiction}`;
  const use  = proposedUse.charAt(0).toUpperCase() + proposedUse.slice(1);
  const prog = units ? ` (${units} units)` : sqft ? ` (${sqft.toLocaleString()} sq ft)` : '';

  const statusText = {
    permitted:   '✅ PERMITTED by right',
    conditional: '⚠️  CONDITIONAL — requires a special/conditional use permit',
    prohibited:  '🚫 PROHIBITED in this district',
    unknown:     '❓ STATUS UNKNOWN — use table not available for this jurisdiction',
  }[useStatus] ?? '❓ STATUS UNKNOWN';

  const lines = [
    `Address: ${address}`,
    `Zoning district: ${loc}`,
    `Proposed use: ${use}${prog}`,
    `Status: ${statusText}`,
  ];

  if (conditions.length) {
    lines.push('', 'Conditions:', ...conditions.map(c => `  • ${c}`));
  }

  if (flags.length) {
    lines.push('', 'Development standards:', ...flags.map(f => `  • ${f}`));
  }

  if (ordinance?.ordinanceUrl) {
    lines.push('', `Ordinance reference: ${ordinance.ordinanceUrl}`);
  }

  return lines.join('\n');
}

function resolveStateFromJurisdiction(jurisdiction) {
  if (!jurisdiction) return null;
  // Expect jurisdiction like "Milford, MI" or just "Milford"
  const m = jurisdiction.match(/,\s*([A-Z]{2})$/);
  if (m) return m[1];
  // Try env override
  return process.env.DEFAULT_STATE_ABBR ?? null;
}

function validateAtLeastOne(params) {
  const { address, parcelId, lat, lng } = params;
  if (!address && !parcelId && (lat == null || lng == null)) {
    throw new Error('Provide at least one of: address, parcelId, or lat+lng pair');
  }
}

function omit(obj, keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type definitions (JSDoc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} ZoningResult
 * @property {string}      districtCode
 * @property {string}      districtName
 * @property {string}      jurisdiction
 * @property {string|null} parcelId
 * @property {number}      lat
 * @property {number}      lng
 * @property {{ state: string, county: string, place: string }} fips
 * @property {object|null} geometry
 * @property {string}      source
 * @property {boolean}     [_fromCache]
 * @property {string}      [_notice]
 *
 * @typedef {object} DistrictDetails
 * @property {string}      code
 * @property {string}      name
 * @property {string|null} description
 * @property {object}      setbacks        { front, rear, side } in feet
 * @property {number|null} maxHeight       feet
 * @property {number|null} maxFAR
 * @property {number|null} minLotSize      sq ft
 * @property {string}      ordinanceUrl
 * @property {string}      source
 *
 * @typedef {object} UseMatrix
 * @property {string[]} permitted
 * @property {string[]} conditional
 * @property {string[]} prohibited
 * @property {string}   source
 *
 * @typedef {object} FeasibilityReport
 * @property {boolean}        feasible
 * @property {string}         status     "permitted"|"conditional"|"prohibited"|"unknown"
 * @property {string}         districtCode
 * @property {string}         districtName
 * @property {string}         jurisdiction
 * @property {string[]}       conditions
 * @property {string[]}       flags
 * @property {string}         summary
 * @property {DistrictDetails|null} ordinance
 * @property {string[]}       sources
 */


