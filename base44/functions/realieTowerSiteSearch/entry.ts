// functions/realieTowerSiteSearch.js
//
// Tower site search against Realie.ai parcel data with derived-from-inputs
// buildability scoring. Filters and scores parcels for cell tower siting.
//
// Input body:
// {
//   lat, lon,                              // SARF center coord (required)
//   radiusMiles,                           // 0.25 | 0.5 | 1.0 (required)
//   towerHeightFt,                         // e.g. 199 (required)
//   compoundWidthFt, compoundDepthFt,      // e.g. 50, 50 (required)
//   batchOffset,                           // 0, 1, 2, ... (page index, 3 per page)
//   setbackMultiplier,                     // optional, default 1.0
//   fallZoneMultiplier,                    // optional, default 1.0
//   userName,                              // for logging / audit
//   demoMode                               // optional bool — returns fixtures
// }

// ---------- inlined from towerSiteMath.js (backend funcs can't share local imports) ----------
const SQFT_PER_ACRE = 43560;
const sqFtToAcres = (sqFt) => Math.round((sqFt / SQFT_PER_ACRE) * 100) / 100;

function deriveSetbackFt(towerHeightFt, multiplier = 1.0) {
  return Math.ceil(towerHeightFt * multiplier);
}
function deriveFallZoneRadiusFt(towerHeightFt, multiplier = 1.0) {
  return Math.ceil(towerHeightFt * multiplier);
}
function deriveRequiredParcelSqFt({
  towerHeightFt, compoundWidthFt, compoundDepthFt,
  setbackMultiplier = 1.0, fallZoneMultiplier = 1.0,
}) {
  const setback = deriveSetbackFt(towerHeightFt, setbackMultiplier);
  const fallZone = deriveFallZoneRadiusFt(towerHeightFt, fallZoneMultiplier);
  const compoundWithSetbackSqFt =
    (compoundWidthFt + 2 * setback) * (compoundDepthFt + 2 * setback);
  const fallZoneSqFt = Math.PI * fallZone * fallZone;
  return {
    setbackFt: setback,
    fallZoneRadiusFt: fallZone,
    compoundWithSetbackSqFt: Math.ceil(compoundWithSetbackSqFt),
    fallZoneSqFt: Math.ceil(fallZoneSqFt),
    requiredParcelSqFt: Math.ceil(Math.max(compoundWithSetbackSqFt, fallZoneSqFt)),
  };
}

const REALIE_BASE = "https://app.realie.ai/api";
const PAGE_SIZE = 3;
const OVER_FETCH_LIMIT = 100; // single Realie call per search session
const CACHE_TTL_MS = 30 * 60 * 1000;

// ---------- in-memory cache, keyed by (lat, lon, radius) ----------
const _cache = new Map();
const cacheKey = (lat, lon, r) =>
  `${lat.toFixed(5)}:${lon.toFixed(5)}:${r}`;

function cacheGet(k) {
  const hit = _cache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    _cache.delete(k);
    return null;
  }
  return hit.v;
}
function cacheSet(k, v) {
  if (_cache.size > 200) _cache.delete(_cache.keys().next().value);
  _cache.set(k, { v, t: Date.now() });
}

// ---------- useCode classification ----------
const RESIDENTIAL_USE = (uc) =>
  (uc >= 1000 && uc <= 1999) || uc === 8001 ||
  (uc >= 9000 && uc <= 9099) || (uc >= 9100 && uc <= 9199);

const TELECOM_USE_SET     = new Set([6507, 6509, 6511, 6514]);
const INDUSTRIAL_USE      = (uc) => (uc >= 5000 && uc <= 6499);
const HEAVY_INDUSTRIAL    = (uc) => (uc >= 6000 && uc <= 6499);
const AGRICULTURAL_USE    = (uc) => (uc >= 7000 && uc <= 7099);
const VACANT_COMMERCIAL   = (uc) => [8002, 8003, 8008, 8012, 8016].includes(uc);
const COMMERCIAL_USE      = (uc) => (uc >= 2000 && uc <= 4099);
const RECREATION_USE      = (uc) => (uc >= 4000 && uc <= 4099);
const ZONING_RESIDENTIAL_RX = /^R[-\s]?\d|^RD-|^SFR|^MFR|^RES/i;

