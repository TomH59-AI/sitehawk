// verifyLayers — SiteHawk Target A Verification Map backend function.
// Runs 4 live federal queries (USGS 3DEP elevation, USFWS NWI wetlands,
// USGS NHD hydrography, USGS WBD watershed) against Target A's coords,
// caches the result onto ScipRecord.verification_map, and returns it.
// Live-proof only — NOT part of the printed SCIP deliverable.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h cache window
const FETCH_TIMEOUT_MS = 25_000;
const M_TO_FT = 3.28084;

const EP = {
  elevation: 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/identify',
  wetlands:  'https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query',
  nhd:       'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query',
  wbd:       'https://hydro.nationalmap.gov/arcgis/rest/services/wbd/FeatureServer/6/query',
};

// URL-encoded ArcGIS point geometry. Bare "lon,lat" returns NoData/400 — keep exact.
function pointGeometry(lat, lon) {
  const geom = { x: lon, y: lat, spatialReference: { wkid: 4326 } };
  return encodeURIComponent(JSON.stringify(geom));
}

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function queryElevation(lat, lon) {
  const out = { value_m: null, value_ft: null, status: 'error', source: 'USGS 3DEP — refreshed 2025-10-27' };
  try {
    const g = pointGeometry(lat, lon);
    const url = `${EP.elevation}?geometry=${g}&geometryType=esriGeometryPoint&returnGeometry=false&f=json`;
    const j = await getJson(url);
    const raw = j?.value;
    if (raw === undefined || raw === null || raw === 'NoData') { out.status = 'nodata'; return out; }
    const m = parseFloat(raw);
    if (Number.isFinite(m)) {
      out.value_m = Math.round(m * 100) / 100;
      out.value_ft = Math.round(m * M_TO_FT * 10) / 10;
      out.status = 'ok';
    } else {
      out.status = 'nodata';
    }
  } catch (_e) {
    out.status = 'error';
  }
  return out;
}

async function queryWetlands(lat, lon) {
  const out = { present: false, wetland_type: '', attribute_code: '', acres: 0, status: 'error', source: 'USFWS National Wetlands Inventory' };
  try {
    const g = pointGeometry(lat, lon);
    const url = `${EP.wetlands}?geometry=${g}&geometryType=esriGeometryPoint&inSR=4326`
      + `&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`;
    const j = await getJson(url);
    const feats = j?.features ?? [];
    if (feats.length > 0) {
      const a = feats[0].attributes ?? {};
      out.present = true;
      out.wetland_type = a['Wetlands.WETLAND_TYPE'] ?? a['WETLAND_TYPE'] ?? '';
      out.attribute_code = a['Wetlands.ATTRIBUTE'] ?? a['ATTRIBUTE'] ?? '';
      const ac = a['Wetlands.ACRES'] ?? a['ACRES'];
      out.acres = Number.isFinite(parseFloat(ac)) ? Math.round(parseFloat(ac) * 100) / 100 : 0;
      out.status = 'hit';
    } else {
      out.status = 'miss';
    }
  } catch (_e) {
    out.status = 'error';
  }
  return out;
}

// NHD fallback ladder — climb layers/buffers until a NAMED feature is found.
const NHD_LADDER = [
  { layer: 6,  dist: 800,  type: 'flowline'   },
  { layer: 6,  dist: 1600, type: 'flowline'   },
  { layer: 9,  dist: 800,  type: 'river/area' },
  { layer: 10, dist: 800,  type: 'waterbody'  },
  { layer: 9,  dist: 1600, type: 'river/area' },
  { layer: 10, dist: 1600, type: 'waterbody'  },
  { layer: 6,  dist: 3000, type: 'flowline'   },
];

function firstNamedFeature(features) {
  for (const feat of features ?? []) {
    const a = feat?.attributes ?? {};
    for (const [k, v] of Object.entries(a)) {
      if (k.toLowerCase() === 'gnis_name' && v) return String(v);
    }
  }
  return '';
}

