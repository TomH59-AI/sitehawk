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
const GIS_URL = Deno.env.get("OAKLAND_COUNTY_GIS_URL") ??
  "https://services1.arcgis.com/GE4Idg9FL97XBa3P/arcgis/rest/services/Zoning_Layers_view/FeatureServer/12";
const GIS_DISTRICT_FIELD = Deno.env.get("GIS_DISTRICT_FIELD") ?? "ZONECODE";
const GIS_NAME_FIELD     = Deno.env.get("GIS_NAME_FIELD")     ?? "ZONEDESC";

// Optional: pin a Municode municipality ID (otherwise resolved from jurisdiction)
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
// Municode ordinance fetch — real api.municode.com JSON API
// (ported from mcp/zoning/lib/municode.js + parser.js, live-tested)
// ─────────────────────────────────────────────────────────────────────────────

const MC_API = "https://api.municode.com";
const MC_LIB = "https://library.municode.com";
const MC_UA  = "Mozilla/5.0 (compatible; SiteHawk-Zoning/1.1; +https://github.com/TomH59-AI/sitehawk)";
const MC_ZONING_KEYWORDS = ["zoning", "land development", "land use", "unified development"];
const mcClientCache = new Map<string, unknown[]>();

function resolveStateAbbr(jurisdiction: string): string {
  const m = (jurisdiction ?? "").match(/,\s*([A-Za-z]{2})\s*$/);
  return (m?.[1] ?? DEFAULT_STATE_ABBR).toUpperCase();
}

async function mcFetch(url: string, ms = 20_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers: { "User-Agent": MC_UA, Accept: "application/json" }, signal: ctrl.signal });
  } finally { clearTimeout(timer); }
}

async function mcFindMunicipality(placeName: string, stateAbbr: string) {
  const st = String(stateAbbr || "").toUpperCase().trim();
  if (!st) return null;
  let clients = mcClientCache.get(st) as any[] | undefined;
  if (!clients) {
    const res = await mcFetch(`${MC_API}/Clients/stateAbbr?stateAbbr=${st}`);
    if (!res.ok) { console.warn(`[municode] client list HTTP ${res.status}`); return null; }
    clients = await res.json().catch(() => null);
    if (!Array.isArray(clients)) return null;
    mcClientCache.set(st, clients);
  }
  const norm = String(placeName || "")
    .replace(new RegExp(`,\\s*${st}\\s*$`, "i"), "")
    .replace(/\b(village|city|town|charter township|township) of\b/gi, "")
    .trim().toLowerCase();
  if (!norm) return null;
  const cleanName = (c: any) => c.ClientName.replace(/\(.*?\)/g, "").replace(/,/g, "").trim().toLowerCase();
  const best =
    clients.find((c: any) => cleanName(c) === norm) ??
    clients.find((c: any) => cleanName(c).startsWith(norm)) ??
    clients.find((c: any) => cleanName(c).includes(norm) || norm.includes(cleanName(c)));
  if (!best) return null;
  return { clientId: (best as any).ClientID, name: (best as any).ClientName };
}

function mcDistrictTokenRegex(code: string) {
  const esc = code.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]+/g, "[-\u2013\\s]?");
  return new RegExp(`(^|[^A-Za-z0-9])${esc}($|[^A-Za-z0-9])`, "i");
}

function mcSectionDistrictName(heading: string, code: string) {
  if (!heading) return null;
  const idx = heading.toUpperCase().indexOf(code.toUpperCase());
  if (idx === -1) return null;
  return heading.slice(idx).replace(/\.$/, "").trim() || null;
}

async function mcFindDistrictSection(jobId: number, productId: number, startNodes: any[], districtCode: string, maxDepth = 4) {
  const codeRe = mcDistrictTokenRegex(districtCode);
  let frontier = [...startNodes];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const direct = frontier.find((n: any) => codeRe.test(n.Heading ?? ""));
    if (direct && !direct.HasChildren) return direct;
    if (direct) frontier = [direct];
    const next: any[] = [];
    for (const node of frontier) {
      if (!node.HasChildren) continue;
      const h = (node.Heading ?? "").toLowerCase();
      const plausible = depth === 0 || direct === node ||
        codeRe.test(node.Heading ?? "") ||
        ["district", "zoning", "use", "schedule", "regulation", "article", "division"].some((kw) => h.includes(kw));
      if (!plausible) continue;
      const res = await mcFetch(`${MC_API}/codesToc/children?jobId=${jobId}&nodeId=${node.Id}&productId=${productId}`);
      if (!res.ok) continue;
      const kids = await res.json().catch(() => []);
      if (Array.isArray(kids)) next.push(...kids);
    }
    const hit = next.find((n: any) => codeRe.test(n.Heading ?? "") && !n.HasChildren);
    if (hit) return hit;
    frontier = next;
  }
  return null;
}

