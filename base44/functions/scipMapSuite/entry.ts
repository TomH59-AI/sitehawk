import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * scipMapSuite — Full SCIP map suite generator (A=11, B/C=3 maps each).
 *
 * One renderer, 11 layer configs. Same proven discipline as targetAMapPair:
 *   - _geo computed ONCE per target → every map for that target reuses by reference
 *   - Basemaps reused: only 3 types (aerial, light, terrain) per target
 *   - Static data layers cached in SCIPLayerCache per (jurisdiction, layer_type)
 *   - Distances computed locally via haversine — zero API cost
 *   - Per-map graceful fallback + provenance tag, suite NEVER fails on layer miss
 *
 * Tiering (cost control):
 *   Target A (targets[0]): all 11 maps
 *   Target B & C:         3 maps each (Aerial, Parcel, Floodplain)
 *   Full A/B/C suite = 17 maps, never 33.
 */

const MAPBOX_STATIC = "https://api.mapbox.com/styles/v1";
const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1350;
const DEFAULT_RADIUS_MI = 1.0;

// Supabase project hosting nearest_airport + nearest_cell_tower RPCs (same as
// existing nearestAirport / cellTowerLookup functions). Inlined here so
// scipMapSuite doesn't need to hop through base44.functions.invoke (which
// rejects backend-to-backend calls without a user request context).
const SCIP_SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
const SCIP_SUPABASE_ANON_KEY = "sb_publishable_qlmz0RMO8qXUrWi1i6bpaQ_9tcqSzFZ";
const USGS_EPQS_URL = "https://epqs.nationalmap.gov/v1/json";
const ASCE_WIND_BASE = "https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Tile_RC_II_new/MapServer";

// ─────────────────────── shared geometry ───────────────────────

function computeSharedGeo(lat, lng, radiusMi) {
  const lngDelta = radiusMi / (69 * Math.cos(lat * Math.PI / 180));
  const imageAspect = RENDER_WIDTH / RENDER_HEIGHT;
  const finalLngDelta = lngDelta;
  const finalLatDelta = finalLngDelta / imageAspect;
  const bbox = [
    lng - finalLngDelta, lat - finalLatDelta,
    lng + finalLngDelta, lat + finalLatDelta,
  ];
  const target_px = [Math.round(RENDER_WIDTH / 2), Math.round(RENDER_HEIGHT / 2)];
  const zoom = Math.log2(360 / (finalLngDelta * 2));
  return {
    bbox,
    center: [lng, lat],
    zoom: Math.round(zoom * 100) / 100,
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
    target_px,
    radius_mi: radiusMi,
  };
}

// ─────────────────────── haversine (local, zero-cost) ───────────────────────

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─────────────────────── Mapbox URL builders (one engine) ───────────────────────

const STYLES = {
  aerial:  "mapbox/satellite-streets-v12",
  light:   "mapbox/light-v11",
  terrain: "mapbox/outdoors-v12",   // outdoors-v12 = terrain hillshade + contours
};

/**
 * Build a Mapbox static URL with one basemap + arbitrary overlays + center pin.
 * Same dimensions/bbox for every map → pixel-locked registration.
 */
function buildMapUrl({ geo, basemap, overlays = [], centerLat, centerLng, mapboxToken }) {
  const style = STYLES[basemap] || STYLES.aerial;
  // Center waypoint pin — always present, always at target_px (since bbox is centered on lat/lng)
  const centerPin = `pin-l-marker+ff3b30(${centerLng},${centerLat})`;
  const overlayParts = [...overlays, centerPin].filter(Boolean).join(",");
  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  const bboxStr = `[${minLng},${minLat},${maxLng},${maxLat}]`;
  return `${MAPBOX_STATIC}/${style}/static/${overlayParts}/${bboxStr}/${RENDER_WIDTH}x${RENDER_HEIGHT}@2x?access_token=${mapboxToken}&attribution=false&logo=false`;
}

