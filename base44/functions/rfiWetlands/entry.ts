import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const NWI_QUERY_URL =
  "https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query";
const MAX_RADIUS_MILES = 3;
const PAGE_SIZE = 1000;
const MAX_PAGES = 4;

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readProperty(properties, name) {
  return properties?.[name] ?? properties?.[`Wetlands.${name}`] ?? null;
}

function normalizeWetlandType(rawType, attribute) {
  const type = String(rawType || "").toLowerCase();
  const code = String(attribute || "").toUpperCase();

  if (type.includes("emergent")) return "Freshwater Emergent";
  if (type.includes("forested") || type.includes("shrub")) {
    return code.startsWith("PSS") ? "Freshwater Shrub" : "Freshwater Forested";
  }
  if (type.includes("estuarine") && type.includes("deepwater")) return "Marine";
  if (type.includes("marine") && type.includes("deepwater")) return "Marine";
  if (type.includes("estuarine") || type.includes("marine wetland")) return "Estuarine";
  if (type.includes("riverine")) return "Riverine";
  if (type.includes("lake") || code.startsWith("L")) return "Lacustrine";
  if (type.includes("pond")) return "Freshwater Pond";
  return "Other";
}

async function fetchPage(lat, lng, radiusMeters, offset) {
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
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    orderByFields: "Wetlands.OBJECTID ASC",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${NWI_QUERY_URL}?${params}`, {
      headers: { Accept: "application/geo+json, application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`USFWS NWI returned HTTP ${response.status}`);
    const data = await response.json();
    if (data?.error) {
      throw new Error(data.error.message || "USFWS NWI query failed");
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
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

    const features = [];
    let exceededTransferLimit = false;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      const data = await fetchPage(lat, lng, radiusMeters, pageIndex * PAGE_SIZE);
      const pageFeatures = Array.isArray(data?.features) ? data.features : [];
      features.push(...pageFeatures);
      exceededTransferLimit = Boolean(data?.exceededTransferLimit);
      if (!exceededTransferLimit || pageFeatures.length < PAGE_SIZE) break;
    }

    const normalized = features.map((feature) => {
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
    });

    const categories = [...new Set(normalized.map((feature) => feature.properties.WETLAND_TYPE))].sort();

    return Response.json({
      type: "FeatureCollection",
      features: normalized,
      metadata: {
        source: "USFWS National Wetlands Inventory",
        sourceUrl: "https://www.fws.gov/program/national-wetlands-inventory",
        radiusMiles,
        featureCount: normalized.length,
        categories,
        truncated: exceededTransferLimit && normalized.length >= PAGE_SIZE * MAX_PAGES,
        screeningOnly: true,
        disclaimer:
          "NWI mapping is a screening resource and does not establish regulatory wetland jurisdiction or replace a field delineation.",
      },
    });
  } catch (error) {
    console.log(`[ERROR] rfiWetlands: ${error?.message || error}`);
    return Response.json({ error: "Wetlands lookup failed" }, { status: 500 });
  }
});
