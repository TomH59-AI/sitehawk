import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

const SOURCES = {
  transmission_lines: {
    url: "https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/HIFLD_US_Electric_Power_Transmission_Lines/FeatureServer/0/query",
    name: "HIFLD U.S. Electric Power Transmission Lines",
    date: "2022",
    fields: "*",
    limit: 5000,
  },
  substations: {
    url: "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Electric_Substations/FeatureServer/0/query",
    name: "HIFLD Electric Substations national public archive",
    date: "2021 public archive; catalog reclassified restricted-public in 2023",
    fields: "*",
    limit: 3000,
  },
  service_territories: {
    url: "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query",
    name: "HIFLD Electric Retail Service Territories",
    date: "2022",
    fields: "*",
    limit: 100,
  },
};

function pick(properties, names) {
  for (const name of names) {
    const value = properties?.[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function coordinatePairs(value, output = []) {
  if (!Array.isArray(value)) return output;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    output.push([Number(value[0]), Number(value[1])]);
    return output;
  }
  for (const child of value) coordinatePairs(child, output);
  return output;
}

function geometryDistanceMiles(geometry, candidate) {
  if (!geometry || !candidate) return null;
  const pairs = coordinatePairs(geometry.coordinates);
  if (!pairs.length) return null;
  return Math.min(...pairs.map(([lon, lat]) => haversineMiles(candidate.lat, candidate.lon, lat, lon)));
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function containsCandidate(geometry, candidate) {
  if (!geometry || !candidate) return false;
  const point = [candidate.lon, candidate.lat];
  if (geometry.type === "Polygon") return pointInRing(point, geometry.coordinates[0] || []);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygon) => pointInRing(point, polygon[0] || []));
  return false;
}

function formatSourceDate(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function normalizeFeature(feature, layer, candidate, source) {
  const raw = feature.properties || {};
  const distance = geometryDistanceMiles(feature.geometry, candidate);
  const voltage = pick(raw, ["VOLTAGE", "MAX_VOLT", "MAX_VOLTAGE", "MIN_VOLT", "VOLT_CLASS"]);
  const owner = (layer === "service_territories"
    ? pick(raw, ["NAME", "OWNER", "HOLDING_CO"])
    : pick(raw, ["OWNER", "OWNER_NAME", "HOLDING_CO"])) || "Not available";
  const operator = pick(raw, ["OPERATOR", "OPER_NAME"]) || (layer === "transmission_lines" ? owner : "Not available");
  const lineName = pick(raw, ["LINE_NAME", "NAME", "ID"]) || [raw.SUB_1, raw.SUB_2].filter(Boolean).join(" – ") || null;
  const facilityName = pick(raw, ["FACILITY", "FACILITY_NAME", "NAME", "ID"]);
  const type = pick(raw, ["TYPE", "CLASS", "SUB_TYPE"]);
  const classification = layer === "transmission_lines"
    ? (/underground|cable/i.test(String(type || "")) ? "Underground" : "Overhead")
    : type;

  return {
    type: "Feature",
    geometry: feature.geometry,
    properties: {
      id: pick(raw, ["ID", "OBJECTID", "OBJECTID_1"]),
      name: layer === "transmission_lines" ? lineName : facilityName,
      line_name: lineName,
      facility_name: facilityName,
      owner,
      operator,
      voltage: voltage == null ? null : String(voltage),
      voltage_kv: Number.parseFloat(String(voltage).replace(/[^0-9.]/g, "")) || 0,
      voltage_class: pick(raw, ["VOLT_CLASS", "VOLTAGE", "MAX_VOLT"]),
      status: pick(raw, ["STATUS", "STATE"]),
      classification,
      source: source.name,
      source_date: formatSourceDate(pick(raw, ["SOURCEDATE", "SOURCE_DATE", "VAL_DATE"]), source.date),
      distance_miles: distance == null ? null : Number(distance.toFixed(2)),
    },
  };
}

function buildSummary(layer, features, candidate) {
  if (layer === "transmission_lines") {
    const nearest = features.filter((feature) => feature.properties.distance_miles != null)
      .sort((a, b) => a.properties.distance_miles - b.properties.distance_miles)[0];
    const voltageClasses = [...new Set(features.map((feature) => feature.properties.voltage).filter(Boolean))];
    return { nearest_line_miles: nearest?.properties.distance_miles ?? null, nearest_line_name: nearest?.properties.line_name ?? null, voltage_classes: voltageClasses };
  }
  if (layer === "substations") {
    const nearest = features.filter((feature) => feature.properties.distance_miles != null)
      .sort((a, b) => a.properties.distance_miles - b.properties.distance_miles)[0];
    return { nearest_substation_miles: nearest?.properties.distance_miles ?? null, nearest_substation_name: nearest?.properties.facility_name ?? null, nearest_substation_voltage: nearest?.properties.voltage ?? null };
  }
  const containing = features.find((feature) => containsCandidate(feature.geometry, candidate)) || features[0];
  return { power_owner: containing?.properties.owner ?? null, power_operator: containing?.properties.operator ?? null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { layer = "transmission_lines", bbox, candidate } = await req.json();
    const source = SOURCES[layer];
    if (!source) return Response.json({ error: "Unsupported power-grid layer" }, { status: 400 });
    if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(Number(value)))) {
      return Response.json({ error: "bbox=[west,south,east,north] is required" }, { status: 400 });
    }

    const normalizedBbox = bbox.map(Number);
    const normalizedCandidate = Number.isFinite(Number(candidate?.lat)) && Number.isFinite(Number(candidate?.lon))
      ? { lat: Number(candidate.lat), lon: Number(candidate.lon) }
      : null;
    const cacheKey = JSON.stringify([layer, normalizedBbox.map((value) => Number(value.toFixed(5))), normalizedCandidate]);
    const cache = globalThis.__sitehawkPowerGridCache ||= new Map();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return Response.json({ ...cached.payload, cache: "hit" });

    const [west, south, east, north] = normalizedBbox;
    const params = new URLSearchParams({
      where: "1=1",
      geometry: JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: source.fields,
      returnGeometry: "true",
      f: "geojson",
      resultRecordCount: String(source.limit),
      geometryPrecision: "5",
      maxAllowableOffset: layer === "service_territories" ? "0.01" : "0.00005",
    });

    const response = await fetch(`${source.url}?${params.toString()}`);
    if (!response.ok) throw new Error(`HIFLD ${layer} request failed with HTTP ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error(body.error.message || `HIFLD ${layer} query failed`);

    const features = (body.features || []).map((feature) => normalizeFeature(feature, layer, normalizedCandidate, source));
    const payload = {
      geojson: { type: "FeatureCollection", features },
      metadata: { source: source.name, source_date: source.date, classification: layer === "substations" ? "Public archive; current HIFLD catalog is restricted-public" : "Public", queried_bbox: normalizedBbox },
      summary: buildSummary(layer, features, normalizedCandidate),
      count: features.length,
      cache: "miss",
    };

    cache.set(cacheKey, { payload, expiresAt: Date.now() + 10 * 60 * 1000 });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return Response.json(payload);
  } catch (error) {
    console.error("hifldTransmissionLines error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});