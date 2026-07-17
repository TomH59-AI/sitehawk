import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * reportAllParcels — authenticated proxy to the ReportAll USA Standard API
 * ("parcels" endpoint). The client key stays server-side; the frontend calls
 * this function.
 *
 * Modes:
 *   - point: { mode:"point", lat, lon }  → the single parcel under a map click.
 *   - ring:  { mode:"ring",  lat, lon, radius_miles }  → all parcels whose
 *            geometry intersects a circle (approximated as a WKT polygon) around
 *            the center. radius capped at 2 miles.
 *
 * ReportAll docs: https://reportallusa.com/solutions/overlay/documentation/
 *   GET https://reportallusa.com/api/parcels?client=KEY&v=9&spatial_intersect=WKT&rpp=..&page=..
 *   Returns { status, count, page, rpp, results:[ { ...fields, geom_as_wkt / geometry } ] }
 *
 * Returns a normalized `parcels` array matching the shape realieParcelsInRing
 * produces, so existing Section 4 renderers work unchanged.
 */

const API_URL = 'https://reportallusa.com/api/parcels';
const API_VERSION = '9';

// Land-use class → six-bucket zone_class the frontend expects.
function classifyLandUse(cls) {
  if (!cls) return 'OTHER';
  const s = String(cls).toUpperCase();
  if (s.includes('RESID')) return 'RES';
  if (s.includes('COMM')) return 'COMM';
  if (s.includes('INDUS')) return 'IND';
  if (s.includes('AGRI')) return 'AG';
  if (s.includes('EXEMPT') || s.includes('MINERAL')) return 'OS';
  return 'OTHER';
}

// Parse a WKT geometry string (POLYGON / MULTIPOLYGON) into GeoJSON.
function wktToGeoJSON(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;
  const s = wkt.trim().toUpperCase();
  const parseRings = (str) =>
    str
      .split(/\)\s*,\s*\(/)
      .map((ring) =>
        ring
          .replace(/[()]/g, '')
          .split(',')
          .map((pt) => pt.trim().split(/\s+/).map(Number))
          .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      )
      .filter((r) => r.length >= 3);
  try {
    if (s.startsWith('MULTIPOLYGON')) {
      const inner = wkt.slice(wkt.indexOf('(') + 1, wkt.lastIndexOf(')'));
      const polys = inner.split(/\)\s*\)\s*,\s*\(\s*\(/).map((p) => parseRings(p));
      return { type: 'MultiPolygon', coordinates: polys };
    }
    if (s.startsWith('POLYGON')) {
      const inner = wkt.slice(wkt.indexOf('(') + 1, wkt.lastIndexOf(')'));
      return { type: 'Polygon', coordinates: parseRings(inner) };
    }
  } catch (_e) {
    return null;
  }
  return null;
}

function normalize(p) {
  const geom = p.geometry || wktToGeoJSON(p.geom_as_wkt || p.wkt || null);
  const mailing = [p.mail_address1, p.mail_address2, p.mail_address3]
    .filter(Boolean)
    .join(', ') || p.mail_name || null;
  return {
    apn: p.parcel_id || p.robust_id || null,
    owner_name: p.owner || null,
    mailing_address: mailing,
    parcel_address: p.situs || [p.addr_number, p.addr_street_name, p.situs_city].filter(Boolean).join(' ') || null,
    acreage: p.acreage != null ? Number(p.acreage) : (p.calc_acreage != null ? Number(p.calc_acreage) : null),
    land_use: p.land_use_class || p.land_use_code || null,
    assessed_value: p.mkt_val_tot != null ? Number(p.mkt_val_tot) : null,
    land_value: p.mkt_val_land != null ? Number(p.mkt_val_land) : null,
    improvement_value: p.mkt_val_bldg != null ? Number(p.mkt_val_bldg) : null,
    market_value: p.mkt_val_tot != null ? Number(p.mkt_val_tot) : null,
    last_sale_date: p.trans_date || null,
    last_sale_price: p.sale_price != null ? Number(p.sale_price) : null,
    legal_description: [p.legal_desc1, p.legal_desc2, p.legal_desc3].filter(Boolean).join(' ') || null,
    year_built: p.year_built || null,
    zoning: p.zoning || null,
    fema_zone: p.fld_zone || null,
    county: p.county_name || null,
    state: p.state_abbr || null,
    school_district: p.school_dist_name || null,
    plss_formatted: p.section_township_range || null,
    latitude: p.latitude != null ? Number(p.latitude) : null,
    longitude: p.longitude != null ? Number(p.longitude) : null,
    parcel_geometry: geom,
    zone_class: classifyLandUse(p.land_use_class),
    data_source: 'ReportAll USA',
  };
}

// Build a WKT polygon approximating a circle of `radiusMiles` around (lat,lon).
function circleWkt(lat, lon, radiusMiles, steps = 24) {
  const R = 3958.8; // earth radius miles
  const d = radiusMiles / R;
  const latR = (lat * Math.PI) / 180;
  const lonR = (lon * Math.PI) / 180;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(brng));
    const lon2 =
      lonR + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(latR), Math.cos(d) - Math.sin(latR) * Math.sin(lat2));
    pts.push(`${((lon2 * 180) / Math.PI).toFixed(6)} ${((lat2 * 180) / Math.PI).toFixed(6)}`);
  }
  return `POLYGON((${pts.join(',')}))`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const client = Deno.env.get('REPORT_API_TOKEN');
    if (!client) return Response.json({ error: 'REPORT_API_TOKEN not set' }, { status: 500 });

    const body = await req.json();
    const { lat, lon } = body;
    if (lat == null || lon == null) return Response.json({ error: 'lat and lon required' }, { status: 400 });

    const mode = body.mode === 'point' ? 'point' : 'ring';
    const radiusMiles = Math.min(Number(body.radius_miles ?? 0.5), 2.0);

    const params = new URLSearchParams({
      client,
      v: API_VERSION,
      rpp: mode === 'point' ? '1' : '250',
      page: '1',
      return_geometry: 'true',
    });
    if (mode === 'point') {
      params.set('spatial_intersect', `POINT(${lon} ${lat})`);
    } else {
      params.set('spatial_intersect', circleWkt(lat, lon, radiusMiles));
    }

    const url = `${API_URL}?${params.toString()}`;
    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) {
      console.error('ReportAll HTTP', r.status, text.slice(0, 300));
      return Response.json({ error: `ReportAll HTTP ${r.status}: ${text.slice(0, 200)}` }, { status: 502 });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (_e) {
      console.error('ReportAll non-JSON response:', text.slice(0, 300));
      return Response.json({ error: 'ReportAll returned non-JSON response', raw: text.slice(0, 300) }, { status: 502 });
    }

    if (data.status && data.status !== 'OK') {
      console.error('ReportAll status error', data);
      return Response.json({ error: `ReportAll error: ${data.message || data.status}` }, { status: 502 });
    }

    const results = data.results || [];
    const parcels = results.map(normalize).filter((p) => p.apn || p.owner_name || p.parcel_address);

    return Response.json({
      ok: true,
      mode,
      count: parcels.length,
      total: data.count ?? parcels.length,
      radius_miles: mode === 'ring' ? radiusMiles : undefined,
      center: { lat, lon },
      quota_used: r.headers.get('x-reportall-api-parcels-request-quota-used') || null,
      parcels,
    });
  } catch (error) {
    console.error('reportAllParcels error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});