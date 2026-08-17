/**
 * geocoder.js
 * Address → coordinates + FIPS codes via the US Census Geocoding API.
 * Free, no API key required.  Works for any US address.
 *
 * Also handles reverse geocoding (lat/lng → place name + FIPS).
 */

const CENSUS_BASE = 'https://geocoding.geo.census.gov/geocoder';
const BENCHMARK  = 'Public_AR_Current';
const VINTAGE    = 'Current_Current';

// ── Forward geocode ───────────────────────────────────────────────────────────

/**
 * Geocode a full street address.
 *
 * @param {string} address  - e.g. "123 Main St, Milford, MI 48381"
 * @returns {Promise<GeoResult>}
 */
export async function geocodeAddress(address) {
  const url = new URL(`${CENSUS_BASE}/geographies/onelineaddress`);
  url.searchParams.set('address',   address);
  url.searchParams.set('benchmark', BENCHMARK);
  url.searchParams.set('vintage',   VINTAGE);
  url.searchParams.set('layers',    'all');
  url.searchParams.set('format',    'json');

  const res = await fetchWithTimeout(url.toString(), {}, 10_000);
  if (!res.ok) throw new Error(`Census geocoder HTTP ${res.status}`);

  const json = await res.json();
  const matches = json?.result?.addressMatches ?? [];

  if (matches.length === 0) {
    throw new Error(`No geocode match found for: "${address}"`);
  }

  const m = matches[0];
  return buildGeoResult(m, address);
}

// ── Reverse geocode ───────────────────────────────────────────────────────────

/**
 * Reverse geocode coordinates.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<GeoResult>}
 */
export async function reverseGeocode(lat, lng) {
  const url = new URL(`${CENSUS_BASE}/geographies/coordinates`);
  url.searchParams.set('x',         lng.toString());
  url.searchParams.set('y',         lat.toString());
  url.searchParams.set('benchmark', BENCHMARK);
  url.searchParams.set('vintage',   VINTAGE);
  url.searchParams.set('layers',    'all');
  url.searchParams.set('format',    'json');

  const res = await fetchWithTimeout(url.toString(), {}, 10_000);
  if (!res.ok) throw new Error(`Census reverse geocoder HTTP ${res.status}`);

  const json = await res.json();
  // Reverse geocode returns geographies directly (no addressMatches)
  const geos = json?.result?.geographies ?? {};

  return {
    lat,
    lng,
    address:       null,
    matchedAddress: null,
    fips: {
      state:  geos['States']?.[0]?.STATE ?? null,
      county: geos['Counties']?.[0]?.COUNTY ?? null,
      place:  geos['Incorporated Places']?.[0]?.PLACE ?? null,
    },
    placeName:  geos['Incorporated Places']?.[0]?.NAME ?? null,
    countyName: geos['Counties']?.[0]?.NAME ?? null,
    stateName:  geos['States']?.[0]?.NAME ?? null,
    geographies: geos,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildGeoResult(match, originalAddress) {
  const geos  = match.geographies ?? {};
  const coords = match.coordinates ?? {};

  return {
    lat:            coords.y,
    lng:            coords.x,
    address:        originalAddress,
    matchedAddress: match.matchedAddress,
    fips: {
      state:  geos['States']?.[0]?.STATE ?? null,
      county: geos['Counties']?.[0]?.COUNTY ?? null,
      place:  geos['Incorporated Places']?.[0]?.PLACE ?? null,
      tract:  geos['Census Tracts']?.[0]?.TRACT ?? null,
      block:  geos['2020 Census Blocks']?.[0]?.BLOCK ?? null,
    },
    placeName:  geos['Incorporated Places']?.[0]?.NAME ?? null,
    countyName: geos['Counties']?.[0]?.NAME ?? null,
    stateName:  geos['States']?.[0]?.NAME ?? null,
    geographies: geos,
  };
}

async function fetchWithTimeout(url, options = {}, ms = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @typedef {object} GeoResult
 * @property {number}  lat
 * @property {number}  lng
 * @property {string|null} address
 * @property {string|null} matchedAddress
 * @property {{ state: string|null, county: string|null, place: string|null, tract: string|null }} fips
 * @property {string|null} placeName
 * @property {string|null} countyName
 * @property {string|null} stateName
 * @property {object} geographies
 */


