/**
 * zoneomicsTargetIntel — fetches the FULL Zoneomics zoneDetail payload for a
 * single Target A point (output_fields: zoning, plu, controls) and returns a
 * clean, app-ready shape for the Target Site Intelligence Panel.
 *
 * It returns:
 *  - zoning  : { zone_code, zone_name, zone_type, link, guide }
 *  - controls: a flat list of { label, value } building-restriction rows
 *              (max height, setbacks, FAR, lot coverage, etc.) when present
 *  - plu     : a de-duped list of permitted land-use strings
 *  - geometry: the zone polygon GeoJSON geometry (for the neon highlight) if the
 *              Zoneomics payload includes it
 *
 * Payload: { lat, lng }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ZONE_DETAIL = 'https://api.zoneomics.com/v2/zoneDetail';

function clean(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s || s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return '';
  return s;
}

// Title-case a snake_case / lowercase key into a readable label.
function labelize(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bFar\b/, 'FAR');
}

// The building-control keys we surface, matched loosely by substring.
const CONTROL_MATCHERS = [
  { label: 'Max Building Height', needles: ['max_height', 'building_height', 'height_ft', 'max_building_height'] },
  { label: 'Front Setback', needles: ['front_setback', 'setback_front'] },
  { label: 'Rear Setback', needles: ['rear_setback', 'setback_rear'] },
  { label: 'Side Setback', needles: ['side_setback', 'setback_side'] },
  { label: 'Min Lot Size', needles: ['min_lot_size', 'minimum_lot', 'lot_area'] },
  { label: 'FAR (Floor Area Ratio)', needles: ['floor_area_ratio', 'far', 'f.a.r'] },
  { label: 'Lot Coverage %', needles: ['lot_coverage', 'max_coverage', 'coverage'] },
  { label: 'Max Density', needles: ['max_density', 'density', 'units_per_acre'] },
];

function flattenLeaves(obj, out = {}) {
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenLeaves(v, out);
    else if (Array.isArray(v)) out[k.toLowerCase()] = v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
    else out[k.toLowerCase()] = v;
  }
  return out;
}

function pick(flat, needles) {
  for (const [k, v] of Object.entries(flat)) {
    for (const n of needles) {
      if (k.includes(n)) {
        const c = clean(v);
        if (c) return c;
      }
    }
  }
  return '';
}

export default Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('ZONEOMICS_API_KEY');
    if (!apiKey) return Response.json({ ok: false, error: 'ZONEOMICS_API_KEY not set' }, { status: 200 });

    const body = await req.json();
    const lat = Number(body.lat);
    const lng = Number(body.lng ?? body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: 'lat and lng required' }, { status: 400 });
    }

    const url = new URL(ZONE_DETAIL);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    url.searchParams.set('output_fields', 'zoning,controls,plu');

    const r = await fetch(url.toString());
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = {}; }

    if (!r.ok) {
      console.log(`[ZONE INTEL] status=${r.status}`);
      return Response.json({ ok: false, http_status: r.status, error: `Zoneomics HTTP ${r.status}` }, { status: 200 });
    }

    const root = json?.data?.data || json?.data || json;
    const zd = root?.zone_details || {};
    const controlsRaw = root?.controls || {};
    const pluRaw = root?.permitted_land_uses || root?.plu || [];

    // ── Zoning summary ──
    const zoning = {
      zone_code: clean(zd.zone_code),
      zone_name: clean(zd.zone_name),
      zone_type: clean(zd.zone_type),
      link: clean(zd.link),
      guide: clean(zd.zone_guide),
    };

    // ── Building controls ──
    const flat = flattenLeaves(controlsRaw);
    const controls = [];
    for (const m of CONTROL_MATCHERS) {
      const v = pick(flat, m.needles);
      if (v) controls.push({ label: m.label, value: v });
    }

    // ── Permitted land uses ──
    let plu = [];
    if (Array.isArray(pluRaw)) {
      plu = pluRaw.map((u) => (typeof u === 'object' ? clean(u.land_use || u.name || u.use || JSON.stringify(u)) : clean(u))).filter(Boolean);
    } else if (pluRaw && typeof pluRaw === 'object') {
      // Some tiers nest permitted uses under keys (permitted/conditional). Flatten allowed-only.
      for (const [k, v] of Object.entries(pluRaw)) {
        if (Array.isArray(v)) v.forEach((u) => { const c = clean(typeof u === 'object' ? (u.land_use || u.name) : u); if (c) plu.push(c); });
        else { const c = clean(v); if (c && /permit|allow/i.test(k)) plu.push(c); }
      }
    }
    plu = Array.from(new Set(plu)).slice(0, 60);

    // ── Zone polygon geometry (for the neon highlight) if exposed ──
    const geometry = zd.geometry || root?.geometry || zd.boundary || null;

    console.log(`[ZONE INTEL] zone=${zoning.zone_code || '—'} controls=${controls.length} plu=${plu.length} geom=${!!geometry}`);

    return Response.json({ ok: true, http_status: r.status, zoning, controls, plu, geometry });
  } catch (error) {
    console.error('zoneomicsTargetIntel error:', error?.message || error);
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 200 });
  }
});