import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { unzipSync } from "npm:fflate@0.8.2";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";

// ScipHawk Fiber Map — multi-provider KMZ route store (Supabase PostGIS).
// Actions:
//   import_kmz  (admin) { provider, file_url } — parses KMZ, REPLACES that provider's rows
//   query_layer         { layer: "fiberkmz_<provider>", bbox, candidate? }
//   counts              — per-provider imported feature counts

const PROVIDERS = {
  lumen: "Lumen / Level 3 Backbone",
  arelion: "Arelion (Telia) Backbone",
  zayo: "Zayo Fiber",
  everstream: "Everstream Metro Fiber",
  crowncastle: "Crown Castle Fiber",
  uniti: "Uniti Fiber",
  dfs: "Dark Fiber Systems (Florida)",
  openinfra: "OpenInfraMap Fiber",
};
const DISCLAIMER = "Provider network information is for preliminary screening only. Routes are approximate, not surveyed or as-built locations. Availability, capacity, ownership, and exact routing must be confirmed directly with the provider.";
const MAX_KMZ_BYTES = 50 * 1024 * 1024;
// Point names that mark fiber access infrastructure (spec §4)
const SPLICE_NAME_RE = /\b(splice(\s+case)?|cabinet|handhole|node|pop|co)\b/i;
const SUPPORTED_GEOMETRIES = new Set(["Point", "LineString", "MultiLineString"]);

