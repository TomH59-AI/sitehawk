import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";

// Parcel Intelligence Engine — one call returns everything for a clicked point:
// elevation + slope (USGS EPQS), FEMA flood zone, NRCS SSURGO soil, NLCD land
// cover + impervious (MRLC WMS), Zoneomics zoning, HIFLD utility territory,
// and nearest imported fiber route (Supabase PostGIS).

const NLCD_CLASSES = {
  11: "Open Water", 12: "Perennial Ice/Snow", 21: "Developed, Open Space",
  22: "Developed, Low Intensity", 23: "Developed, Medium Intensity", 24: "Developed, High Intensity",
  31: "Barren Land", 41: "Deciduous Forest", 42: "Evergreen Forest", 43: "Mixed Forest",
  52: "Shrub/Scrub", 71: "Grassland/Herbaceous", 81: "Pasture/Hay", 82: "Cultivated Crops",
  90: "Woody Wetlands", 95: "Emergent Herbaceous Wetlands",
};

async function jsonFetch(url, options = {}) {
  try {
    const { timeoutMs = 9000, ...rest } = options;
    const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function epqsFt(lon, lat) {
  const j = await jsonFetch(`https://epqs.nationalmap.gov/v1/json?x=${lon}&y=${lat}&units=Feet&wkid=4326&includeDate=false`);
  const v = Number(j?.value);
  return Number.isFinite(v) && v > -10000 ? v : null;
}

// Slope from a 4-point elevation cross ~30m around the click.
async function elevationAndSlope(lon, lat) {
  const d = 0.0003; // ~33m N-S
  const [center, north, south, east, west] = await Promise.all([
    epqsFt(lon, lat), epqsFt(lon, lat + d), epqsFt(lon, lat - d),
    epqsFt(lon + d, lat), epqsFt(lon - d, lat),
  ]);
  let slope = null;
  if ([north, south, east, west].every((v) => v != null)) {
    const runFt = 2 * d * 364000; // deg → ft (approx, mid-latitudes)
    const gradNS = (north - south) / runFt;
    const gradEW = (east - west) / (runFt * Math.cos((lat * Math.PI) / 180));
    slope = Math.round(Math.sqrt(gradNS ** 2 + gradEW ** 2) * 1000) / 10; // %
  }
  return { elevation_ft: center == null ? null : Math.round(center * 10) / 10, slope_percent: slope };
}

async function floodZone(lon, lat) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
    returnGeometry: "false", f: "json",
  });
  const j = await jsonFetch(`https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?${params}`, {
    headers: { "User-Agent": "SiteHawk/1.0", "Accept": "application/json" },
    timeoutMs: 15000,
  });
  if (!j) return { zone: null, subtype: null, sfha: null };
  const a = j.features?.[0]?.attributes;
  // No polygon intersection = outside SFHA = Zone X (minimal risk)
  if (!a) return { zone: "X", subtype: null, sfha: false };
  return { zone: (a.FLD_ZONE || "X").trim().toUpperCase(), subtype: a.ZONE_SUBTY || null, sfha: a.SFHA_TF === "T" };
}

async function soilType(lon, lat) {
  const query = `SELECT mu.musym, mu.muname FROM mapunit mu WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lon} ${lat})'))`;
  const j = await jsonFetch("https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, format: "JSON" }),
  });
  const row = j?.Table?.[0];
  return { symbol: row?.[0] || null, name: row?.[1] || null };
}

async function nlcdSample(layer, lon, lat) {
  const pad = 0.005;
  const params = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo",
    LAYERS: layer, QUERY_LAYERS: layer, SRS: "EPSG:4326",
    BBOX: `${lon - pad},${lat - pad},${lon + pad},${lat + pad}`,
    WIDTH: "101", HEIGHT: "101", X: "50", Y: "50",
    INFO_FORMAT: "application/json", FEATURE_COUNT: "1",
  });
  const j = await jsonFetch(`https://www.mrlc.gov/geoserver/wms?${params}`);
  const v = j?.features?.[0]?.properties;
  const value = v ? Number(v.GRAY_INDEX ?? Object.values(v)[0]) : NaN;
  return Number.isFinite(value) ? value : null;
}

