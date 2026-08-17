/**
 * supabase/functions/zoning-proxy/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Edge Function — HTTP bridge between Base44 and the zoning engine.
 *
 * Routes (all POST):
 *   /zoning-proxy/checkZoning
 *   /zoning-proxy/getZoningDetails
 *   /zoning-proxy/listPermittedUses
 *   /zoning-proxy/runZoningFeasibility
 *
 * Environment variables (set in Supabase Dashboard → Functions → Secrets):
 *   SUPABASE_URL               (auto-injected)
 *   SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
 *   DEFAULT_JURISDICTION       e.g. "Milford, MI"
 *   DEFAULT_STATE_ABBR         e.g. "MI"
 *   ZONING_CACHE_TTL_DAYS      default 30
 *   DISTRICT_CACHE_TTL_DAYS    default 90
 *   OAKLAND_COUNTY_GIS_URL     ArcGIS FeatureServer layer URL
 *
 * Deploy:
 *   supabase functions deploy zoning-proxy --no-verify-jwt
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve }        from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS headers (Base44 app origin) ─────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Supabase client ───────────────────────────────────────────────────────────
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

// ── Config ────────────────────────────────────────────────────────────────────
const DEFAULT_JURISDICTION = Deno.env.get("DEFAULT_JURISDICTION") ?? "Milford, MI";
const DEFAULT_STATE_ABBR   = Deno.env.get("DEFAULT_STATE_ABBR")   ?? "MI";
const ZONING_TTL_DAYS      = parseInt(Deno.env.get("ZONING_CACHE_TTL_DAYS")   ?? "30");
const DISTRICT_TTL_DAYS    = parseInt(Deno.env.get("DISTRICT_CACHE_TTL_DAYS") ?? "90");

// Oakland County GIS — zoning polygons (ArcGIS FeatureServer)
// Verify / update at: https://gis.oakgov.com/arcgis/rest/services
const GIS_URL = Deno.env.get("OAKLAND_COUNTY_GIS_URL") ??
  "https://services1.arcgis.com/GE4Idg9FL97XBa3P/arcgis/rest/services/Zoning_Layers_view/FeatureServer/12";
const GIS_DISTRICT_FIELD = Deno.env.get("GIS_DISTRICT_FIELD") ?? "ZONECODE";
const GIS_NAME_FIELD     = Deno.env.get("GIS_NAME_FIELD")     ?? "ZONEDESC";

// Municode municipality ID for Milford, MI
// Override via MUNICODE_CLIENT_ID env var if you find the exact ID
const MUNICODE_CLIENT_ID = Deno.env.get("MUNICODE_CLIENT_ID") ?? null;

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const path = new URL(req.url).pathname;
  const tool = path.split("/").pop() ?? "";

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  try {
    let result: unknown;
    switch (tool) {
      case "checkZoning":
        result = await checkZoning(body as CheckZoningInput); break;
      case "getZoningDetails":
        result = await getZoningDetails(
          body.districtCode as string,
          (body.jurisdiction as string) ?? DEFAULT_JURISDICTION
        ); break;
      case "listPermittedUses":
        result = await listPermittedUses(
          body.districtCode as string,
          (body.jurisdiction as string) ?? DEFAULT_JURISDICTION
        ); break;
      case "runZoningFeasibility":
        result = await runZoningFeasibility(body as FeasibilityInput); break;
      default:
        return jsonError(`Unknown tool: ${tool}`, 404);
    }
    return jsonOk(result);
  } catch (err) {
    console.error(`[${tool}]`, err);
    return jsonError((err as Error).message, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. checkZoning
// ─────────────────────────────────────────────────────────────────────────────

interface CheckZoningInput {
  address?: string;
  parcelId?: string;
  lat?: number;
  lng?: number;
}

async function checkZoning({ address, parcelId, lat, lng }: CheckZoningInput) {
  if (!address && !parcelId && (lat == null || lng == null)) {
    throw new Error("Provide address, parcelId, or lat+lng");
  }

  const cacheKey = buildCacheKey({ address, parcelId, lat, lng });

  // Cache hit?
  const cached = await readZoningCache(cacheKey);
  if (cached) { console.info(`[cache HIT] ${cacheKey}`); return cached; }
  console.info(`[cache MISS] ${cacheKey}`);

  // Geocode
  const geo = lat != null
    ? await reverseGeocode(lat!, lng!)
    : await geocodeAddress(address!);

  // GIS lookup
  const gis = await gisLookup(geo.lat, geo.lng);

  const result = {
    districtCode: gis?.districtCode ?? "UNKNOWN",
    districtName: gis?.districtName ?? "District could not be automatically determined",
    jurisdiction:  geo.placeName ?? DEFAULT_JURISDICTION,
    lat:           geo.lat,
    lng:           geo.lng,
    parcelId:      parcelId ?? null,
    fips:          geo.fips,
    geometry:      gis?.geometry ?? null,
    source:        gis?.source ?? "census-geocoder",
    _notice:       gis ? undefined :
      "No GIS layer configured for this location. Set OAKLAND_COUNTY_GIS_URL in Edge Function secrets.",
  };

  await writeZoningCache(cacheKey, { address, parcelId }, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. getZoningDetails
// ─────────────────────────────────────────────────────────────────────────────

async function getZoningDetails(districtCode: string, jurisdiction: string) {
  if (!districtCode) throw new Error("districtCode is required");
  const code = districtCode.toUpperCase().trim();

  const cached = await readDistrictCache(code, jurisdiction);
  if (cached) return cached;

  // Try Municode
  const details = await fetchMunicodeDetails(code, jurisdiction);
  if (details) {
    await writeDistrictCache(code, jurisdiction, details);
    return details;
  }

  throw new Error(
    `No ordinance data found for district "${code}" in "${jurisdiction}". ` +
    `Set MUNICODE_CLIENT_ID in Edge Function secrets, or ensure the jurisdiction is on Municode.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. listPermittedUses
// ─────────────────────────────────────────────────────────────────────────────

async function listPermittedUses(districtCode: string, jurisdiction: string) {
  if (!districtCode) throw new Error("districtCode is required");
  const code = districtCode.toUpperCase().trim();

  const cached = await readUsesCache(code, jurisdiction);
  if (cached) return cached;

  const details = await fetchMunicodeDetails(code, jurisdiction);
  if (!details) throw new Error(`No use matrix found for "${code}" in "${jurisdiction}".`);

  const uses = {
    permitted:   details.permitted   ?? [],
    conditional: details.conditional ?? [],
    prohibited:  details.prohibited  ?? [],
    source:      details.source,
  };
  await writeUsesCache(code, jurisdiction, uses);
  return uses;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. runZoningFeasibility
// ─────────────────────────────────────────────────────────────────────────────

interface FeasibilityInput {
  address: string;
  proposedUse: string;
  units?: number;
  sqft?: number;
}

async function runZoningFeasibility({ address, proposedUse, units, sqft }: FeasibilityInput) {
  if (!address)     throw new Error("address is required");
  if (!proposedUse) throw new Error("proposedUse is required");

  const zone = await checkZoning({ address });

  const [detailsResult, usesResult] = await Promise.allSettled([
    getZoningDetails(zone.districtCode, zone.jurisdiction),
    listPermittedUses(zone.districtCode, zone.jurisdiction),
  ]);

  const details  = detailsResult.status  === "fulfilled" ? detailsResult.value  : null;
  const useMatrix = usesResult.status === "fulfilled" ? usesResult.value : null;

  const useStatus = classifyUse(proposedUse, useMatrix as UsesResult | null);
  const flags: string[] = [];
  const conditions: string[] = [];

  if (useStatus === "conditional") {
    conditions.push(
      `"${proposedUse}" requires a Conditional Use Permit (CUP) or Special Use Permit (SUP) in ${zone.districtCode}.`
    );
  }
  if (sqft && (details as DistrictDetails | null)?.maxFAR) {
    const d = details as DistrictDetails;
    flags.push(`FAR ${d.maxFAR}: ${sqft.toLocaleString()} sq ft needs ≥ ${Math.ceil(sqft / d.maxFAR!).toLocaleString()} sq ft lot`);
  }
  if ((details as DistrictDetails | null)?.maxHeight) {
    flags.push(`Max building height: ${(details as DistrictDetails).maxHeight} ft`);
  }
  if ((details as DistrictDetails | null)?.setbacks) {
    const sb = (details as DistrictDetails).setbacks!;
    flags.push(`Setbacks — Front: ${sb.front ?? "?"}ft  Rear: ${sb.rear ?? "?"}ft  Side: ${sb.side ?? "?"}ft`);
  }

  const feasible = useStatus === "permitted" || useStatus === "conditional";
  const statusLabel = {
    permitted:   "✅ PERMITTED by right",
    conditional: "⚠️  CONDITIONAL — permit required",
    prohibited:  "🚫 PROHIBITED in this district",
    unknown:     "❓ STATUS UNKNOWN — ordinance not available",
  }[useStatus] ?? "❓ UNKNOWN";

  const summary = [
    `Address: ${address}`,
    `District: ${zone.districtCode} (${zone.districtName}) — ${zone.jurisdiction}`,
    `Proposed use: ${proposedUse}${units ? ` (${units} units)` : sqft ? ` (${sqft.toLocaleString()} sq ft)` : ""}`,
    `Status: ${statusLabel}`,
    ...(conditions.length ? ["", "Conditions:", ...conditions.map(c => `  • ${c}`)] : []),
    ...(flags.length ? ["", "Development standards:", ...flags.map(f => `  • ${f}`)] : []),
    ...(details && (details as DistrictDetails).ordinanceUrl
      ? ["", `Ordinance: ${(details as DistrictDetails).ordinanceUrl}`] : []),
  ].join("\n");

  return { feasible, status: useStatus, districtCode: zone.districtCode,
           districtName: zone.districtName, jurisdiction: zone.jurisdiction,
           conditions, flags, summary, ordinance: details };
}

// ─────────────────────────────────────────────────────────────────────────────
// Geocoding — US Census API (free, no key)
// ─────────────────────────────────────────────────────────────────────────────

async function geocodeAddress(address: string) {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
  url.searchParams.set("address",   address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage",   "Current_Current");
  url.searchParams.set("layers",    "all");
  url.searchParams.set("format",    "json");

  const res  = await timedFetch(url.toString(), 12_000);
  const json = await res.json();
  const m    = json?.result?.addressMatches?.[0];
  if (!m) throw new Error(`No geocode match for: "${address}"`);

  const geos = m.geographies ?? {};
  return {
    lat: m.coordinates.y as number,
    lng: m.coordinates.x as number,
    matchedAddress: m.matchedAddress,
    placeName:  geos["Incorporated Places"]?.[0]?.NAME ?? null,
    countyName: geos["Counties"]?.[0]?.NAME ?? null,
    fips: {
      state:  geos["States"]?.[0]?.STATE  ?? null,
      county: geos["Counties"]?.[0]?.COUNTY ?? null,
      place:  geos["Incorporated Places"]?.[0]?.PLACE ?? null,
    },
  };
}

async function reverseGeocode(lat: number, lng: number) {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/coordinates");
  url.searchParams.set("x", String(lng));
  url.searchParams.set("y", String(lat));
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage",   "Current_Current");
  url.searchParams.set("layers",    "all");
  url.searchParams.set("format",    "json");

  const res  = await timedFetch(url.toString(), 12_000);
  const json = await res.json();
  const geos = json?.result?.geographies ?? {};
  return {
    lat, lng,
    matchedAddress: null,
    placeName:  geos["Incorporated Places"]?.[0]?.NAME ?? null,
    countyName: geos["Counties"]?.[0]?.NAME ?? null,
    fips: {
      state:  geos["States"]?.[0]?.STATE  ?? null,
      county: geos["Counties"]?.[0]?.COUNTY ?? null,
      place:  geos["Incorporated Places"]?.[0]?.PLACE ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ArcGIS GIS lookup — Oakland County zoning layer
// ─────────────────────────────────────────────────────────────────────────────

async function gisLookup(lat: number, lng: number) {
  if (!GIS_URL || GIS_URL.includes("REPLACE")) return null;
  try {
    const delta = 0.0001;
    const params = new URLSearchParams({
      geometry:       JSON.stringify({ xmin: lng-delta, ymin: lat-delta, xmax: lng+delta, ymax: lat+delta }),
      geometryType:   "esriGeometryEnvelope",
      spatialRel:     "esriSpatialRelIntersects",
      inSR:           "4326",
      outFields:      [GIS_DISTRICT_FIELD, GIS_NAME_FIELD].join(","),
      returnGeometry: "true",
      outSR:          "4326",
      f:              "json",
    });
    const res  = await timedFetch(`${GIS_URL}/query?${params}`, 15_000);
    const json = await res.json();
    if (json.error) { console.warn("[gis]", json.error.message); return null; }
    const feat  = json.features?.[0];
    if (!feat)  return null;
    return {
      districtCode: String(feat.attributes[GIS_DISTRICT_FIELD] ?? "").toUpperCase().trim() || null,
      districtName: String(feat.attributes[GIS_NAME_FIELD]     ?? "").trim()               || null,
      geometry:     feat.geometry ?? null,
      source:       `arcgis:${GIS_URL}`,
    };
  } catch (e) {
    console.warn("[gis] lookup failed:", (e as Error).message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Municode ordinance fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchMunicodeDetails(districtCode: string, jurisdiction: string) {
  const clientId = MUNICODE_CLIENT_ID;
  if (!clientId) {
    console.warn("[municode] MUNICODE_CLIENT_ID not set — skipping ordinance lookup");
    return null;
  }
  try {
    // Fetch product list to find the right code
    const tocRes = await timedFetch(
      `https://library.municode.com/api/products/${clientId}/codes/toc?levelsDeep=3`, 15_000
    );
    if (!tocRes.ok) return null;
    const toc = await tocRes.json();
    // Return a minimal stub — full parsing is in the Node.js engine
    // For production, implement full TOC → section → HTML → parse flow
    return {
      code:        districtCode,
      name:        `${districtCode} District`,
      description: null,
      setbacks:    {},
      maxHeight:   null,
      maxFAR:      null,
      minLotSize:  null,
      permitted:   [],
      conditional: [],
      prohibited:  [],
      ordinanceUrl: `https://library.municode.com/${clientId}`,
      source:      `municode:${clientId}`,
    };
  } catch (e) {
    console.warn("[municode]", (e as Error).message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase cache — read / write
// ─────────────────────────────────────────────────────────────────────────────

function buildCacheKey({ address, parcelId, lat, lng }: CheckZoningInput) {
  if (parcelId) return `parcel:${parcelId.toLowerCase().trim()}`;
  if (address)  return `addr:${address.toLowerCase().trim().replace(/\s+/g, " ")}`;
  return `ll:${(lat as number).toFixed(6)},${(lng as number).toFixed(6)}`;
}

function expiresAt(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function readZoningCache(key: string) {
  const { data } = await supabase
    .from("zoning_cache").select("*")
    .eq("cache_key", key).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!data) return null;
  return { districtCode: data.district_code, districtName: data.district_name,
           jurisdiction: data.jurisdiction, lat: data.lat, lng: data.lng,
           parcelId: data.parcel_id, fips: { state: data.fips_state, county: data.fips_county, place: data.fips_place },
           geometry: data.geometry, source: data.source, _fromCache: true };
}

async function writeZoningCache(key: string, input: CheckZoningInput, result: Record<string, unknown>) {
  await supabase.from("zoning_cache").upsert({
    cache_key: key, address: input.address ?? null, parcel_id: input.parcelId ?? null,
    lat: (result.lat as number) ?? null, lng: (result.lng as number) ?? null,
    district_code: result.districtCode, district_name: result.districtName,
    jurisdiction: result.jurisdiction,
    fips_state:  (result.fips as Record<string,string>)?.state  ?? null,
    fips_county: (result.fips as Record<string,string>)?.county ?? null,
    fips_place:  (result.fips as Record<string,string>)?.place  ?? null,
    geometry: result.geometry ?? null, source: result.source ?? "unknown",
    expires_at: expiresAt(ZONING_TTL_DAYS), updated_at: new Date().toISOString(),
  }, { onConflict: "cache_key" });
}

async function readDistrictCache(code: string, jurisdiction: string) {
  const { data } = await supabase.from("district_cache").select("*")
    .eq("district_code", code).eq("jurisdiction", jurisdiction)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!data) return null;
  return { code: data.district_code, name: data.name, description: data.description,
           setbacks: data.setbacks ?? {}, maxHeight: data.max_height, maxFAR: data.max_far,
           minLotSize: data.min_lot_size, ordinanceUrl: data.ordinance_url,
           source: data.source, _fromCache: true };
}

async function writeDistrictCache(code: string, jurisdiction: string, d: Record<string, unknown>) {
  await supabase.from("district_cache").upsert({
    district_code: code, jurisdiction, name: d.name, description: d.description,
    setbacks: d.setbacks, max_height: d.maxHeight, max_far: d.maxFAR,
    min_lot_size: d.minLotSize, ordinance_url: d.ordinanceUrl, source: d.source,
    expires_at: expiresAt(DISTRICT_TTL_DAYS),
  }, { onConflict: "district_code,jurisdiction" });
}

async function readUsesCache(code: string, jurisdiction: string) {
  const { data } = await supabase.from("uses_cache").select("*")
    .eq("district_code", code).eq("jurisdiction", jurisdiction)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!data) return null;
  return { permitted: data.permitted ?? [], conditional: data.conditional ?? [],
           prohibited: data.prohibited ?? [], source: data.source, _fromCache: true };
}

async function writeUsesCache(code: string, jurisdiction: string, u: UsesResult) {
  await supabase.from("uses_cache").upsert({
    district_code: code, jurisdiction, permitted: u.permitted,
    conditional: u.conditional, prohibited: u.prohibited, source: u.source,
    expires_at: expiresAt(DISTRICT_TTL_DAYS),
  }, { onConflict: "district_code,jurisdiction" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function classifyUse(proposedUse: string, useMatrix: UsesResult | null): string {
  if (!useMatrix) return "unknown";
  const norm = proposedUse.toLowerCase();
  const hits = (list: string[]) =>
    list.filter(u => norm.includes(u.toLowerCase()) || u.toLowerCase().includes(norm)).length;
  const p = hits(useMatrix.permitted);
  const c = hits(useMatrix.conditional);
  const x = hits(useMatrix.prohibited);
  if (x > 0 && x >= p && x >= c) return "prohibited";
  if (p > 0 && p >= c)           return "permitted";
  if (c > 0)                     return "conditional";
  return "unknown";
}

async function timedFetch(url: string, ms: number) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200,
    headers: { ...CORS, "Content-Type": "application/json" } });
}
function jsonError(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status,
    headers: { ...CORS, "Content-Type": "application/json" } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface DistrictDetails { code: string; name: string; description: string | null;
  setbacks: Record<string, number>; maxHeight: number | null; maxFAR: number | null;
  minLotSize: number | null; ordinanceUrl: string; source: string; }
interface UsesResult { permitted: string[]; conditional: string[]; prohibited: string[]; source: string; }