// ---------- buildability score, 0–100, with transparent reasons ----------
function scoreParcel(p, ctx) {
  const reasons = [];
  let score = 30; // base, after passing hard filters

  const uc = parseInt(p.useCode, 10);
  if (TELECOM_USE_SET.has(uc)) {
    score += 25;
    reasons.push("Already telecom-zoned (useCode " + uc + ") — short CUP path");
  } else if (HEAVY_INDUSTRIAL(uc)) {
    score += 20; reasons.push("Heavy industrial zoning — tower-friendly");
  } else if (INDUSTRIAL_USE(uc)) {
    score += 18; reasons.push("Industrial zoning — tower-friendly");
  } else if (AGRICULTURAL_USE(uc)) {
    score += 14; reasons.push("Agricultural — historically CUP-friendly");
  } else if (VACANT_COMMERCIAL(uc)) {
    score += 12; reasons.push("Vacant commercial/industrial land");
  } else if (COMMERCIAL_USE(uc) && !RECREATION_USE(uc)) {
    score += 8;  reasons.push("Commercial use");
  } else if (RECREATION_USE(uc)) {
    score -= 8;  reasons.push("Recreation/entertainment — CUP often hostile");
  }

  // Headroom: how much bigger is the parcel than the strict minimum?
  const headroom = p.landArea / ctx.requiredParcelSqFt;
  if (headroom >= 3)      { score += 15; reasons.push(`${headroom.toFixed(1)}× required parcel size`); }
  else if (headroom >= 2) { score += 10; reasons.push(`${headroom.toFixed(1)}× required parcel size`); }
  else if (headroom >= 1.5){ score += 5;  reasons.push(`${headroom.toFixed(1)}× required parcel size`); }
  else                    { reasons.push("Tight fit — verify setbacks with AHJ"); }

  // Frontage / road access
  if (p.frontage && p.frontage >= 100) {
    score += 5; reasons.push(`${p.frontage} ft frontage — good access`);
  } else if (p.frontage && p.frontage >= 50) {
    score += 2;
  } else if (p.frontage != null && p.frontage < 50) {
    score -= 5; reasons.push("Narrow frontage — access road may be constrained");
  }

  // Owner profile — commercial entities are easier lease counterparties
  if (p.ownerComCount > 0) {
    score += 5; reasons.push("Commercial entity owner");
  }

  // Penalty for mixed-use or PUD zoning (residential adjacency risk)
  if (p.zoningCode && /PUD|MX|MU|MIXED/i.test(p.zoningCode)) {
    score -= 8; reasons.push(`Zoning ${p.zoningCode} — residential adjacency risk`);
  }

  // Big assessed value can correlate with active commercial use → harder to lease
  if (p.totalMarketValue && p.totalMarketValue > 5_000_000) {
    score -= 3; reasons.push("High market value — landowner motivation uncertain");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const cupRiskFlag =
    score >= 70 ? "low" :
    score >= 50 ? "medium" : "high";

  return { score, reasons, cupRiskFlag };
}

// ---------- main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST" },
    });
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "body must be JSON" }, 400); }

  const {
    lat, lon, radiusMiles,
    towerHeightFt, compoundWidthFt, compoundDepthFt,
    batchOffset = 0,
    setbackMultiplier = 1.0,
    fallZoneMultiplier = 1.0,
    userName, demoMode,
  } = body || {};

  // Validate
  if (![0.25, 0.5, 1].includes(Number(radiusMiles))) {
    return json({ error: "radiusMiles must be 0.25, 0.5, or 1.0" }, 400);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json({ error: "lat and lon required" }, 400);
  }
  if (!towerHeightFt || !compoundWidthFt || !compoundDepthFt) {
    return json({ error: "towerHeightFt, compoundWidthFt, compoundDepthFt required" }, 400);
  }

  // Derive minimum-feasibility geometry
  const geom = deriveRequiredParcelSqFt({
    towerHeightFt, compoundWidthFt, compoundDepthFt,
    setbackMultiplier, fallZoneMultiplier,
  });

  if (demoMode) return json(buildDemoResponse({ lat, lon, radiusMiles, geom, batchOffset }));

  // Cache lookup
  const key = cacheKey(lat, lon, radiusMiles);
  let pool = cacheGet(key);
  let tokensUsedThisCall = 0;

  if (!pool) {
    // Single Realie call per search session
    const url =
      `${REALIE_BASE}/public/property/location/` +
      `?latitude=${lat}&longitude=${lon}` +
      `&radius=${radiusMiles}` +
      `&limit=${OVER_FETCH_LIMIT}` +
      `&includeUnassignedAddress=true`;
    const apiKey = Deno.env.get("REALIE_API_KEY");
    if (!apiKey) return json({ error: "REALIE_API_KEY not configured" }, 500);

    const r = await fetch(url, { headers: { Authorization: apiKey } });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return json({ error: `Realie HTTP ${r.status}`, detail: text.slice(0, 300) }, 502);
    }
    const data = await r.json();
    tokensUsedThisCall = 1;
    pool = data.properties || [];
    cacheSet(key, pool);
  }

  // Filter + score
  const ctx = { requiredParcelSqFt: geom.requiredParcelSqFt };
  const excluded = { residentialUse: 0, residentialZoning: 0, tooSmall: 0, narrowFrontage: 0 };

  const eligible = [];
  for (const p of pool) {
    const uc = parseInt(p.useCode, 10);
    if (p.residential === true || RESIDENTIAL_USE(uc)) { excluded.residentialUse++; continue; }
    if (p.zoningCode && ZONING_RESIDENTIAL_RX.test(p.zoningCode)) { excluded.residentialZoning++; continue; }
    if (!p.landArea || p.landArea < geom.requiredParcelSqFt) { excluded.tooSmall++; continue; }
    if (p.frontage != null && p.frontage < Math.min(50, compoundWidthFt)) {
      excluded.narrowFrontage++; continue;
    }
    const sc = scoreParcel(p, ctx);
    eligible.push({ ...p, buildability: sc });
  }

  // Sort by score desc, tie-break by acres desc
  eligible.sort((a, b) =>
    b.buildability.score - a.buildability.score || (b.acres || 0) - (a.acres || 0)
  );

  // Page slice (3 per page)
  const start = batchOffset * PAGE_SIZE;
  const pageItems = eligible.slice(start, start + PAGE_SIZE);
  const hasMore = eligible.length > start + PAGE_SIZE;

  return json({
    found: pageItems.length > 0,
    page: { index: batchOffset, size: PAGE_SIZE },
    totals: {
      fetchedFromRealie: pool.length,
      excluded,
      eligibleAfterFilter: eligible.length,
      hasMore,
    },
    results: pageItems.map(toPublicParcel),
    derivedGeometry: {
      ...geom,
      requiredAcres: sqFtToAcres(geom.requiredParcelSqFt),
    },
    searchCenter: { lat, lon, radiusMiles, towerHeightFt, compoundWidthFt, compoundDepthFt },
    cached: tokensUsedThisCall === 0,
    tokensUsedThisCall,
    requestedBy: userName || null,
  });
});