/** Build a Mapbox overlay for a geodesic line from center to feature coord. */
function buildLineOverlay(centerLat, centerLng, featLat, featLng, color = "0a84ff") {
  // GeoJSON LineString encoded for Mapbox path overlay
  const geojson = {
    type: "Feature",
    properties: { stroke: `#${color}`, "stroke-width": 3 },
    geometry: { type: "LineString", coordinates: [[centerLng, centerLat], [featLng, featLat]] },
  };
  return `geojson(${encodeURIComponent(JSON.stringify(geojson))})`;
}

/** Build a Mapbox marker overlay for a feature (airport/tower/etc) at its real coords. */
function buildFeatureMarker(lat, lng, label, color = "0a84ff") {
  // pin-l-{label}+{color}({lng},{lat}) — label drives the icon glyph
  return `pin-l-${label}+${color}(${lng},${lat})`;
}

/** Build a Mapbox polygon/path overlay from a GeoJSON FeatureCollection (zoning, FLU, wetlands, flood). */
function buildGeoJsonOverlay(geojson) {
  if (!geojson) return null;
  // Mapbox static accepts a single geojson() param with a FeatureCollection;
  // each feature's styling comes from its `properties` (stroke, fill, fill-opacity).
  return `geojson(${encodeURIComponent(JSON.stringify(geojson))})`;
}

// ─────────────────────── cache layer (Base44 entity) ───────────────────────

async function cacheGet(base44, jurisdiction, layer_type) {
  try {
    const rows = await base44.asServiceRole.entities.SCIPLayerCache.filter({
      jurisdiction, layer_type,
    });
    return rows && rows.length ? rows[0] : null;
  } catch (e) {
    console.log(`[INFO] CACHE_READ_ERROR ${layer_type}:${e.message}`);
    return null;
  }
}

async function cacheSet(base44, jurisdiction, layer_type, geojson, data_source) {
  try {
    const existing = await base44.asServiceRole.entities.SCIPLayerCache.filter({
      jurisdiction, layer_type,
    });
    const payload = {
      jurisdiction, layer_type, geojson, data_source,
      fetched_at: new Date().toISOString(),
    };
    if (existing && existing.length) {
      await base44.asServiceRole.entities.SCIPLayerCache.update(existing[0].id, payload);
    } else {
      await base44.asServiceRole.entities.SCIPLayerCache.create(payload);
    }
  } catch (e) {
    console.log(`[INFO] CACHE_WRITE_ERROR ${layer_type}:${e.message}`);
  }
}

// ─────────────────────── data fetchers (with cache + fallback) ───────────────────────

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    return r;
  } catch (e) {
    return { ok: false, _err: e.message };
  } finally { clearTimeout(t); }
}

/** FEMA NFHL flood zones — bbox query against ArcGIS feature service. */
async function fetchFEMA(geo) {
  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  const url = `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?` + new URLSearchParams({
    geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326", outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "FLD_ZONE,ZONE_SUBTY,STATIC_BFE",
    returnGeometry: "true",
    f: "geojson",
  });
  const res = await fetchWithTimeout(url, {}, 15000);
  if (!res.ok) return { ok: false, reason: res._err || `http_${res.status}` };
  const data = await res.json();
  if (!data.features || !data.features.length) return { ok: true, geojson: null };
  // Style each feature
  const styled = {
    type: "FeatureCollection",
    features: data.features.map((f) => {
      const zone = f.properties?.FLD_ZONE || "X";
      const color = zone === "AE" || zone === "A" ? "#1e90ff"
                  : zone === "VE" || zone === "V" ? "#ff3b30"
                  : zone === "X" ? "#9ca3af" : "#fbbf24";
      return {
        ...f,
        properties: { ...f.properties, fill: color, "fill-opacity": 0.45, stroke: color, "stroke-width": 1 },
      };
    }),
  };
  return { ok: true, geojson: styled, data_source: "fema_nfhl" };
}

