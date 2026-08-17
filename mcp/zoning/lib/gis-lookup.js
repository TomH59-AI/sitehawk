/**
 * gis-lookup.js
 * ArcGIS REST API zoning district lookup.
 *
 * Strategy:
 *  1. Try county/city ArcGIS zoning layer (spatial query by lat/lng)
 *  2. Return district code + geometry if found
 *
 * Many US municipalities publish their zoning data on ArcGIS Online or
 * their own ArcGIS Server. This module queries a configurable set of known
 * endpoints and falls back gracefully when none match.
 *
 * Add jurisdiction-specific endpoints to KNOWN_ENDPOINTS below, or set
 * ZONING_GIS_URL env var to override for a single deployment.
 */

// ── Known public ArcGIS zoning endpoints ─────────────────────────────────────
// Format: { fipsState, fipsCounty?, placeName?, url }
// url must be a FeatureServer or MapServer layer endpoint (no trailing slash)
//
// To add a new municipality:
//   1. Find their ArcGIS zoning layer (search "<city> zoning arcgis rest services")
//   2. Add an entry below
//   3. Verify the districtField matches the actual field name in that layer

const KNOWN_ENDPOINTS = [
  // Michigan examples
  {
    placeName:     'milford',
    fipsState:     '26',          // MI
    url:           process.env.ZONING_GIS_MILFORD_URL ?? null,  // set in .env.local
    districtField: 'ZONE_CODE',
    nameField:     'ZONE_NAME',
  },
  // Generic override — highest priority
  ...(process.env.ZONING_GIS_URL
    ? [{
        placeName:     null,
        fipsState:     null,
        url:           process.env.ZONING_GIS_URL,
        districtField: process.env.ZONING_GIS_DISTRICT_FIELD ?? 'ZONE_CODE',
        nameField:     process.env.ZONING_GIS_NAME_FIELD     ?? 'ZONE_NAME',
      }]
    : []),
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up the zoning district for a lat/lng via ArcGIS.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{ placeName?: string, fipsState?: string }} context - from geocoder
 * @returns {Promise<GISResult|null>}  null = no endpoint configured / no match
 */
export async function gisZoningLookup(lat, lng, context = {}) {
  const endpoint = resolveEndpoint(context);
  if (!endpoint) return null;

  try {
    return await queryFeatureLayer(endpoint, lat, lng);
  } catch (err) {
    console.warn(`[gis] ArcGIS query failed (${endpoint.url}): ${err.message}`);
    return null;
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function resolveEndpoint({ placeName, fipsState }) {
  // Env override takes priority
  const override = KNOWN_ENDPOINTS.find(e => e.fipsState === null && e.url);
  if (override) return override;

  if (!placeName) return null;
  const norm = placeName.toLowerCase().trim();

  return KNOWN_ENDPOINTS.find(e =>
    e.url &&
    (e.fipsState == null || e.fipsState === fipsState) &&
    (e.placeName == null || norm.includes(e.placeName))
  ) ?? null;
}

async function queryFeatureLayer(endpoint, lat, lng) {
  const { url, districtField, nameField } = endpoint;

  // ArcGIS spatial query: intersect a tiny envelope around the point
  const delta = 0.0001; // ~10 m
  const params = new URLSearchParams({
    geometry:          JSON.stringify({ xmin: lng-delta, ymin: lat-delta, xmax: lng+delta, ymax: lat+delta }),
    geometryType:      'esriGeometryEnvelope',
    spatialRel:        'esriSpatialRelIntersects',
    inSR:              '4326',
    outFields:         [districtField, nameField, 'OBJECTID'].join(','),
    returnGeometry:    'true',
    outSR:             '4326',
    f:                 'json',
  });

  const res = await fetchWithTimeout(`${url}/query?${params}`, {}, 12_000);
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);

  const json = await res.json();
  if (json.error) throw new Error(`ArcGIS error: ${json.error.message}`);

  const features = json.features ?? [];
  if (features.length === 0) return null;

  const attrs = features[0].attributes ?? {};
  const geom  = features[0].geometry  ?? null;

  return {
    districtCode: String(attrs[districtField] ?? '').toUpperCase().trim() || null,
    districtName: String(attrs[nameField]     ?? '').trim()               || null,
    geometry:     geom,
    source:       `arcgis:${url}`,
  };
}

async function fetchWithTimeout(url, options = {}, ms = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @typedef {object} GISResult
 * @property {string|null} districtCode
 * @property {string|null} districtName
 * @property {object|null} geometry     - ArcGIS geometry object
 * @property {string}      source
 */