// ---------- trim Realie response to what SiteHawk needs ----------
// CONTACT POLICY: This function returns parcel + zoning + FEMA data ONLY.
// Phone and email are ALWAYS null here — for every candidate (the 5 selected
// and the 3 that advance as Target A/B/C). Contact enrichment is handled
// exclusively by the standalone targetAContactEnrich function, which runs
// ONCE after Target A is confirmed as the best candidate.
// Do NOT add skipTrace/enformion/contact lookups to this function.
function toPublicParcel(p) {
  return {
    parcelId: p.parcelId,
    addressFull: p.addressFull,
    city: p.city, county: p.county, state: p.state, zipCode: p.zipCode,
    ownerName: p.ownerName,
    ownerMailing: {
      line1: p.ownerAddressLine1,
      city: p.ownerCity, state: p.ownerState, zip: p.ownerZipCode,
    },
    ownerComCount: p.ownerComCount,
    ownerResCount: p.ownerResCount,
    acres: p.acres,
    landAreaSqFt: p.landArea,
    frontage: p.frontage,
    zoningCode: p.zoningCode,
    useCode: p.useCode,
    legalDesc: p.legalDesc,
    totalMarketValue: p.totalMarketValue,
    totalAssessedValue: p.totalAssessedValue,
    geometry: p.geometry,         // GeoJSON MultiPolygon — feeds Mapbox directly
    location: p.location,         // GeoJSON Point — for fit-bounds
    buildability: p.buildability, // { score, reasons[], cupRiskFlag }
    // Contact fields — always null here. Populated only by targetAContactEnrich.
    phone: null,
    email: null,
  };
}