/** FWS NWI wetlands — bbox query. */
async function fetchNWI(geo) {
  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  const url = `https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query?` + new URLSearchParams({
    geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326", outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "WETLAND_TYPE,ATTRIBUTE",
    returnGeometry: "true",
    f: "geojson",
  });
  const res = await fetchWithTimeout(url, {}, 15000);
  if (!res.ok) return { ok: false, reason: res._err || `http_${res.status}` };
  const data = await res.json();
  if (!data.features || !data.features.length) return { ok: true, geojson: null };
  const styled = {
    type: "FeatureCollection",
    features: data.features.map((f) => ({
      ...f,
      properties: { ...f.properties, fill: "#10b981", "fill-opacity": 0.5, stroke: "#047857", "stroke-width": 1 },
    })),
  };
  return { ok: true, geojson: styled, data_source: "fws_nwi" };
}

/** Zoneomics zoning polygons via the v2 boundary endpoint. */
async function fetchZoneomicsZoning(geo, apiKey) {
  if (!apiKey) return { ok: false, reason: "no_api_key" };
  const [minLng, minLat, maxLng, maxLat] = geo.bbox;
  // zoneSearch returns zones in a bbox; we hit the center for a single canonical record
  const url = `https://api.zoneomics.com/v2/zoneDetail?api_key=${apiKey}&lat=${(minLat + maxLat) / 2}&lng=${(minLng + maxLng) / 2}&output_fields=zoning,parcels`;
  const res = await fetchWithTimeout(url, {}, 15000);
  if (!res.ok) return { ok: false, reason: res._err || `http_${res.status}` };
  const data = await res.json();
  const zone = data?.data?.zone_details;
  if (!zone) return { ok: true, geojson: null };
  // Render the zone code as a label-only feature centered on bbox
  const geojson = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        zone_code: zone.zone_code, zone_name: zone.zone_name,
        fill: "#a855f7", "fill-opacity": 0.25, stroke: "#7c3aed", "stroke-width": 2,
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]],
      },
    }],
  };
  return { ok: true, geojson, zone_code: zone.zone_code, data_source: "zoneomics" };
}

/** FLU — county GIS is jurisdiction-specific; we treat as state-fallback-or-unavailable. */
async function fetchFLU(geo, jurisdiction, state) {
  // No universal FLU endpoint — county-by-county. For now we don't have a county FLU
  // registry, so this layer is always "unavailable" until per-county wiring lands.
  // State fallback hook is reserved for future state-level FLU datasets.
  return { ok: false, reason: "no_county_flu_registered" };
}

// ─────────────────────── per-map builders ───────────────────────

async function buildTopographyMap(ctx) {
  const { geo, lat, lng, mapboxToken } = ctx;
  // USGS EPQS for center AMSL — direct call (no SDK hop)
  let center_amsl_ft = null;
  try {
    const url = `${USGS_EPQS_URL}?x=${lng}&y=${lat}&units=Feet&wkid=4326&includeDate=false`;
    const r = await fetchWithTimeout(url, {}, 10000);
    if (r.ok) {
      const data = await r.json();
      const raw = data?.value;
      center_amsl_ft = (raw != null && raw > -100000) ? parseFloat(parseFloat(raw).toFixed(1)) : null;
    }
  } catch (e) {
    console.log(`[INFO] MAP_FALLBACK topography:epqs_err reason=${e.message}`);
  }
  return {
    type: "topography",
    url: buildMapUrl({ geo, basemap: "terrain", overlays: [], centerLat: lat, centerLng: lng, mapboxToken }),
    data_source: center_amsl_ft != null ? "mapbox_terrain+usgs_3dep" : "mapbox_terrain",
    center_amsl_ft,
    data_source_note: center_amsl_ft == null ? "USGS 3DEP elevation unavailable for this point" : null,
  };
}

