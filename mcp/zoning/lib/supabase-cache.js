/**
 * supabase-cache.js
 * Supabase read/write cache for the SiteHawk zoning engine.
 * Three tables:  zoning_cache | district_cache | uses_cache
 *
 * TTL defaults (overridable via env):
 *   ZONING_CACHE_TTL_DAYS=30   (parcel → district mapping)
 *   DISTRICT_CACHE_TTL_DAYS=90 (district ordinance details)
 */

import { createClient } from '@supabase/supabase-js';

// ── Client (singleton) ────────────────────────────────────────────────────────

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. ' +
      'Copy .env.example → .env.local and fill in your Supabase credentials.'
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _client;
}

// ── TTL helpers ───────────────────────────────────────────────────────────────

function zoningTTL() {
  const days = parseInt(process.env.ZONING_CACHE_TTL_DAYS ?? '30', 10);
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function districtTTL() {
  const days = parseInt(process.env.DISTRICT_CACHE_TTL_DAYS ?? '90', 10);
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

// ── Cache key ─────────────────────────────────────────────────────────────────

/**
 * Build a deterministic cache key from lookup inputs.
 * @param {{ address?: string, parcelId?: string, lat?: number, lng?: number }} p
 */
export function buildCacheKey({ address, parcelId, lat, lng }) {
  if (parcelId)       return `parcel:${parcelId.toLowerCase().trim()}`;
  if (address)        return `addr:${address.toLowerCase().trim().replace(/\s+/g, ' ')}`;
  if (lat != null)    return `ll:${lat.toFixed(6)},${lng.toFixed(6)}`;
  throw new Error('buildCacheKey requires address, parcelId, or lat+lng');
}

// ── zoning_cache ──────────────────────────────────────────────────────────────

/**
 * Read a cached zoning result.  Returns null on miss or if expired.
 * @param {string} cacheKey
 * @returns {Promise<ZoningResult|null>}
 */
export async function readZoningCache(cacheKey) {
  const sb = getClient();
  const { data, error } = await sb
    .from('zoning_cache')
    .select('*')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) { console.warn('[cache] zoning read error:', error.message); return null; }
  if (!data)  return null;

  return {
    districtCode: data.district_code,
    districtName: data.district_name,
    jurisdiction:  data.jurisdiction,
    parcelId:      data.parcel_id ?? undefined,
    lat:           data.lat ?? undefined,
    lng:           data.lng ?? undefined,
    fips:          { state: data.fips_state, county: data.fips_county, place: data.fips_place },
    geometry:      data.geometry ?? undefined,
    source:        data.source,
    _fromCache:    true,
  };
}

/**
 * Write a zoning result to cache.
 * @param {string} cacheKey
 * @param {object} lookup   - raw geocode/GIS result
 * @param {ZoningResult} result
 */
export async function writeZoningCache(cacheKey, lookup, result) {
  const sb = getClient();
  const row = {
    cache_key:     cacheKey,
    address:       lookup.address ?? null,
    parcel_id:     lookup.parcelId ?? null,
    lat:           result.lat ?? null,
    lng:           result.lng ?? null,
    district_code: result.districtCode,
    district_name: result.districtName,
    jurisdiction:  result.jurisdiction,
    fips_state:    result.fips?.state ?? null,
    fips_county:   result.fips?.county ?? null,
    fips_place:    result.fips?.place ?? null,
    geometry:      result.geometry ?? null,
    source:        result.source ?? 'unknown',
    expires_at:    zoningTTL(),
    updated_at:    new Date().toISOString(),
  };
  const { error } = await sb
    .from('zoning_cache')
    .upsert(row, { onConflict: 'cache_key' });
  if (error) console.warn('[cache] zoning write error:', error.message);
}

// ── district_cache ────────────────────────────────────────────────────────────

/**
 * Read cached district details.  Returns null on miss.
 * @param {string} districtCode
 * @param {string} jurisdiction
 * @returns {Promise<DistrictDetails|null>}
 */
export async function readDistrictCache(districtCode, jurisdiction) {
  const sb = getClient();
  const { data, error } = await sb
    .from('district_cache')
    .select('*')
    .eq('district_code', districtCode.toUpperCase())
    .eq('jurisdiction',  jurisdiction)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) { console.warn('[cache] district read error:', error.message); return null; }
  if (!data)  return null;

  return {
    code:          data.district_code,
    name:          data.name,
    description:   data.description,
    setbacks:      data.setbacks ?? {},
    maxHeight:     data.max_height,
    maxFAR:        data.max_far,
    minLotSize:    data.min_lot_size,
    ordinanceUrl:  data.ordinance_url,
    source:        data.source,
    _fromCache:    true,
  };
}

/**
 * Write district details to cache.
 * @param {string} districtCode
 * @param {string} jurisdiction
 * @param {DistrictDetails} details
 * @param {string} [rawOrdinance]
 */
export async function writeDistrictCache(districtCode, jurisdiction, details, rawOrdinance) {
  const sb = getClient();
  const row = {
    district_code:  districtCode.toUpperCase(),
    jurisdiction,
    name:           details.name,
    description:    details.description ?? null,
    setbacks:       details.setbacks ?? null,
    max_height:     details.maxHeight ?? null,
    max_far:        details.maxFAR ?? null,
    min_lot_size:   details.minLotSize ?? null,
    ordinance_url:  details.ordinanceUrl ?? null,
    raw_ordinance:  rawOrdinance ?? null,
    source:         details.source ?? 'unknown',
    expires_at:     districtTTL(),
  };
  const { error } = await sb
    .from('district_cache')
    .upsert(row, { onConflict: 'district_code,jurisdiction' });
  if (error) console.warn('[cache] district write error:', error.message);
}

// ── uses_cache ────────────────────────────────────────────────────────────────

/**
 * Read cached use matrix.  Returns null on miss.
 */
export async function readUsesCache(districtCode, jurisdiction) {
  const sb = getClient();
  const { data, error } = await sb
    .from('uses_cache')
    .select('*')
    .eq('district_code', districtCode.toUpperCase())
    .eq('jurisdiction',  jurisdiction)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) { console.warn('[cache] uses read error:', error.message); return null; }
  if (!data)  return null;

  return {
    permitted:   data.permitted   ?? [],
    conditional: data.conditional ?? [],
    prohibited:  data.prohibited  ?? [],
    source:      data.source,
    _fromCache:  true,
  };
}

/**
 * Write use matrix to cache.
 */
export async function writeUsesCache(districtCode, jurisdiction, uses) {
  const sb = getClient();
  const row = {
    district_code: districtCode.toUpperCase(),
    jurisdiction,
    permitted:     uses.permitted   ?? [],
    conditional:   uses.conditional ?? [],
    prohibited:    uses.prohibited  ?? [],
    source:        uses.source ?? 'unknown',
    expires_at:    districtTTL(),
  };
  const { error } = await sb
    .from('uses_cache')
    .upsert(row, { onConflict: 'district_code,jurisdiction' });
  if (error) console.warn('[cache] uses write error:', error.message);
}


