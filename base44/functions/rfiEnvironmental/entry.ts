import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const MAX_RADIUS_MILES = 3;
const EMPTY_FC = { type: "FeatureCollection", features: [] };

const SOURCES = {
  wetlands: "https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query",
  nhd: "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer",
  floodZones: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query",
};

function readProperty(properties, ...names) {
  const entries = Object.entries(properties || {});
  for (const name of names) {
    const target = name.toLowerCase();
    const match = entries.find(([key]) => key.toLowerCase() === target || key.toLowerCase().endsWith(`.${target}`));
    if (match) return match[1];
  }
  return null;
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeWetlandType(rawType, attribute) {
  const type = String(rawType || "").toLowerCase();
  const code = String(attribute || "").toUpperCase();

  if (type.includes("emergent")) return "Freshwater Emergent";
  if (type.includes("forested") || type.includes("shrub")) {
    return code.startsWith("PSS") ? "Freshwater Shrub" : "Freshwater Forested";
  }
  if (type.includes("deepwater")) return "Marine";
  if (type.includes("estuarine") || type.includes("marine wetland")) return "Estuarine";
  if (type.includes("riverine")) return "Riverine";
  if (type.includes("lake") || code.startsWith("L")) return "Lacustrine";
  if (type.includes("pond")) return "Freshwater Pond";
  return "Other";
}

async function fetchGeoJson(url, params, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${url}?${params}`, {
      headers: { Accept: "application/geo+json, application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
    const data = await response.json();
    if (data?.error) throw new Error(data.error.message || `${label} query failed`);
    return {
      type: "FeatureCollection",
      features: Array.isArray(data?.features) ? data.features : [],
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWetlands(lat, lng, radiusMeters) {
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(radiusMeters),
    units: "esriSRUnit_Meter",
    outFields: "Wetlands.WETLAND_TYPE,Wetlands.ATTRIBUTE,Wetlands.ACRES",
    returnGeometry: "true",
    geometryPrecision: "6",
    resultRecordCount: "2000",
  });
  const data = await fetchGeoJson(SOURCES.wetlands, params, "USFWS NWI");
  return {
    type: "FeatureCollection",
    features: data.features.map((feature) => {
      const rawType = readProperty(feature.properties, "WETLAND_TYPE");
      const attribute = readProperty(feature.properties, "ATTRIBUTE");
      const acres = cleanNumber(readProperty(feature.properties, "ACRES"));
      return {
        ...feature,
        properties: {
          WETLAND_TYPE: normalizeWetlandType(rawType, attribute),
          OFFICIAL_WETLAND_TYPE: rawType || "Other",
          ATTRIBUTE: attribute || null,
          ACRES: acres == null ? null : Number(acres.toFixed(2)),
          SOURCE: "USFWS National Wetlands Inventory",
        },
      };
    }),
  };
}

async function fetchNhdLayer(layerId, kind, lat, lng, radiusMeters) {
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(radiusMeters),
    units: "esriSRUnit_Meter",
    outFields: "GNIS_NAME,FTYPE,FCODE",
    returnGeometry: "true",
    geometryPrecision: "6",
    resultRecordCount: "2000",
  });
  const data = await fetchGeoJson(`${SOURCES.nhd}/${layerId}/query`, params, `USGS NHD ${kind}`);
  return data.features.map((feature) => ({
    ...feature,
    properties: {
      HYDRO_TYPE: kind,
      GNIS_NAME: readProperty(feature.properties, "GNIS_NAME") || "Unnamed",
      FTYPE: readProperty(feature.properties, "FTYPE") || null,
      FCODE: readProperty(feature.properties, "FCODE") || null,
      SOURCE: "USGS National Hydrography Dataset",
    },
  }));
}

async function fetchHydrology(lat, lng, radiusMeters) {
  const results = await Promise.allSettled([
    fetchNhdLayer(6, "River / Stream", lat, lng, radiusMeters),
    fetchNhdLayer(9, "Water Area", lat, lng, radiusMeters),
    fetchNhdLayer(12, "Lake / Pond", lat, lng, radiusMeters),
  ]);
  const features = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!features.length && results.every((result) => result.status === "rejected")) {
    throw new Error("USGS NHD queries failed");
  }
  return {
    type: "FeatureCollection",
    features,
  };
}

async function fetchFloodZones(lat, lng, radiusMeters) {
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(radiusMeters),
    units: "esriSRUnit_Meter",
    outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE",
    returnGeometry: "true",
    geometryPrecision: "6",
    resultRecordCount: "2000",
  });
  const data = await fetchGeoJson(SOURCES.floodZones, params, "FEMA NFHL");
  return {
    type: "FeatureCollection",
    features: data.features.map((feature) => {
      const floodZone = readProperty(feature.properties, "FLD_ZONE") || "Unknown";
      const bfe = cleanNumber(readProperty(feature.properties, "STATIC_BFE"));
      return {
        ...feature,
        properties: {
          FLOOD_ZONE: floodZone,
          FLD_ZONE: floodZone,
          ZONE_SUBTY: readProperty(feature.properties, "ZONE_SUBTY") || null,
          SFHA_TF: readProperty(feature.properties, "SFHA_TF") || null,
          BFE: bfe == null || bfe <= -9990 ? null : Number(bfe.toFixed(1)),
          SOURCE: "FEMA National Flood Hazard Layer",
        },
      };
    }),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return Response.json({ error: "Valid lat/lng required" }, { status: 400 });
    }

    const requestedRadius = Number(body?.radiusMiles ?? MAX_RADIUS_MILES);
    const radiusMiles = Math.min(
      Math.max(Number.isFinite(requestedRadius) ? requestedRadius : MAX_RADIUS_MILES, 0.1),
      MAX_RADIUS_MILES
    );
    const radiusMeters = radiusMiles * 1609.344;

    const results = await Promise.allSettled([
      fetchWetlands(lat, lng, radiusMeters),
      fetchHydrology(lat, lng, radiusMeters),
      fetchFloodZones(lat, lng, radiusMeters),
    ]);
    const labels = ["wetlands", "hydrology", "floodZones"];
    const failures = results
      .map((result, index) => result.status === "rejected"
        ? { dataset: labels[index], error: result.reason?.message || "Lookup failed" }
        : null)
      .filter(Boolean);

    if (failures.length === results.length) throw new Error("All environmental data sources failed");

    const wetlands = results[0].status === "fulfilled" ? results[0].value : EMPTY_FC;
    const hydrology = results[1].status === "fulfilled" ? results[1].value : EMPTY_FC;
    const floodZones = results[2].status === "fulfilled" ? results[2].value : EMPTY_FC;

    return Response.json({
      wetlands,
      hydrology,
      floodZones,
      metadata: {
        radiusMiles,
        center: { lat, lng },
        counts: {
          wetlands: wetlands.features.length,
          hydrology: hydrology.features.length,
          floodZones: floodZones.features.length,
        },
        partial: failures.length > 0,
        failures,
        screeningOnly: true,
        sources: {
          wetlands: "USFWS National Wetlands Inventory",
          hydrology: "USGS National Hydrography Dataset",
          floodZones: "FEMA National Flood Hazard Layer",
        },
        disclaimer:
          "Environmental layers are for preliminary screening only and do not replace field delineation, floodplain management, permitting, or agency determinations.",
      },
    });
  } catch (error) {
    console.log(`[ERROR] rfiEnvironmental: ${error?.message || error}`);
    return Response.json({ error: "Environmental intelligence lookup failed" }, { status: 500 });
  }
});