async function buildFloodplainMap(ctx) {
  const { geo, lat, lng, mapboxToken, base44, jurisdiction, fallbacks, cacheStats } = ctx;
  let layer = await cacheGet(base44, jurisdiction, "fema");
  let data_source = "cache:fema";
  if (!layer) {
    cacheStats.misses++;
    const f = await fetchFEMA(geo);
    if (f.ok && f.geojson) {
      await cacheSet(base44, jurisdiction, "fema", f.geojson, f.data_source);
      layer = { geojson: f.geojson, data_source: f.data_source };
      data_source = "fema_nfhl";
    } else if (f.ok) {
      data_source = "fema_nfhl:no_features";
    } else {
      fallbacks.push(`floodplain:${f.reason}`);
      console.log(`[INFO] MAP_FALLBACK floodplain:${f.reason}`);
      data_source = "unavailable";
    }
  } else {
    cacheStats.hits++;
  }
  const overlays = layer?.geojson ? [buildGeoJsonOverlay(layer.geojson)] : [];
  return {
    type: "floodplain",
    url: buildMapUrl({ geo, basemap: "aerial", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    data_source_note: data_source === "unavailable" ? "FEMA NFHL unavailable — verify flood zone with FEMA Map Service Center" : null,
  };
}

async function buildZoningMap(ctx) {
  const { geo, lat, lng, mapboxToken, base44, jurisdiction, fallbacks, cacheStats } = ctx;
  let layer = await cacheGet(base44, jurisdiction, "zoneomics_zoning");
  let data_source = "cache:zoneomics";
  let zone_code = null;
  if (!layer) {
    cacheStats.misses++;
    const z = await fetchZoneomicsZoning(geo, Deno.env.get("ZONEOMICS_API_KEY"));
    if (z.ok && z.geojson) {
      await cacheSet(base44, jurisdiction, "zoneomics_zoning", z.geojson, z.data_source);
      layer = { geojson: z.geojson, data_source: z.data_source };
      zone_code = z.zone_code;
      data_source = "zoneomics";
    } else {
      fallbacks.push(`zoning:${z.reason || "no_features"}`);
      console.log(`[INFO] MAP_FALLBACK zoning:${z.reason || "no_features"}`);
      data_source = "unavailable";
    }
  } else {
    cacheStats.hits++;
    zone_code = layer.geojson?.features?.[0]?.properties?.zone_code || null;
  }
  const overlays = layer?.geojson ? [buildGeoJsonOverlay(layer.geojson)] : [];
  return {
    type: "zoning",
    url: buildMapUrl({ geo, basemap: "light", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    zone_code,
    data_source_note: data_source === "unavailable" ? "Zoning polygon unavailable — verify with local zoning department" : null,
  };
}

async function buildFLUMap(ctx) {
  const { geo, lat, lng, mapboxToken, base44, jurisdiction, state, fallbacks, cacheStats, _force_flu_miss } = ctx;
  let layer = _force_flu_miss ? null : await cacheGet(base44, jurisdiction, "flu");
  let data_source = "cache:flu";
  if (!layer) {
    cacheStats.misses++;
    const f = _force_flu_miss
      ? { ok: false, reason: "forced_miss" }
      : await fetchFLU(geo, jurisdiction, state);
    if (f.ok && f.geojson) {
      await cacheSet(base44, jurisdiction, "flu", f.geojson, f.data_source);
      layer = { geojson: f.geojson, data_source: f.data_source };
      data_source = f.data_source;
    } else {
      fallbacks.push(`flu:${f.reason || "no_features"}`);
      console.log(`[INFO] MAP_FALLBACK flu:${f.reason || "no_features"}`);
      data_source = "unavailable";
    }
  } else {
    cacheStats.hits++;
    data_source = layer.data_source === "state_fallback" ? "cache:flu:state_fallback" : "cache:flu";
  }
  const overlays = layer?.geojson ? [buildGeoJsonOverlay(layer.geojson)] : [];
  return {
    type: "flu",
    url: buildMapUrl({ geo, basemap: "light", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    data_source_note: data_source === "unavailable"
      ? `Future Land Use layer not published for ${jurisdiction} — verify with county planning`
      : null,
  };
}

async function buildWetlandsMap(ctx) {
  const { geo, lat, lng, mapboxToken, base44, jurisdiction, fallbacks, cacheStats } = ctx;
  let layer = await cacheGet(base44, jurisdiction, "nwi");
  let data_source = "cache:nwi";
  if (!layer) {
    cacheStats.misses++;
    const w = await fetchNWI(geo);
    if (w.ok && w.geojson) {
      await cacheSet(base44, jurisdiction, "nwi", w.geojson, w.data_source);
      layer = { geojson: w.geojson, data_source: w.data_source };
      data_source = "fws_nwi";
    } else if (w.ok) {
      data_source = "fws_nwi:no_features";
    } else {
      fallbacks.push(`wetlands:${w.reason}`);
      console.log(`[INFO] MAP_FALLBACK wetlands:${w.reason}`);
      data_source = "unavailable";
    }
  } else {
    cacheStats.hits++;
  }
  const overlays = layer?.geojson ? [buildGeoJsonOverlay(layer.geojson)] : [];
  return {
    type: "wetlands",
    url: buildMapUrl({ geo, basemap: "aerial", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    data_source_note: data_source === "unavailable" ? "FWS NWI unavailable for this bbox" : null,
  };
}

async function buildClosestAirportMap(ctx) {
  const { geo, lat, lng, mapboxToken, fallbacks } = ctx;
  let feature_name = null, featLat = null, featLng = null;
  let distance_mi = null, distance_ft = null;
  let data_source = "supabase_airports";
  try {
    const rpcUrl = `${SCIP_SUPABASE_URL}/rest/v1/rpc/nearest_airport`;
    const r = await fetchWithTimeout(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SCIP_SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SCIP_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ center_lat: Number(lat), center_lon: Number(lng), include_closed: false }),
    }, 15000);
    if (r.ok) {
      const data = await r.json();
      const d = Array.isArray(data) ? data[0] : data;
      if (d && d.latitude_deg != null && d.longitude_deg != null) {
        featLat = Number(d.latitude_deg);
        featLng = Number(d.longitude_deg);
        feature_name = d.airport_callnumber || "Unknown";
        // Compute distance LOCALLY via haversine — zero API cost, lat/lng order verified
        distance_mi = parseFloat(haversineMiles(lat, lng, featLat, featLng).toFixed(2));
        distance_ft = Math.round(distance_mi * 5280);
      } else {
        fallbacks.push("closest_airport:no_features");
        data_source = "unavailable";
      }
    } else {
      fallbacks.push(`closest_airport:http_${r.status || "err"}`);
      data_source = "unavailable";
    }
  } catch (e) {
    fallbacks.push(`closest_airport:${e.message}`);
    console.log(`[INFO] MAP_FALLBACK closest_airport:${e.message}`);
    data_source = "unavailable";
  }
  const overlays = [];
  if (featLat != null && featLng != null) {
    overlays.push(buildLineOverlay(lat, lng, featLat, featLng, "0a84ff"));
    // pin-l-airfield is Mapbox Maki's airplane icon — sits at the feature's real coord
    overlays.push(buildFeatureMarker(featLat, featLng, "airfield", "0a84ff"));
  }
  return {
    type: "closest_airport",
    url: buildMapUrl({ geo, basemap: "aerial", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    feature_name,
    distance_mi,
    distance_ft,
    distance_label: distance_mi != null ? `${distance_mi} mi / ${distance_ft.toLocaleString()} ft as the crow flies` : null,
    data_source_note: data_source === "unavailable" ? "No airport returned from Supabase nearest_airport RPC" : null,
  };
}

async function buildClosestTowerMap(ctx) {
  const { geo, lat, lng, mapboxToken, fallbacks } = ctx;
  let feature_name = null, featLat = null, featLng = null;
  let distance_mi = null, distance_ft = null;
  let data_source = "supabase_fcc_asr";
  try {
    const rpcUrl = `${SCIP_SUPABASE_URL}/rest/v1/rpc/nearest_cell_tower`;
    const r = await fetchWithTimeout(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SCIP_SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SCIP_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ center_lat: Number(lat), center_lon: Number(lng), radius_miles: null }),
    }, 15000);
    if (r.ok) {
      const data = await r.json();
      const t = Array.isArray(data) ? data[0] : data;
      if (t && t.latitude_deg != null && t.longitude_deg != null) {
        featLat = Number(t.latitude_deg);
        featLng = Number(t.longitude_deg);
        feature_name = t.call_letters || t.tower_registration_number || "Unknown";
        distance_mi = parseFloat(haversineMiles(lat, lng, featLat, featLng).toFixed(2));
        distance_ft = Math.round(distance_mi * 5280);
      } else {
        fallbacks.push("closest_tower:no_features");
        data_source = "unavailable";
      }
    } else {
      fallbacks.push(`closest_tower:http_${r.status || "err"}`);
      data_source = "unavailable";
    }
  } catch (e) {
    fallbacks.push(`closest_tower:${e.message}`);
    console.log(`[INFO] MAP_FALLBACK closest_tower:${e.message}`);
    data_source = "unavailable";
  }
  const overlays = [];
  if (featLat != null && featLng != null) {
    overlays.push(buildLineOverlay(lat, lng, featLat, featLng, "f59e0b"));
    // pin-l-communications-tower = Mapbox Maki communications-tower icon at real coord
    overlays.push(buildFeatureMarker(featLat, featLng, "communications-tower", "f59e0b"));
  }
  return {
    type: "closest_tower",
    url: buildMapUrl({ geo, basemap: "aerial", overlays, centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    feature_name,
    distance_mi,
    distance_ft,
    distance_label: distance_mi != null ? `${distance_mi} mi / ${distance_ft.toLocaleString()} ft as the crow flies` : null,
    data_source_note: data_source === "unavailable" ? "No tower returned from Supabase nearest_cell_tower RPC" : null,
  };
}

async function buildAerialMap(ctx) {
  const { geo, lat, lng, mapboxToken } = ctx;
  return {
    type: "aerial",
    url: buildMapUrl({ geo, basemap: "aerial", overlays: [], centerLat: lat, centerLng: lng, mapboxToken }),
    data_source: "mapbox_satellite",
  };
}

async function buildParcelMap(ctx) {
  const { geo, lat, lng, mapboxToken, apn, owner } = ctx;
  // Parcel boundary geometry not fetched here — caller passes via apn/owner labels.
  // If a parcel polygon geojson is later wired in, drop into overlays.
  return {
    type: "parcel",
    url: buildMapUrl({ geo, basemap: "aerial", overlays: [], centerLat: lat, centerLng: lng, mapboxToken }),
    data_source: "mapbox_satellite+realie_label",
    apn: apn || null,
    owner: owner || null,
  };
}

async function buildWindSpeedMap(ctx) {
  const { geo, lat, lng, mapboxToken, fallbacks } = ctx;
  let wind_speed_mph = null, wind_zone = null, data_source = "asce_7_22";
  try {
    const delta = 0.1;
    const mapExtent = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
    const url = `${ASCE_WIND_BASE}/identify?` + new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      sr: "4326", layers: "visible", tolerance: "20",
      mapExtent, imageDisplay: "800,600,96",
      returnGeometry: "false", f: "json",
    });
    const r = await fetchWithTimeout(url, {}, 10000);
    if (r.ok) {
      const data = await r.json();
      for (const result of (data.results || [])) {
        const raw = result.attributes?.["Classify.Pixel Value"]
                 || result.attributes?.["Pixel Value"]
                 || result.attributes?.["pixel_value"];
        if (!raw || raw === "NoData" || raw === "null") continue;
        const val = parseFloat(raw);
        if (isNaN(val) || val <= 0) continue;
        wind_speed_mph = Math.round(val);
        break;
      }
      if (wind_speed_mph != null) {
        wind_zone = wind_speed_mph >= 150 ? "extreme"
                  : wind_speed_mph >= 130 ? "high"
                  : wind_speed_mph >= 110 ? "moderate" : "low";
      } else {
        fallbacks.push("wind_speed:no_value");
        data_source = "unavailable";
      }
    } else {
      fallbacks.push(`wind_speed:http_${r.status || "err"}`);
      data_source = "unavailable";
    }
  } catch (e) {
    fallbacks.push(`wind_speed:${e.message}`);
    console.log(`[INFO] MAP_FALLBACK wind_speed:${e.message}`);
    data_source = "unavailable";
  }
  return {
    type: "wind_speed",
    url: buildMapUrl({ geo, basemap: "light", overlays: [], centerLat: lat, centerLng: lng, mapboxToken }),
    data_source,
    wind_speed_mph,
    wind_zone,
    data_source_note: data_source === "unavailable" ? "ASCE 7-22 wind speed unavailable — verify with state building code" : null,
  };
}

// ─────────────────────── target orchestrator ───────────────────────

async function buildTargetMaps(target, ctx) {
  const { base44, jurisdiction, state, mapboxToken, search_radius_mi, fallbacks, cacheStats } = ctx;
  const { label, site_name, lat, lng, apn, owner } = target;

  const _geo = computeSharedGeo(lat, lng, search_radius_mi);
  console.log(`[INFO] MAP_GEO target=${label} bbox=${JSON.stringify(_geo.bbox)} target_px=${JSON.stringify(_geo.target_px)}`);

  const mapCtx = {
    geo: _geo, lat, lng, apn, owner,
    base44, jurisdiction, state, mapboxToken,
    fallbacks, cacheStats,
    _force_flu_miss: ctx._force_flu_miss,
  };

  const isTargetA = label === "A";
  // Target A: all 11. B/C: aerial + parcel + floodplain.
  const builders = isTargetA
    ? [
        buildTopographyMap, buildFloodplainMap, buildZoningMap, buildFLUMap,
        buildWetlandsMap, buildClosestAirportMap, buildClosestTowerMap,
        buildAerialMap, buildParcelMap, buildWindSpeedMap,
      ]
    : [buildAerialMap, buildParcelMap, buildFloodplainMap];

  const maps = [];
  for (const b of builders) {
    const m = await b(mapCtx);
    maps.push(m);
  }

  // Filename dedup: strip any existing label token so it can't be doubled
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const base = site_name
    .replace(/[^\w-]/g, "_")
    .replace(/_*Target[ABC]/gi, "")
    .replace(/_+$/, "")
    .replace(/^_+/, "")
    .trim()
    .substring(0, 40);

  const mapsWithFilenames = maps.map((m) => ({
    ...m,
    filename: `${base}_Target${label}_${m.type}_${today}.png`,
  }));

  return { label, site_name, _geo, maps: mapsWithFilenames };
}

// ─────────────────────── handler ───────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      targets = [],
      jurisdiction,
      state,
      search_radius_mi = DEFAULT_RADIUS_MI,
      agent_name = null,
      _force_flu_miss = false, // protocol test #5
    } = body || {};

    if (!targets.length) return Response.json({ error: "targets[] required (1-3 entries)" }, { status: 400 });
    if (!jurisdiction || !state) return Response.json({ error: "jurisdiction and state required" }, { status: 400 });

    const mapboxToken = Deno.env.get("MAPBOX_ACCESS_TOKEN");
    if (!mapboxToken) return Response.json({ error: "MAPBOX_ACCESS_TOKEN not configured" }, { status: 500 });

    const fallbacks = [];
    const cacheStats = { hits: 0, misses: 0 };

    const ctx = {
      base44, jurisdiction, state, mapboxToken,
      search_radius_mi, fallbacks, cacheStats, agent_name,
      _force_flu_miss,
    };

    // Build all targets — sequential to keep cache writes ordered (later targets benefit
    // from earlier targets' cache writes in the same jurisdiction).
    const targetResults = [];
    for (const target of targets.slice(0, 3)) {
      const result = await buildTargetMaps(target, ctx);
      targetResults.push(result);
    }

    const maps_generated = targetResults.reduce((sum, t) => sum + t.maps.length, 0);

    return Response.json({
      targets: targetResults,
      _meta: {
        jurisdiction, state, agent_name,
        maps_generated,
        cache_hits: cacheStats.hits,
        cache_misses: cacheStats.misses,
        fallbacks,
        duration_ms: Date.now() - t0,
      },
    });
  } catch (error) {
    console.log(`[ERROR] scipMapSuite: ${error.message}`);
    return Response.json({
      targets: [],
      _meta: { error: error.message, duration_ms: Date.now() - t0 },
    }, { status: 500 });
  }
});