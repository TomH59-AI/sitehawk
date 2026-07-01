/**
 * zone-class.js — Realie -> SiteHawk zoning normalization layer
 * ---------------------------------------------------------------
 * Realie returns per-parcel:
 *   - useCode    : STANDARDIZED numeric land-use code (e.g. "1001"). Authoritative.
 *   - zoningCode : RAW jurisdiction zoning string (e.g. "RD-5"). Non-standardized.
 *
 * Collapses every parcel into ONE of six stable buckets keyed via ['get','zone_class']:
 *   RES   Residential
 *   COMM  Commercial (retail, office, commercial recreation)
 *   IND   Industrial (light, heavy, transport/comms/utility)
 *   AG    Agricultural / rural
 *   OS    Open space / conservation / parks / water
 *   OTHER Everything else -> renders as gray fallback.
 *
 * Priority: useCode (deterministic) first; fall back to regex on zoningCode; else OTHER.
 */

export const ZONE_CLASSES = ['RES', 'COMM', 'IND', 'AG', 'OS', 'OTHER'];

/* Specific useCodes that must override their numeric range (checked first). */
const OS_EXPLICIT = new Set([
  714,  // FOREST (NON-AGRICULTURAL)
  752,  // PARK (PRIVATE, NON-EXEMPT)
  4025, // OUTDOOR RECREATION: BEACH, MOUNTAIN, DESERT
  4027, // PARK, PLAYGROUND, PICNIC AREA
  4028, // GOLF COURSE
  9202, // FOREST (PARK; RESERVE; RECREATION, CONSERVATION)
]);

/* Vacant-land sub-types (8000-8017) classified by INTENDED use. */
const VACANT_MAP = {
  8001: 'RES',
  8002: 'COMM',
  8003: 'IND',
  8004: 'OS',
  8007: 'RES',
  8008: 'AG',
  8009: 'OS',
  8010: 'OS',
  8011: 'OS',
};

/**
 * Classify a Realie standardized useCode into a zone bucket.
 * @param {string|number|null|undefined} useCode
 * @returns {'RES'|'COMM'|'IND'|'AG'|'OS'|'OTHER'|null} null = unparseable
 */
export function classifyUseCode(useCode) {
  if (useCode === null || useCode === undefined) return null;
  const digits = String(useCode).replace(/\D/g, '');
  if (digits === '') return null;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return null;

  if (OS_EXPLICIT.has(n)) return 'OS';
  if (n >= 8000 && n <= 8017) return VACANT_MAP[n] || 'OTHER';
  if (n >= 1000 && n <= 1999) return 'RES';
  if (n >= 2000 && n <= 3999) return 'COMM';
  if (n >= 4000 && n <= 4999) return 'COMM';
  if (n >= 5000 && n <= 6499) return 'IND';
  if (n >= 6500 && n <= 6599) return 'IND';
  if (n >= 7000 && n <= 7999) return 'AG';
  return 'OTHER';
}

/**
 * Best-effort fallback: map a raw jurisdiction zoning string to a bucket.
 * @param {string|null|undefined} zoningCode
 * @returns {'RES'|'COMM'|'IND'|'AG'|'OS'|'OTHER'}
 */
export function classifyZoningString(zoningCode) {
  if (!zoningCode) return 'OTHER';
  const s = String(zoningCode).toUpperCase().trim();
  if (s === '') return 'OTHER';

  if (/^(OS|OSC|CON|CONS|CONSERV|OPEN|GREEN|PARK|REC)/.test(s)) return 'OS';
  if (/^(AG|AGR|A[-\s]?\d|A$|EA|FR|RA[-\s]?\d?)/.test(s)) return 'AG';
  if (/^(R|SF|MF|MH|TH|DR|MDR|HDR|LDR)/.test(s)) return 'RES';
  if (/^(C|B|CB|CC|GB|NC|MU|MX|O[-\s]?\d|O$|OF|OP|PO|PD|RT|RETAIL|HOT|HC)/.test(s)) return 'COMM';
  if (/^(I|M|IL|IH|LI|HI|IND|MFG|IP|BP|LM|GM|W|WH)/.test(s)) return 'IND';

  return 'OTHER';
}

/**
 * Classify a whole Realie parcel record. Prefers useCode; falls back to zoningCode.
 * Accepts either camelCase (API) or snake_case (DB) field names.
 * @param {object} parcel
 * @returns {'RES'|'COMM'|'IND'|'AG'|'OS'|'OTHER'}
 */
export function classifyParcel(parcel) {
  if (!parcel) return 'OTHER';
  const use = parcel.useCode ?? parcel.use_code;
  const byUse = classifyUseCode(use);
  if (byUse) return byUse;
  const zoning = parcel.zoningCode ?? parcel.zoning_code;
  return classifyZoningString(zoning);
}