function supabaseClient(rawKey) {
  const rawUrl = Deno.env.get("HAWK_SUPABASE_URL");
  if (!rawUrl || !rawKey) throw new Error("Supabase configuration is missing");
  const cleanedUrl = rawUrl.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s/]+$/, "");
  const cleanedKey = rawKey.replace(/^[\\'"\s]+/, "").replace(/[\\'"\s]+$/, "");
  const url = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;
  return createClient(url, cleanedKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
function supabaseRead() { return supabaseClient(Deno.env.get("HAWK_SUPABASE_ANON_KEY")); }
function supabaseAdmin() { return supabaseClient(Deno.env.get("HAWK_SUPABASE_SERVICE_ROLE_KEY")); }

const UNAVAILABLE_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

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

// Lightweight string-based KML parser — keeps memory flat on 40MB+ documents.
function extractFeatures(xml, sourceName) {
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

    const isSplicePoint = geometry.type === "Point" && name && SPLICE_NAME_RE.test(name);
    features.push({
      route_name: name,
      route_type: isSplicePoint ? "splice_point" : null,
      feature_type: geometry.type,
      source_name: sourceName,
      source_date: null,
      confidence: "medium",
      verification_status: "unverified",
      geometry,
    });
  }
  return features;
}

async function importKmz(provider, fileUrl) {
  const parsed = new URL(fileUrl);
  if (parsed.protocol !== "https:") throw new Error("A secure HTTPS KMZ URL is required");
  const response = await fetch(parsed.toString(), { redirect: "follow" });
  if (!response.ok) throw new Error(`KMZ download failed with HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_KMZ_BYTES) throw new Error("KMZ exceeds the 50 MB import limit");

  console.log(`[${provider}] downloaded ${bytes.byteLength} bytes`);
  const unzipped = unzipSync(new Uint8Array(bytes));
  const names = Object.keys(unzipped).filter((name) => name.toLowerCase().endsWith(".kml"));
  const entryName = names.find((name) => name.toLowerCase().endsWith("doc.kml")) || names[0];
  if (!entryName) throw new Error("The KMZ archive does not contain a KML document");

  const xml = new TextDecoder().decode(unzipped[entryName]);
  for (const key of Object.keys(unzipped)) delete unzipped[key];
  const features = extractFeatures(xml, `${PROVIDERS[provider]} KMZ import`);
  console.log(`[${provider}] extracted ${features.length} features`);
  if (!features.length) throw new Error("No Point, LineString, or MultiLineString features were found in the KMZ");

  const supabase = supabaseAdmin();
  let inserted = 0;
  for (let offset = 0; offset < features.length; offset += 250) {
    const result = await supabase.rpc("import_fiber_provider_routes", {
      p_provider: provider,
      routes: features.slice(offset, offset + 250),
      replace_existing: offset === 0, // first batch wipes the provider's old rows
    });
    if (result.error) throw new Error(`PostGIS import failed: ${result.error.message}`);
    inserted += Number(result.data || 0);
  }
  return { provider, parsed: features.length, inserted };
}

function emptyCollection(bbox, databaseStatus = "ready") {
  return {
    type: "FeatureCollection",
    features: [],
    metadata: { source: "ScipHawk fiber KMZ import", limitations: DISCLAIMER, queried_bbox: bbox, database_status: databaseStatus },
    count: 0,
  };
}

async function queryFeatures(provider, bbox, candidate) {
  const [west, south, east, north] = bbox.map(Number);
  const hasCandidate = Number.isFinite(Number(candidate?.lat)) && Number.isFinite(Number(candidate?.lon));
  const result = await supabaseRead().rpc("fiber_provider_routes_in_bbox", {
    providers: [provider],
    west, south, east, north,
    candidate_lon: hasCandidate ? Number(candidate.lon) : null,
    candidate_lat: hasCandidate ? Number(candidate.lat) : null,
  });

  if (result.error && UNAVAILABLE_CODES.has(result.error.code)) return emptyCollection(bbox, "not_initialized");
  if (result.error) throw new Error(`Fiber route query failed: ${result.error.message}`);

  const features = (result.data || []).flatMap((row) => {
    if (!row.geometry || !SUPPORTED_GEOMETRIES.has(row.geometry.type)) return [];
    return [{
      type: "Feature",
      geometry: row.geometry,
      properties: {
        provider: PROVIDERS[row.provider] || row.provider,
        feature_type: row.feature_type || row.geometry.type,
        source_name: row.source_name || null,
        confidence: row.confidence || "medium",
        verification_status: row.verification_status || "unverified",
        facility_name: row.route_name || null,
        route_type: row.route_type || null,
        distance_miles: row.distance_miles == null ? null : Number(Number(row.distance_miles).toFixed(2)),
      },
    }];
  });

  return {
    type: "FeatureCollection",
    features,
    metadata: {
      source: `${PROVIDERS[provider]} — KMZ import`,
      limitations: DISCLAIMER,
      queried_bbox: bbox,
      database_status: "ready",
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
      if (!PROVIDERS[body.provider]) return Response.json({ error: `provider must be one of: ${Object.keys(PROVIDERS).join(", ")}` }, { status: 400 });
      if (!body.file_url) return Response.json({ error: "file_url is required" }, { status: 400 });
      return Response.json(await importKmz(body.provider, body.file_url));
    }

    if (body.action === "counts") {
      const result = await supabaseRead().rpc("fiber_provider_route_counts");
      if (result.error && UNAVAILABLE_CODES.has(result.error.code)) {
        return Response.json({ providers: [], database_status: "not_initialized" });
      }
      if (result.error) throw new Error(result.error.message);
      return Response.json({ providers: result.data || [], database_status: "ready" });
    }

    if (body.action === "query_layer") {
      const provider = String(body.layer || "").replace(/^fiberkmz_/, "");
      if (!PROVIDERS[provider]) return Response.json({ error: `Unknown fiber provider layer: ${body.layer}` }, { status: 400 });
      if (!Array.isArray(body.bbox) || body.bbox.length !== 4 || body.bbox.some((value) => !Number.isFinite(Number(value)))) {
        return Response.json({ error: "bbox=[west,south,east,north] is required" }, { status: 400 });
      }
      return Response.json(await queryFeatures(provider, body.bbox.map(Number), body.candidate));
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("fiberProviderRoutes error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});