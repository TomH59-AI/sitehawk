import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Realie parcel search — now calls the Realie API DIRECTLY with REALIE_API_KEY.
// (Previously proxied through a Supabase edge function; Supabase is no longer
// in the path.) Response shape is unchanged so all Section 4 renderers,
// GenerateScipButton, and the verification map keep working as-is.
//
// Modes (same contract as before):
//   - ring:  { mode:"ring",  lat, lon, radius_miles (≤2), min_acres, max_acres }
//   - click: { mode:"click", lat, lon }   ← single parcel under a map click

const REALIE_BASE = "https://app.realie.ai/api";

// ── zone_class: collapse Realie useCode/zoningCode into one of six stable buckets ──
const OS_EXPLICIT = new Set([714, 752, 4025, 4027, 4028, 9202]);
const VACANT_MAP = { 8001:'RES', 8002:'COMM', 8003:'IND', 8004:'OS', 8007:'RES', 8008:'AG', 8009:'OS', 8010:'OS', 8011:'OS' };
function classifyUseCode(useCode) {
  if (useCode == null) return null;
  const n = parseInt(String(useCode).replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  if (OS_EXPLICIT.has(n)) return 'OS';
  if (n >= 8000 && n <= 8017) return VACANT_MAP[n] || 'OTHER';
  if (n >= 1000 && n <= 1999) return 'RES';
  if (n >= 2000 && n <= 4999) return 'COMM';
  if (n >= 5000 && n <= 6599) return 'IND';
  if (n >= 7000 && n <= 7999) return 'AG';
  return 'OTHER';
}
function classifyZoningString(z) {
  if (!z) return 'OTHER';
  const s = String(z).toUpperCase().trim();
  if (/^(OS|OSC|CON|CONS|CONSERV|OPEN|GREEN|PARK|REC)/.test(s)) return 'OS';
  if (/^(AG|AGR|A[-\s]?\d|A$|EA|FR|RA[-\s]?\d?)/.test(s)) return 'AG';
  if (/^(R|SF|MF|MH|TH|DR|MDR|HDR|LDR)/.test(s)) return 'RES';
  if (/^(C|B|CB|CC|GB|NC|MU|MX|O[-\s]?\d|O$|OF|OP|PO|PD|RT|RETAIL|HOT|HC)/.test(s)) return 'COMM';
  if (/^(I|M|IL|IH|LI|HI|IND|MFG|IP|BP|LM|GM|W|WH)/.test(s)) return 'IND';
  return 'OTHER';
}
function resolveZoneClass(p) {
  const byUse = classifyUseCode(p.useCode ?? p.use_code);
  if (byUse) return byUse;
  return classifyZoningString(p.zoningCode ?? p.zoning_code ?? p.zoning ?? p.land_use);
}

// Owner mailing address assembled from the Realie owner* fields.
function mailingAddress(p) {
  if (p.mailing_address || p.ownerMailingAddress) return p.mailing_address || p.ownerMailingAddress;
  const line = [p.ownerAddressLine1, p.ownerCity, [p.ownerState, p.ownerZipCode].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");
  return line || null;
}

// Map a raw Realie property onto the shape the frontend already consumes.
// Handles both the direct-API camelCase names and the legacy v43 snake_case
// names so nothing downstream changes.
function normalize(p) {
  return {
    apn: p.apn || p.parcelId || p.parcel_id || p.parcel_number || null,
    owner_name: p.owner_name || p.ownerName || p.owner || null,
    mailing_address: mailingAddress(p),
    parcel_address: p.site_address || p.address || p.addressFull || p.fullAddress || null,
    acreage: p.acres ?? p.acreage ?? p.lotSizeAcres ?? null,
    acres_formatted: p.acres_formatted || null,
    lot_frontage_ft: p.lotFrontage || p.frontage || p.lot_frontage || null,
    lot_depth_ft: p.lotDepth || p.depthSize || p.depth || p.lot_depth || null,
    lot_size_sqft: p.lotSizeSqFt || p.landArea || p.lot_size_sqft || null,
    land_use: p.land_use || p.landUse || p.useDescription || p.useCode || p.zoning || null,
    // ── Tax assessment ──
    assessed_value: p.total_assessed ?? p.totalAssessedValue ?? p.assessedValue ?? null,
    total_assessed: p.total_assessed ?? p.totalAssessedValue ?? null,
    land_value: p.land_value ?? p.totalLandValue ?? null,
    improvement_value: p.improvement_value ?? p.totalBuildingValue ?? null,
    market_value: p.market_value ?? p.totalMarketValue ?? null,
    annual_tax: p.annual_tax ?? p.taxValue ?? null,
    tax_year: p.tax_year ?? p.taxYear ?? null,
    // ── Sale / deed ──
    last_sale_date: p.last_sale_date || p.lastSaleDate || p.transferDate || null,
    last_sale_price: p.last_sale_price ?? p.lastSalePrice ?? p.transferPrice ?? null,
    deed_type: p.deed_type || p.documentType || null,
    deed_doc_num: p.deed_doc_num || p.documentNum || null,
    deed_book: p.deed_book || p.bookNum || null,
    ownership_start: p.ownership_start || p.transferDate || null,
    // ── Chain of title ──
    transfers: Array.isArray(p.transfers) ? p.transfers : [],
    legal_description: p.legal_description || p.legalDesc || null,
    plss_formatted: p.plss_formatted || p.secTwnRng || null,
    data_source: p.data_source || "realie",
    latitude: p.latitude ?? p.lat ?? (p.location?.coordinates?.[1]) ?? null,
    longitude: p.longitude ?? p.lon ?? p.lng ?? (p.location?.coordinates?.[0]) ?? null,
    // GeoJSON parcel polygon (Realie returns a MultiPolygon under `geometry`).
    parcel_geometry: p.geometry || p.parcel_geometry || p.parcelGeometry || null,
    // Zone bucket: RES | COMM | IND | AG | OS | OTHER
    zone_class: resolveZoneClass(p),
  };
}

async function realieLocation(apiKey, lat, lon, radius, limit, offset) {
  const url = `${REALIE_BASE}/public/property/location/?${new URLSearchParams({
    latitude: String(lat), longitude: String(lon), radius: String(radius),
    limit: String(limit), offset: String(offset), includeUnassignedAddress: "true",
  })}`;
  const r = await fetch(url, { headers: { Authorization: apiKey } });
  if (r.status === 404) return { properties: [] };
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Realie HTTP ${r.status}: ${text.slice(0, 200)}`);
  }
  return r.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { lat, lon, mode } = body;
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const apiKey = Deno.env.get("REALIE_API_KEY");
    if (!apiKey) return Response.json({ error: "REALIE_API_KEY not set" }, { status: 500 });

    const reqMode = mode === "click" ? "click" : "ring";
    let rawParcels = [];
    let radiusMiles;

    if (reqMode === "click") {
      // Small-radius nearest-parcel lookup under the click point.
      const data = await realieLocation(apiKey, lat, lon, 0.03, 1, 0);
      rawParcels = data.properties || [];
    } else {
      radiusMiles = Math.min(Number(body.radius_miles ?? 1.0), 2.0);
      // Paginate up to 3 pages (300 parcels) — matches prior practical caps.
      let offset = 0;
      for (let page = 0; page < 3; page++) {
        const data = await realieLocation(apiKey, lat, lon, radiusMiles, 100, offset);
        const items = data.properties || [];
        rawParcels.push(...items);
        if (items.length < 100) break;
        offset += 100;
      }
    }

    let parcels = rawParcels.map(normalize).filter((p) => p.apn || p.owner_name || p.parcel_address);

    // Acreage filters (previously applied upstream).
    if (reqMode === "ring") {
      const minA = body.min_acres != null ? Number(body.min_acres) : null;
      const maxA = body.max_acres != null ? Number(body.max_acres) : null;
      if (minA != null) parcels = parcels.filter((p) => p.acreage == null || Number(p.acreage) >= minA);
      if (maxA != null) parcels = parcels.filter((p) => p.acreage == null || Number(p.acreage) <= maxA);
    }

    return Response.json({
      ok: true,
      mode: reqMode,
      clicked: reqMode === "click" ? parcels.length > 0 : undefined,
      count: parcels.length,
      radius_miles: reqMode === "ring" ? radiusMiles : undefined,
      center: { lat, lon },
      parcels,
    });
  } catch (error) {
    console.error("realieParcelsInRing error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});