async function queryHydrography(lat, lon) {
  const out = { nearest_feature: '', ftype: '', status: 'error', source: 'USGS National Hydrography Dataset' };
  const g = pointGeometry(lat, lon);
  let anyQuerySucceeded = false;
  for (const step of NHD_LADDER) {
    try {
      const url = `${EP.nhd.replace('/6/query', `/${step.layer}/query`)}`
        + `?geometry=${g}&geometryType=esriGeometryPoint&inSR=4326`
        + `&spatialRel=esriSpatialRelIntersects&distance=${step.dist}&units=esriSRUnit_Meter`
        + `&outFields=*&returnGeometry=false&resultRecordCount=10&f=json`;
      const j = await getJson(url);
      anyQuerySucceeded = true;
      const name = firstNamedFeature(j?.features ?? []);
      if (name) { out.nearest_feature = name; out.ftype = step.type; out.status = 'ok'; return out; }
    } catch (_e) {
      // this rung failed — keep climbing
    }
  }
  out.status = anyQuerySucceeded ? 'none' : 'error';
  return out;
}

async function queryWatershed(lat, lon) {
  const out = { name: '', huc12: '', status: 'error', source: 'USGS Watershed Boundary Dataset' };
  try {
    const g = pointGeometry(lat, lon);
    const url = `${EP.wbd}?geometry=${g}&geometryType=esriGeometryPoint&inSR=4326`
      + `&spatialRel=esriSpatialRelIntersects&outFields=name,huc12&returnGeometry=false&f=json`;
    const j = await getJson(url);
    const feats = j?.features ?? [];
    if (feats.length > 0) {
      const a = feats[0].attributes ?? {};
      out.name = a['name'] ?? a['Name'] ?? '';
      out.huc12 = a['huc12'] ?? a['HUC12'] ?? '';
      out.status = 'ok';
    } else {
      out.status = 'none';
    }
  } catch (_e) {
    out.status = 'error';
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { scipRecordId, lat, lon, targetLabel = 'Target A', force = false } = body ?? {};
    if (lat === undefined || lon === undefined) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);

    // ---- cache check ----
    if (scipRecordId && !force) {
      try {
        const rec = await base44.entities.ScipRecord.get(scipRecordId);
        const vm = rec?.verification_map;
        if (vm && vm.target_label === targetLabel && vm.generated_at) {
          const age = Date.now() - new Date(vm.generated_at).getTime();
          if (age >= 0 && age < CACHE_TTL_MS) {
            return Response.json({
              ...vm,
              elevation:   { ...(vm.elevation   ?? {}), status: 'cached' },
              wetlands:    { ...(vm.wetlands    ?? {}), status: 'cached' },
              hydrography: { ...(vm.hydrography ?? {}), status: 'cached' },
              watershed:   { ...(vm.watershed   ?? {}), status: 'cached' },
              served_from_cache: true,
            });
          }
        }
      } catch (_e) {
        // fall through to a fresh fetch
      }
    }

    // ---- fire all 4 queries in parallel ----
    const [elevation, wetlands, hydrography, watershed] = await Promise.all([
      queryElevation(latN, lonN),
      queryWetlands(latN, lonN),
      queryHydrography(latN, lonN),
      queryWatershed(latN, lonN),
    ]);

    const verification_map = {
      target_label: targetLabel,
      target_lat: latN,
      target_lon: lonN,
      generated_at: new Date().toISOString(),
      snapshot_url: '',
      elevation,
      wetlands,
      hydrography,
      watershed,
      served_from_cache: false,
    };

    if (scipRecordId) {
      try {
        await base44.entities.ScipRecord.update(scipRecordId, { verification_map });
      } catch (_e) {
        // persistence failed — still return the live result
      }
    }

    return Response.json(verification_map);
  } catch (err) {
    console.error('verifyLayers error:', err);
    return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
});