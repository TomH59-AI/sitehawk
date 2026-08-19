const MAX_FEATURES = 500;
const MAX_LINE_COORDS = 5000;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanString(value, maxLength = 160) {
  if (value == null) return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeStatus(record = {}) {
  const code = cleanString(record.xnet_code || record.status || "", 40)?.toLowerCase() || "";
  const description = cleanString(record.xnet_description || record.network_status || "", 80)?.toLowerCase() || "";
  if (code === "o" || /on[- ]?net|lit/.test(code) || /on[- ]?net|lit/.test(description)) return "on-net";
  if (code === "n" || /near[- ]?net/.test(code) || /near[- ]?net/.test(description)) return "near-net";
  if (/planned|proposed|future/.test(code) || /planned|proposed|future/.test(description)) return "planned";
  return "unknown";
}

function safeProperties(record = {}, index = 0, featureType = "point") {
  const operator = cleanString(
    record.operator || record.carriername || record.carrier || record.owner || record.provider
  );
  const carriers = Array.isArray(record.carrier_list)
    ? record.carrier_list.map((value) => cleanString(value, 80)).filter(Boolean).slice(0, 20)
    : operator
      ? [operator]
      : [];
  return {
    id: cleanString(record.id || record.site_id || record.route_id || record.clli, 96) || `cf-${featureType}-${index}`,
    feature_type: featureType,
    kind: cleanString(record.kind || record.type || (featureType === "run" ? "fiber_run" : "lit_building"), 64),
    operator,
    carrier_list: carriers,
    capacity_gbps: finite(record.capacity_gbps || record.capacity || record.bandwidth_gbps),
    status: normalizeStatus(record),
    label: cleanString(
      record.label || [record.street, record.city, record.state].filter(Boolean).join(", ")
    ),
    source: "CarrierFinder",
  };
}

function validPointCoordinates(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = finite(value[0]);
  const lat = finite(value[1]);
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}

function sanitizeLineCoordinates(value, depth = 0) {
  if (!Array.isArray(value) || value.length < 2 || depth > 1) return null;
  if (typeof value[0]?.[0] === "number" || typeof value[0]?.[0] === "string") {
    const line = value.slice(0, MAX_LINE_COORDS).map(validPointCoordinates).filter(Boolean);
    return line.length >= 2 ? line : null;
  }
  const lines = value.map((line) => sanitizeLineCoordinates(line, depth + 1)).filter(Boolean);
  return lines.length ? lines : null;
}

function routeCandidates(raw = {}) {
  const candidates = [
    raw?.runs,
    raw?.routes,
    raw?.fiber_runs,
    raw?.features,
    raw?.data?.runs,
    raw?.data?.routes,
    raw?.data?.features,
  ];
  return candidates.find(Array.isArray) || [];
}

function pointCandidates(raw = {}) {
  const candidates = [
    raw?.site,
    raw?.sites,
    raw?.points,
    raw?.locations,
    raw?.data?.site,
    raw?.data?.sites,
    raw?.data?.points,
  ];
  const found = candidates.find((value) => Array.isArray(value) || (value && typeof value === "object"));
  if (!found) return [];
  return Array.isArray(found) ? found : [found];
}

function normalizeRoutes(raw) {
  return routeCandidates(raw).slice(0, MAX_FEATURES).map((record, index) => {
    if (!record || typeof record !== "object") return null;
    const geometry = record.type === "Feature" ? record.geometry : record.geometry || {};
    const geometryType = geometry?.type || record.geometry_type;
    const sourceCoordinates = geometry?.coordinates || record.coordinates || record.path;
    const coordinates = sanitizeLineCoordinates(sourceCoordinates);
    if (!coordinates) return null;
    const type = geometryType === "MultiLineString" || Array.isArray(coordinates?.[0]?.[0])
      ? "MultiLineString"
      : "LineString";
    return {
      type: "Feature",
      geometry: { type, coordinates },
      properties: safeProperties(record.properties || record, index, "run"),
    };
  }).filter(Boolean);
}

function normalizePoints(raw, offset = 0) {
  return pointCandidates(raw).slice(0, MAX_FEATURES).map((record, index) => {
    if (!record || typeof record !== "object") return null;
    const props = record.properties || record;
    const geometry = record.type === "Feature" ? record.geometry : record.geometry || {};
    const coordinates = validPointCoordinates(
      geometry?.coordinates || [
        props.longitude ?? props.lon ?? props.lng,
        props.latitude ?? props.lat,
      ]
    );
    if (!coordinates) return null;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: safeProperties(props, offset + index, "point"),
    };
  }).filter(Boolean);
}

function normalizeTelcoPoint(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const ok = !raw.status || String(raw.status).toLowerCase() === "ok";
  if (!ok) return null;
  const coordinates = validPointCoordinates([
    raw.telco_co_lon ?? raw.co_lon ?? raw.longitude,
    raw.telco_co_lat ?? raw.co_lat ?? raw.latitude,
  ]);
  if (!coordinates) return null;
  const record = {
    id: raw.telco_clli || raw.clli || `central-office-${index}`,
    kind: "central_office",
    operator: raw.telco_telconame || raw.telco_parentname,
    label: ["Central Office", raw.telco_co_city].filter(Boolean).join(" — "),
    status: "unknown",
  };
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: safeProperties(record, index, "point"),
  };
}

export function normalizeCarrierFinderGeoJson(litResponse = {}, telcoResponse = {}) {
  const routes = normalizeRoutes(litResponse);
  const points = normalizePoints(litResponse, routes.length);
  const telco = normalizeTelcoPoint(telcoResponse, routes.length + points.length);
  const features = [...routes, ...points, ...(telco ? [telco] : [])].slice(0, MAX_FEATURES);
  return {
    type: "FeatureCollection",
    features,
  };
}

export function safeFeatureMetadata(feature) {
  if (!feature || feature.type !== "Feature" || !feature.properties) return null;
  const properties = feature.properties;
  return {
    id: cleanString(properties.id, 96),
    feature_type: properties.feature_type === "run" ? "run" : "point",
    kind: cleanString(properties.kind, 64),
    operator: cleanString(properties.operator),
    carrier_list: Array.isArray(properties.carrier_list)
      ? properties.carrier_list.map((value) => cleanString(value, 80)).filter(Boolean).slice(0, 20)
      : [],
    capacity_gbps: finite(properties.capacity_gbps),
    status: ["on-net", "near-net", "planned", "unknown"].includes(properties.status)
      ? properties.status
      : "unknown",
    label: cleanString(properties.label),
    source: "CarrierFinder",
  };
}
