import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const MIN_ZOOM = { fiber_splice_points: 10, transformers: 11, utility_easements: 9 };

async function overpass(query) {
  let lastError = "No endpoint responded";
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SiteHawk-Infrastructure/1.0" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (response.ok) return await response.json();
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(`Live infrastructure source unavailable: ${lastError}`);
}

function geometryFor(element, layer) {
  if (element.type === "node" && Number.isFinite(element.lon) && Number.isFinite(element.lat)) {
    return { type: "Point", coordinates: [element.lon, element.lat] };
  }
  const coordinates = (element.geometry || []).map((point) => [point.lon, point.lat]);
  if (coordinates.length < 2) return null;
  const closed = coordinates.length > 3 && coordinates[0][0] === coordinates.at(-1)[0] && coordinates[0][1] === coordinates.at(-1)[1];
  if (layer === "utility_easements" && closed) return { type: "Polygon", coordinates: [coordinates] };
  return { type: "LineString", coordinates };
}

function featureFor(element, layer) {
  const geometry = geometryFor(element, layer);
  if (!geometry) return null;
  const tags = element.tags || {};
  const id = `${element.type}/${element.id}`;
  const type = layer === "transformers" ? "Transformer" : layer === "fiber_splice_points" ? "Fiber splice point" : "Utility easement";
  return {
    type: "Feature",
    id,
    geometry,
    properties: {
      id,
      name: tags.name || tags.ref || `${type} ${element.id}`,
      infrastructure_type: type,
      operator: tags.operator || tags.owner || "Not disclosed",
      voltage: tags.voltage || null,
      status: tags.status || "Mapped",
      source: "OpenStreetMap live query",
      source_date: new Date().toISOString(),
      verification_status: "community mapped — field verification required",
    },
  };
}

function queryFor(layer, bbox) {
  const [west, south, east, north] = bbox;
  const box = `${south},${west},${north},${east}`;
  const selectors = layer === "transformers"
    ? `node[power=transformer](${box});way[power=transformer](${box});`
    : layer === "fiber_splice_points"
      ? `node[telecom=connection_point](${box});node[man_made=manhole][manhole=telecom](${box});`
      : `way[easement](${box});relation[easement](${box});way[landuse=utility](${box});relation[landuse=utility](${box});`;
  return `[out:json][timeout:20];(${selectors});out tags center geom;`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const layer = body.layer;
    const bbox = Array.isArray(body.bbox) ? body.bbox.map(Number) : [];
    const zoom = Number(body.zoom || 0);
    if (body.action !== "query_layer" || !MIN_ZOOM[layer]) return Response.json({ error: "Unsupported live layer" }, { status: 400 });
    if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) return Response.json({ error: "bbox=[west,south,east,north] is required" }, { status: 400 });
    if (zoom < MIN_ZOOM[layer]) {
      return Response.json({ geojson: { type: "FeatureCollection", features: [] }, cursor: new Date().toISOString(), metadata: { source: "OpenStreetMap live query", minimum_zoom: MIN_ZOOM[layer], limitations: `Zoom to level ${MIN_ZOOM[layer]} to load this detail layer.` } });
    }
    const data = await overpass(queryFor(layer, bbox));
    const features = (data.elements || []).map((element) => featureFor(element, layer)).filter(Boolean);
    return Response.json({
      geojson: { type: "FeatureCollection", features },
      cursor: new Date().toISOString(),
      metadata: {
        source: "OpenStreetMap live query",
        source_date: new Date().toISOString(),
        queried_bbox: bbox,
        limitations: "Community-mapped screening data. Absence does not prove absence; ownership, alignment, and field location require provider or survey verification.",
      },
      count: features.length,
    });
  } catch (error) {
    console.error("infrastructureMap error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});