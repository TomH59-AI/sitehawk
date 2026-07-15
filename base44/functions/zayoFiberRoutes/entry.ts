import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { unzipSync } from "npm:fflate@0.8.2";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";

const SOURCE_NAME = "Zayo KMZ import";
const DISCLAIMER = "Zayo network information is provided for preliminary screening only. Routes shown are approximate and do not represent surveyed or as-built fiber locations. Availability, capacity, ownership, and exact routing must be confirmed directly with Zayo.";
const MAX_KMZ_BYTES = 50 * 1024 * 1024;
const SUPPORTED_GEOMETRIES = new Set(["Point", "LineString", "MultiLineString"]);
// Point names that mark fiber access infrastructure (spec §4)
const SPLICE_NAME_RE = /\b(splice(\s+case)?|cabinet|handhole|node|pop|co)\b/i;

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
  return supabaseClient(Deno.env.get("HAWK_SUPABASE_SERVICE_ROLE_KEY"));
}

function parseCoordinates(text) {
  const coords = [];
  for (const token of text.trim().split(/\s+/)) {
    const parts = token.split(",");
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) coords.push([lon, lat]);
  }
  return coords;
}

function tagText(block, tag) {
  const open = block.indexOf(`<${tag}`);
  if (open === -1) return null;
  const start = block.indexOf(">", open);
  const close = block.indexOf(`</${tag}>`, start);
  if (start === -1 || close === -1) return null;
  return block.slice(start + 1, close);
}

// Lightweight string-based KML parser — a full XML DOM of a 40MB+ document
// exhausts the worker; scanning Placemark blocks keeps memory flat.
function extractFeatures(xml) {
  const features = [];
  let cursor = 0;
  while (true) {
    const open = xml.indexOf("<Placemark", cursor);
    if (open === -1) break;
    const close = xml.indexOf("</Placemark>", open);
    if (close === -1) break;
    cursor = close + 12;
    const block = xml.slice(open, close);

    const name = (tagText(block, "name") || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim() || null;
    const lines = [];
    let lineCursor = 0;
    while (true) {
      const lsOpen = block.indexOf("<LineString", lineCursor);
      if (lsOpen === -1) break;
      const lsClose = block.indexOf("</LineString>", lsOpen);
      if (lsClose === -1) break;
      lineCursor = lsClose + 13;
      const coordText = tagText(block.slice(lsOpen, lsClose), "coordinates");
      if (!coordText) continue;
      const coords = parseCoordinates(coordText);
      if (coords.length >= 2) lines.push(coords);
    }

    let geometry = null;
    if (lines.length === 1) geometry = { type: "LineString", coordinates: lines[0] };
    else if (lines.length > 1) geometry = { type: "MultiLineString", coordinates: lines };
    else {
      const pointOpen = block.indexOf("<Point");
      if (pointOpen !== -1) {
        const coordText = tagText(block.slice(pointOpen), "coordinates");
        const coords = coordText ? parseCoordinates(coordText) : [];
        if (coords.length) geometry = { type: "Point", coordinates: coords[0] };
      }
    }
    if (!geometry) continue;

    features.push({
      route_name: name,
      route_type: null,
      feature_type: geometry.type,
      source_name: SOURCE_NAME,
      source_date: null,
      confidence: "medium",
      verification_status: "unverified",
      geometry,
    });
  }
  return features;
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

  console.log(`downloaded ${bytes.byteLength} bytes`);
  const unzipped = unzipSync(new Uint8Array(bytes));
  const names = Object.keys(unzipped).filter((name) => name.toLowerCase().endsWith(".kml"));
  const entryName = names.find((name) => name.toLowerCase().endsWith("doc.kml")) || names[0];
  if (!entryName) throw new Error("The KMZ archive does not contain a KML document");
  console.log(`unzipped ${entryName}: ${unzipped[entryName].length} bytes`);

  const xml = new TextDecoder().decode(unzipped[entryName]);
  for (const key of Object.keys(unzipped)) delete unzipped[key];
  console.log("decoded xml, extracting features");
  const features = extractFeatures(xml);
  console.log(`extracted ${features.length} features`);
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
        route_type: row.route_type ||
          (row.geometry.type === "Point" && row.route_name && SPLICE_NAME_RE.test(row.route_name) ? "splice_point" : null),
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

    if (body.action === "inspect_kmz") {
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      const res = await fetch(body.file_url, { redirect: "follow" });
      const buf = new Uint8Array(await res.arrayBuffer());
      const head = new TextDecoder().decode(buf.slice(0, 200));
      let entries = [];
      try {
        const unzipped = unzipSync(buf);
        entries = Object.entries(unzipped).map(([name, data]) => ({ name, size: data.length }));
      } catch (e) {
        return Response.json({ bytes: buf.byteLength, head, zip_error: e.message, content_type: res.headers.get("content-type") });
      }
      return Response.json({ bytes: buf.byteLength, content_type: res.headers.get("content-type"), entries });
    }

    if (body.action === "diag_keys") {
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      const decodeRef = (key) => {
        try {
          const cleaned = (key || "").replace(/^[\\'"\s]+/, "").replace(/[\\'"\s]+$/, "");
          const payload = JSON.parse(atob(cleaned.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          return { ref: payload.ref, role: payload.role, exp: payload.exp, len: cleaned.length };
        } catch (e) {
          const cleaned = (key || "").replace(/^[\\'"\s]+/, "").replace(/[\\'"\s]+$/, "");
          return { error: e.message, len: cleaned.length, prefix: cleaned.slice(0, 12) };
        }
      };
      return Response.json({
        url_host: (Deno.env.get("HAWK_SUPABASE_URL") || "").replace(/^[\\'"\s]+/, "").replace(/[\\'"\s/]+$/, ""),
        anon: decodeRef(Deno.env.get("HAWK_SUPABASE_ANON_KEY")),
        service: decodeRef(Deno.env.get("HAWK_SUPABASE_SERVICE_ROLE_KEY")),
      });
    }

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