// Zoning via the zone-resolve edge function (same source as Section 4 maps).
async function zoning(lon, lat) {
  const anonKey = Deno.env.get("ZONE_RESOLVE_ANON_KEY");
  if (!anonKey) return { code: null, name: null, jurisdiction: null };
  const j = await jsonFetch("https://vkiwvctpxhbsoeagivnl.supabase.co/functions/v1/zone-resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    body: JSON.stringify({ lat, lon }),
  });
  const zone = j?.zoning && Object.keys(j.zoning || {}).length ? j.zoning : null;
  return {
    code: zone?.code || zone?.zone_code || j?.flu?.code || null,
    name: zone?.label || zone?.zone_name || j?.flu?.label || null,
    source: zone ? "zoning" : j?.flu ? "future land use" : null,
    jurisdiction: j?.jurisdiction || j?.county || null,
  };
}

async function utilityTerritory(lon, lat) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: "NAME,TYPE,HOLDING_CO", returnGeometry: "false", f: "json",
  });
  const j = await jsonFetch(`https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query?${params}`);
  const a = j?.features?.[0]?.attributes;
  return { name: a?.NAME || null, type: a?.TYPE || null, holding_company: a?.HOLDING_CO || null };
}

async function nearestFiber(lon, lat) {
  try {
    const rawUrl = Deno.env.get("HAWK_SUPABASE_URL");
    const rawKey = Deno.env.get("HAWK_SUPABASE_ANON_KEY");
    if (!rawUrl || !rawKey) return { status: "unavailable" };
    const cleanedUrl = rawUrl.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s/]+$/, "");
    const url = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
    const supabase = createClient(url, rawKey.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s]+$/, ""), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const pad = 0.5; // ~35 mile search window
    const result = await supabase.rpc("fiber_provider_routes_in_bbox", {
      providers: null,
      west: lon - pad, south: lat - pad, east: lon + pad, north: lat + pad,
      candidate_lon: lon, candidate_lat: lat,
    });
    if (result.error) return { status: "not_initialized" };
    let best = null;
    for (const row of result.data || []) {
      if (row.distance_miles == null) continue;
      if (!best || row.distance_miles < best.distance_miles) best = row;
    }
    if (!best) return { status: "no_routes_in_range" };
    return {
      status: "ok",
      provider: best.provider,
      route_name: best.route_name || null,
      distance_miles: Math.round(best.distance_miles * 100) / 100,
    };
  } catch {
    return { status: "unavailable" };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon } = await req.json();
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json({ error: "lat and lon are required" }, { status: 400 });
    }

    const [elev, flood, soil, landCoverCode, impervious, zone, utility, fiber] = await Promise.all([
      elevationAndSlope(longitude, latitude),
      floodZone(longitude, latitude),
      soilType(longitude, latitude),
      nlcdSample("mrlc_display:NLCD_2021_Land_Cover_L48", longitude, latitude),
      nlcdSample("mrlc_display:NLCD_2021_Impervious_L48", longitude, latitude),
      zoning(longitude, latitude),
      utilityTerritory(longitude, latitude),
      nearestFiber(longitude, latitude),
    ]);

    return Response.json({
      lat: latitude,
      lon: longitude,
      elevation_ft: elev.elevation_ft,
      slope_percent: elev.slope_percent,
      flood: flood,
      soil: soil,
      land_cover: landCoverCode == null ? { code: null, label: null }
        : { code: landCoverCode, label: NLCD_CLASSES[landCoverCode] || `Class ${landCoverCode}` },
      impervious_percent: impervious,
      zoning: zone,
      utility: utility,
      fiber: fiber,
    });
  } catch (error) {
    console.error("parcelClickIntel error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});