function buildDemoResponse({ lat, lon, radiusMiles, geom, batchOffset }) {
  // Three deterministic fixture parcels around the search point for demos.
  // No tokens consumed.
  const fixtures = [
    { parcelId: "DEMO-001", addressFull: "1450 INDUSTRIAL PKWY", ownerName: "ACME LOGISTICS LLC",
      acres: 4.8, landArea: 209_088, frontage: 220, zoningCode: "I-2", useCode: "5012",
      totalMarketValue: 1_240_000, ownerComCount: 3, ownerResCount: 0,
      buildability: { score: 82, reasons: ["Industrial zoning — tower-friendly", "2.6× required parcel size", "220 ft frontage — good access", "Commercial entity owner"], cupRiskFlag: "low" },
      location: { type: "Point", coordinates: [lon + 0.002, lat + 0.001] },
      geometry: null,
      phone: null, email: null,
    },
    { parcelId: "DEMO-002", addressFull: "VACANT PARCEL — SR 66", ownerName: "HOLDINGS TRUST XYZ",
      acres: 6.2, landArea: 270_072, frontage: 0, zoningCode: "C-3", useCode: "8002",
      totalMarketValue: 380_000, ownerComCount: 1, ownerResCount: 0,
      buildability: { score: 72, reasons: ["Vacant commercial/industrial land", "3.4× required parcel size", "Commercial entity owner"], cupRiskFlag: "low" },
      location: { type: "Point", coordinates: [lon - 0.003, lat + 0.002] },
      geometry: null,
      phone: null, email: null,
    },
    { parcelId: "DEMO-003", addressFull: "0 COUNTY RD 14", ownerName: "JOHNSON FAMILY FARM",
      acres: 38.4, landArea: 1_672_704, frontage: 600, zoningCode: "AG", useCode: "7001",
      totalMarketValue: 245_000, ownerComCount: 0, ownerResCount: 0,
      buildability: { score: 65, reasons: ["Agricultural — historically CUP-friendly", "21× required parcel size", "600 ft frontage — good access"], cupRiskFlag: "medium" },
      location: { type: "Point", coordinates: [lon + 0.004, lat - 0.002] },
      geometry: null,
      phone: null, email: null,
    },
  ];
  return {
    found: true,
    page: { index: batchOffset, size: 3 },
    totals: { fetchedFromRealie: 0, excluded: { residentialUse: 14, residentialZoning: 3, tooSmall: 9, narrowFrontage: 1 }, eligibleAfterFilter: 3, hasMore: false },
    results: fixtures,
    derivedGeometry: { ...geom, requiredAcres: sqFtToAcres(geom.requiredParcelSqFt) },
    searchCenter: { lat, lon, radiusMiles },
    cached: false, tokensUsedThisCall: 0, demo: true,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}