async function mcFetchSectionContent(jobId: number, productId: number, nodeId: string) {
  const res = await mcFetch(`${MC_API}/CodesContent?jobId=${jobId}&nodeId=${nodeId}&productId=${productId}`);
  if (!res.ok) { console.warn(`[municode] content HTTP ${res.status}`); return null; }
  const data = await res.json().catch(() => null);
  const docs = data?.Docs ?? [];
  if (!docs.length) return null;
  return docs.map((d: any) => `${d.TitleHtml ?? ""}\n${d.Content ?? ""}`).join("\n");
}

async function mcFetchZoningOrdinance(clientId: number | string, districtCode: string) {
  const contentRes = await mcFetch(`${MC_API}/ClientContent/${clientId}`);
  if (!contentRes.ok) { console.warn(`[municode] ClientContent HTTP ${contentRes.status}`); return null; }
  const content = await contentRes.json().catch(() => null);
  const codes = content?.codes ?? [];
  if (!codes.length) return null;
  const product = codes.find((p: any) => /zoning/i.test(p.productName)) ?? codes[0];

  const jobRes = await mcFetch(`${MC_API}/Jobs/latest/${product.productId}`);
  if (!jobRes.ok) return null;
  const job = await jobRes.json().catch(() => null);
  if (!job?.Id) return null;

  const tocRes = await mcFetch(`${MC_API}/codesToc?jobId=${job.Id}&productId=${product.productId}`);
  if (!tocRes.ok) return null;
  const toc = await tocRes.json().catch(() => null);
  const topNodes = toc?.Children ?? [];

  const zoningNode = /zoning/i.test(product.productName)
    ? null
    : topNodes.find((n: any) => MC_ZONING_KEYWORDS.some((kw) => (n.Heading ?? "").toLowerCase().includes(kw)));
  if (!zoningNode && !/zoning/i.test(product.productName)) {
    console.warn(`[municode] no zoning title for clientId=${clientId} ("${product.productName}")`);
    return null;
  }

  const startNodes = zoningNode ? [zoningNode] : topNodes;
  const section = await mcFindDistrictSection(job.Id, product.productId, startNodes, districtCode);
  if (!section) { console.warn(`[municode] district "${districtCode}" not found (clientId=${clientId})`); return null; }

  const html = await mcFetchSectionContent(job.Id, product.productId, section.Id);
  if (!html) return null;

  const parsed = parseOrdinanceHtml(html, districtCode);
  return {
    name: mcSectionDistrictName(section.Heading, districtCode) ?? parsed.name,
    description: parsed.description,
    setbacks: parsed.setbacks ?? {},
    maxHeight: parsed.maxHeight,
    maxFAR: parsed.maxFAR,
    minLotSize: parsed.minLotSize,
    permitted: parsed.permitted,
    conditional: parsed.conditional,
    prohibited: parsed.prohibited,
    ordinanceUrl: `${MC_LIB}/#nodeId=${section.Id}`,
    source: `municode:${clientId}:${section.Id}`,
  };
}

async function fetchMunicodeDetails(districtCode: string, jurisdiction: string) {
  try {
    let clientId: string | number | null = MUNICODE_CLIENT_ID;
    if (!clientId) {
      const stateAbbr = resolveStateAbbr(jurisdiction);
      const muni = await mcFindMunicipality(jurisdiction, stateAbbr);
      if (!muni) { console.warn(`[municode] no municipality match: "${jurisdiction}" (${stateAbbr})`); return null; }
      clientId = muni.clientId;
    }
    const ord = await mcFetchZoningOrdinance(clientId, districtCode);
    if (!ord) return null;
    return { code: districtCode, ...ord };
  } catch (e) {
    console.warn("[municode]", (e as Error).message);
    return null;
  }
}

// ── Ordinance HTML parser (ported from mcp/zoning/lib/parser.js) ───────────────

function parseOrdinanceHtml(html: string, districtCode: string) {
  const text = pStripTags(html);
  return {
    name: pDistrictName(text, districtCode),
    description: pDescription(text),
    setbacks: pSetbacks(text),
    maxHeight: pMaxHeight(text),
    maxFAR: pMaxFAR(text),
    minLotSize: pMinLotSize(text),
    ...pUseMatrix(html, text),
  };
}

function pStripTags(html: string) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pEscRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function pDistrictName(text: string, code: string) {
  const patterns = [
    new RegExp(`${pEscRe(code)}[\\s\u2013-]+([A-Z][A-Za-z ,-]{5,60})`, "i"),
    /(?:district|zone)[:\s]+([A-Z][A-Za-z ,-]{5,60})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim().replace(/\.$/, "");
  }
  return `${code} Zoning District`;
}

