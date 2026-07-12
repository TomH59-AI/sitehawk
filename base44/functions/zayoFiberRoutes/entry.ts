import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import AdmZip from "npm:adm-zip@0.6.0";
import { DOMParser } from "npm:@xmldom/xmldom@0.9.10";
import { kml } from "npm:@tmcw/togeojson@7.1.2";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";

const SOURCE_DATE = "Imported Zayo KMZ; source vintage not supplied";
const MAX_KMZ_BYTES = 50 * 1024 * 1024;

function supabaseAdmin() {
  const rawUrl = Deno.env.get("HAWK_SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!rawUrl || !key) throw new Error("Supabase service configuration is missing");
  const cleanedUrl = rawUrl.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");
  const url = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function extractRoutes(collection) {
  return (collection.features || []).flatMap((feature, index) => {
    const geometry = feature.geometry;
    if (!geometry || !["LineString", "MultiLineString"].includes(geometry.type)) return [];
    const properties = feature.properties || {};
    return [{
      route_name: properties.name || properties.Name || `Zayo route ${index + 1}`,
      route_type: properties.route_type || properties.type || properties.Type || "Unclassified",
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
  const routes = extractRoutes(kml(document));
  if (!routes.length) throw new Error("No LineString or MultiLineString routes were found in the KMZ");

  const supabase = supabaseAdmin();
  let inserted = 0;
  for (let offset = 0; offset < routes.length; offset += 250) {
    const { data, error } = await supabase.rpc("import_zayo_fiber_routes", { routes: routes.slice(offset, offset + 250) });
    if (error) throw new Error(`PostGIS import failed: ${error.message}`);
    inserted += Number(data || 0);
  }
  return { parsed: routes.length, inserted };
}

async function queryRoutes(bbox, candidate) {
  const [west, south, east, north] = bbox.map(Number);
  const hasCandidate = Number.isFinite(Number(candidate?.lat)) && Number.isFinite(Number(candidate?.lon));
  const { data, error } = await supabaseAdmin().rpc("zayo_fiber_routes_in_bbox", {
    west, south, east, north,
    candidate_lon: hasCandidate ? Number(candidate.lon) : null,
    candidate_lat: hasCandidate ? Number(candidate.lat) : null,
  });
  if (error) throw new Error(`Zayo route query failed: ${error.message}`);

  const features = (data || []).map((row) => ({
    type: "Feature",
    geometry: row.geometry,
    properties: {
      provider: "Zayo",
      facility_name: row.route_name || "Zayo fiber route",
      infrastructure_type: "Fiber route",
      route_type: row.route_type || "Unclassified",
      status: "Mapped",
      source: "Zayo KMZ import",
      source_date: SOURCE_DATE,
      distance_miles: row.distance_miles == null ? null : Number(Number(row.distance_miles).toFixed(2)),
      provider_color: "#f59e0b",
    },
  }));
  const nearest = features.filter((feature) => feature.properties.distance_miles != null)
    .sort((a, b) => a.properties.distance_miles - b.properties.distance_miles)[0];
  return {
    geojson: { type: "FeatureCollection", features },
    metadata: {
      source: "Zayo KMZ import",
      source_date: SOURCE_DATE,
      limitations: "Route geometry is shown as supplied in the licensed KMZ and may be generalized. It must not be treated as exact underground placement or a locate request.",
      queried_bbox: bbox,
    },
    summary: {
      nearest_fiber_route: nearest?.properties.facility_name || null,
      nearest_fiber_route_miles: nearest?.properties.distance_miles ?? null,
      fiber_routes_loaded: true,
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
      return Response.json(await queryRoutes(body.bbox.map(Number), body.candidate));
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("zayoFiberRoutes error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});