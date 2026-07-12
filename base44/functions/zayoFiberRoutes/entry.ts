import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import AdmZip from "npm:adm-zip@0.6.0";
import { DOMParser } from "npm:@xmldom/xmldom@0.9.10";
import { kml } from "npm:@tmcw/togeojson@7.1.2";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";

const SOURCE_NAME = "Zayo KMZ import";
const DISCLAIMER = "Zayo network information is provided for preliminary screening only. Routes shown are approximate and do not represent surveyed or as-built fiber locations. Availability, capacity, ownership, and exact routing must be confirmed directly with Zayo.";
const MAX_KMZ_BYTES = 50 * 1024 * 1024;
const SUPPORTED_GEOMETRIES = new Set(["Point", "LineString", "MultiLineString"]);

function supabaseClient(rawKey) {
  const rawUrl = Deno.env.get("HAWK_SUPABASE_URL");
  if (!rawUrl || !rawKey) throw new Error("Supabase configuration is missing");
  const cleanedUrl = rawUrl.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s/]+$/, "");
  const cleanedKey = rawKey.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s]+$/, "");
  const url = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
  return createClient(url, cleanedKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function supabaseRead() {
  return supabaseClient(Deno.env.get("HAWK_SUPABASE_ANON_KEY"));
}

function supabaseAdmin() {
  return supabaseClient(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
}

function extractFeatures(collection) {
  return (collection.features || []).flatMap((feature) => {
    const geometry = feature.geometry;
    if (!geometry || !SUPPORTED_GEOMETRIES.has(geometry.type)) return [];
    const properties = feature.properties || {};
    return [{
      route_name: properties.name || properties.Name || null,
      route_type: properties.route_type || properties.type || properties.Type || null,
      feature_type: geometry.type,
      source_name: SOURCE_NAME,
      source_date: properties.source_date || properties.date || null,
      confidence: "medium",
      verification_status: "unverified",
      geometry,
    }];
  });
}

async function importKmz(fileUrl) {
  const parsed = new URL(fileUrl);
  if (parsed.protocol !== "https:") throw new Error("A secure HTTPS KMZ URL is required");
  const response = await fetch(parsed.toString(), { redirect: "follow" });
  if (!response.ok) throw new Error(`KMZ download failed with HTTP ${response.status}`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_KMZ_BYTES) throw new Error("KMZ exceeds the 50 MB import limit");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_KMZ_BYTES) throw new Error("KMZ exceeds the 50 MB import limit");

  const archive = new AdmZip(new Uint8Array(bytes));
  const entries = archive.getEntries().filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".kml"));
  const entry = entries.find((item) => item.entryName.toLowerCase().endsWith("doc.kml")) || entries[0];
  if (!entry) throw new Error("The KMZ archive does not contain a KML document");

  const xml = new TextDecoder().decode(entry.getData());
  const document = new DOMParser().parseFromString(xml, "text/xml");
  const features = extractFeatures(kml(document));
  if (!features.length) throw new Error("No Point, LineString, or MultiLineString features were found in the KMZ");

  const supabase = supabaseAdmin();
  let inserted = 0;
  for (let offset = 0; offset < features.length; offset += 250) {
    const result = await supabase.rpc("import_zayo_fiber_routes", { routes: features.slice(offset, offset + 250) });
    if (result.error) throw new Error(`PostGIS import failed: ${result.error.message}`);
    inserted += Number(result.data || 0);
  }
  return { parsed: features.length, inserted };
}

function emptyCollection(bbox, databaseStatus = "ready") {
  return {
    type: "FeatureCollection",
    features: [],
    metadata: {
      source: SOURCE_NAME,
      source_date: null,
      limitations: DISCLAIMER,
      queried_bbox: bbox,
      database_status: databaseStatus,
    },
    summary: {
      nearest_fiber_route: null,
      nearest_fiber_route_miles: null,
      fiber_routes_loaded: false,
    },
    count: 0,
  };
}

async function queryFeatures(bbox, candidate) {
  const [west, south, east, north] = bbox.map(Number);
  const hasCandidate = Number.isFinite(Number(candidate?.lat)) && Number.isFinite(Number(candidate?.lon));
  const result = await supabaseRead().rpc("zayo_fiber_routes_in_bbox", {
    west,
    south,
    east,
    north,
    candidate_lon: hasCandidate ? Number(candidate.lon) : null,
    candidate_lat: hasCandidate ? Number(candidate.lat) : null,
  });

  const unavailableCodes = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
  if (result.error && unavailableCodes.has(result.error.code)) return emptyCollection(bbox, "not_initialized");
  if (result.error) throw new Error(`Zayo route query failed: ${result.error.message}`);

  const features = (result.data || []).flatMap((row) => {
    if (!row.geometry || !SUPPORTED_GEOMETRIES.has(row.geometry.type)) return [];
    return [{
      type: "Feature",
      geometry: row.geometry,
      properties: {
        provider: "Zayo",
        feature_type: row.feature_type || row.geometry.type,
        source_name: row.source_name || SOURCE_NAME,
        source_date: row.source_date || null,
        confidence: row.confidence || "medium",
        verification_status: row.verification_status || "unverified",
        facility_name: row.route_name || null,
        route_type: row.route_type || null,
        distance_miles: row.distance_miles == null ? null : Number(Number(row.distance_miles).toFixed(2)),
        provider_color: "#f59e0b",
      },
    }];
  });
  const nearest = features
    .filter((feature) => feature.properties.distance_miles != null)
    .sort((a, b) => a.properties.distance_miles - b.properties.distance_miles)[0];

  return {
    type: "FeatureCollection",
    features,
    metadata: {
      source: SOURCE_NAME,
      source_date: null,
      limitations: DISCLAIMER,
      queried_bbox: bbox,
      database_status: "ready",
    },
    summary: {
      nearest_fiber_route: nearest?.properties.facility_name || null,
      nearest_fiber_route_miles: nearest?.properties.distance_miles ?? null,
      fiber_routes_loaded: features.length > 0,
    },
    count: features.length,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();

    if (body.action === "import_kmz") {
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      if (!body.file_url) return Response.json({ error: "file_url is required" }, { status: 400 });
      return Response.json(await importKmz(body.file_url));
    }

    if (body.action === "query_layer" && body.layer === "zayo_routes") {
      if (!Array.isArray(body.bbox) || body.bbox.length !== 4 || body.bbox.some((value) => !Number.isFinite(Number(value)))) {
        return Response.json({ error: "bbox=[west,south,east,north] is required" }, { status: 400 });
      }
      return Response.json(await queryFeatures(body.bbox.map(Number), body.candidate));
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("zayoFiberRoutes error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});