function pDescription(text: string) {
  const m = text.match(/(?:purpose|intent|district is intended)[:\s.]+([^.]{40,400}\.)/i);
  return m?.[1]?.trim() ?? null;
}

function pSetbacks(text: string) {
  const setbacks: Record<string, number> = {};
  const patterns: Record<string, RegExp[]> = {
    front: [/front\s+(?:yard\s+)?setback[:\s]+(\d+(?:\.\d+)?)\s*(?:feet|ft|')/i,
            /minimum\s+front\s+yard[:\s]+(\d+(?:\.\d+)?)/i],
    rear:  [/rear\s+(?:yard\s+)?setback[:\s]+(\d+(?:\.\d+)?)\s*(?:feet|ft|')/i,
            /minimum\s+rear\s+yard[:\s]+(\d+(?:\.\d+)?)/i],
    side:  [/side\s+(?:yard\s+)?setback[:\s]+(\d+(?:\.\d+)?)\s*(?:feet|ft|')/i,
            /minimum\s+side\s+yard[:\s]+(\d+(?:\.\d+)?)/i],
  };
  for (const [key, pats] of Object.entries(patterns)) {
    for (const re of pats) {
      const m = text.match(re);
      if (m?.[1]) { setbacks[key] = parseFloat(m[1]); break; }
    }
  }
  return Object.keys(setbacks).length ? setbacks : null;
}

function pMaxHeight(text: string) {
  const patterns = [
    /maximum\s+(?:building\s+)?height[:\s]+(\d+(?:\.\d+)?)\s*(?:feet|ft|')/i,
    /height\s+limit[:\s]+(\d+(?:\.\d+)?)\s*(?:feet|ft|')/i,
    /(?:not\s+exceed|shall\s+not\s+exceed)\s+(\d+(?:\.\d+)?)\s*(?:feet|ft)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return parseFloat(m[1]);
  }
  return null;
}

function pMaxFAR(text: string) {
  const m = text.match(/(?:floor\s+area\s+ratio|FAR)[:\s]+(\d+(?:\.\d+)?)/i);
  return m?.[1] ? parseFloat(m[1]) : null;
}

function pMinLotSize(text: string) {
  const patterns = [
    /minimum\s+lot\s+(?:area|size)[:\s]+(\d[\d,]*)\s*(?:square\s+feet|sq\.?\s*ft)/i,
    /lot\s+area[:\s]+(\d[\d,]*)\s*(?:square\s+feet|sq\.?\s*ft)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return parseInt(m[1].replace(/,/g, ""), 10);
  }
  return null;
}

const P_USE_KEYWORDS: Record<string, string[]> = {
  permitted:   ["permitted use", "uses permitted", "allowed by right", "principal permitted"],
  conditional: ["conditional use", "special use", "special exception", "uses permitted by"],
  prohibited:  ["prohibited use", "not permitted", "shall not be permitted"],
};

function pUseMatrix(html: string, text: string) {
  const result: Record<string, string[]> = { permitted: [], conditional: [], prohibited: [] };
  const tableUses = pFromTable(html);
  if (tableUses.permitted.length || tableUses.conditional.length) return tableUses;

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let cat: string | null = null;
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const [c, kws] of Object.entries(P_USE_KEYWORDS)) {
      if (kws.some((kw) => lower.includes(kw))) { cat = c; break; }
    }
    if (cat && (/^[\d.\u2022\-\u2013*\u25aa\u25ba]\s+\w/.test(line) || /^\w.{5,80}$/.test(line))) {
      const cleaned = line.replace(/^[\d.\u2022\-\u2013*\u25aa\u25ba\s]+/, "").replace(/[.;,]+$/, "").trim();
      if (cleaned && !result[cat].includes(cleaned)) result[cat].push(cleaned);
    }
  }
  return result;
}

function pFromTable(html: string) {
  const result: Record<string, string[]> = { permitted: [], conditional: [], prohibited: [] };
  const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [])
      .map((c) => pStripTags(c).trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const useName = cells[0];
    const ind = (cells[1] ?? "").toUpperCase().trim();
    if (!useName || useName.length < 3) continue;
    if (["P", "Y", "YES", "PERMITTED", "\u2713", "X"].includes(ind)) result.permitted.push(useName);
    else if (["C", "CU", "SE", "SUP", "CONDITIONAL", "SPECIAL"].includes(ind)) result.conditional.push(useName);
    else if (["N", "NO", "PROHIBITED", "-", "\u2014"].includes(ind)) result.prohibited.push(useName);
  }
  return result;
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
