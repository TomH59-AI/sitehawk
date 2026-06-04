import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// scipBestParcels — Step 3 of the SCIP.
// Searches ALL parcels in the SARF ring via Realie Location Search, scores each one against
// tower-siting criteria, and returns the THREE best as Target A / B / C.
//
// Selection criteria (per client): the major factors are
//   - no residential land use,
//   - lot large enough for setbacks + fall zone + tower separation + compound,
//   - favorable zoning classification (industrial / agricultural / commercial preferred),
//   - CUP/special-exception posture (unknown non-residential zones stay eligible for review),
//   - PE letter/self-certification posture (checked in Section 2 and used by the scorecard),
//   - FEMA flood risk (minimal preferred).
//
// Payload: { lat, lon, radius_miles=1.0, tower_height_ft=199, compound_side_ft=100,
//            setback_ft=0, fall_zone_ft=0, separation_ft=0 }
// Returns: { count_scanned, targets: [ {label, ...parcel fields..., score, score_reasons} x3 ] }

const REALIE_URL = "https://app.realie.ai/api/public/property/location/";
const FEMA_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

const RESIDENTIAL_TOKENS = [
  "residential", "single family", "single-family", "duplex", "triplex", "quadruplex",
  "apartment", "condo", "townhouse", "mobile home", "dwelling", "sfr", "multi-family",
  "multifamily", "r-1", "r-2", "r-3", "rsf", "rmf", "rm-", "rs-",
];

// Zoning families that are favorable for a tower, with a base bonus.
function zoningScore(zoning, landUse) {
  const z = `${zoning || ""} ${landUse || ""}`.toLowerCase();
  if (!z.trim()) return { pts: 8, reason: "Zoning unknown — needs verification" };
  if (/(industrial|i-1|i-2|im|light industrial|heavy industrial|manufactur)/.test(z))
    return { pts: 30, reason: "Industrial zoning — strongly favorable" };
  if (/(agricultur|\ba-1\b|\ba-2\b|\bag\b|rural|farm)/.test(z))
    return { pts: 26, reason: "Agricultural / rural zoning — favorable" };
  if (/(commercial|\bc-1\b|\bc-2\b|\bc-3\b|business|\bcg\b|\bcc\b|retail|office)/.test(z))
    return { pts: 22, reason: "Commercial zoning — favorable" };
  if (/(utility|public|institution|government|vacant|conservation open)/.test(z))
    return { pts: 18, reason: "Utility / public / vacant land — workable" };
  if (RESIDENTIAL_TOKENS.some((t) => z.includes(t)))
    return { pts: -40, reason: "Residential zoning — disfavored for towers" };
  return { pts: 14, reason: "Other non-residential zoning — retained for CUP / special-exception review" };
}

function isResidential(useCode, zoning, landUse) {
  const code = String(useCode || "");
  // Realie useCode 1000-1199 block = residential / residential income
  if (/^1[01]\d\d$/.test(code) || code === "1999") return true;
  const s = `${zoning || ""} ${landUse || ""}`.toLowerCase();
  return RESIDENTIAL_TOKENS.some((t) => s.includes(t));
}

// FEMA high-risk Special Flood Hazard Areas — A/AE/V families are a hard
// exclusion at scrub time (the parcel can still be flagged if nothing else
// qualifies, but it never ranks ahead of a dry parcel).
function isHighRiskFlood(code) {
  const z = String(code || "").trim().toUpperCase();
  return /^(A|AE|AH|AO|AR|A99|V|VE)$/.test(z);
}

// Owner-type posture — commercial/industrial/institutional owners are easier to
// negotiate a ground lease with than an individual homeowner. Best-effort from
// the owner name string (LLC / INC / CORP / CHURCH / COUNTY / STATE etc.).
function ownerTypeScore(owner) {
  const o = String(owner || "").toLowerCase();
  if (!o.trim()) return { pts: 0, reason: "Owner unknown" };
  if (/(county|city of|state of|usa|federal|district|authority|board of|department)/.test(o))
    return { pts: 10, reason: "Institutional / government owner — favorable" };
  if (/(church|ministr|temple|synagog|mosque|school|university|college|hospital)/.test(o))
    return { pts: 8, reason: "Institutional owner — favorable" };
  if (/(llc|inc\b|corp|company|\bco\b|ltd|lp\b|llp|holdings|properties|partners|enterprises|trust|group)/.test(o))
    return { pts: 8, reason: "Commercial / entity owner — favorable" };
  return { pts: 2, reason: "Individual owner" };
}

// Required compound footprint diameter in feet for the tower + buffers.
function requiredFootprintFt({ tower_height_ft, compound_side_ft, setback_ft, fall_zone_ft, separation_ft }) {
  const fall = fall_zone_ft > 0 ? fall_zone_ft : tower_height_ft; // default fall zone = full height
  const buffer = Math.max(fall, setback_ft, separation_ft);
  return compound_side_ft + 2 * buffer;
}

// Acres needed for a square parcel that fits the required footprint diameter.
function requiredAcres(footprintFt) {
  const sqFt = footprintFt * footprintFt;
  return sqFt / 43560;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function indicatesYes(v) {
  if (!v) return false;
  const s = String(v).toLowerCase();
  if (/\b(no|not|none|prohibited|silent|unknown|n\/a)\b/.test(s) && !/\byes\b/.test(s)) return false;
  return /\b(yes|accept(ed|s)?|allow(ed|s)?|permit(ted|s)?|available|by special exception|conditional use)\b/.test(s);
}

function parseFeet(v, towerHeightFt) {
  if (v == null) return 0;
  if (typeof v === "number") return v > 0 ? v : 0;
  const s = String(v);
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return (parseFloat(pct[1]) / 100) * towerHeightFt;
  const ft = s.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|')/i) || s.match(/(\d+(?:\.\d+)?)/);
  return ft ? parseFloat(ft[1]) : 0;
}

function pick(p, ...keys) {
  for (const k of keys) {
    if (p[k] !== undefined && p[k] !== null && p[k] !== "") return p[k];
  }
  return null;
}

async function zoneomicsZone(lat, lon, apiKey) {
  if (!apiKey) return null;
  try {
    const url = new URL("https://api.zoneomics.com/v2/zoneDetail");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lng", String(lon));
    url.searchParams.set("output_fields", "zoning");
    const r = await fetch(url.toString());
    if (!r.ok) return null;
    const d = await r.json();
    const z = d?.data?.zoning || d?.zoning || {};
    return z.zone_code || z.zone_name || z.zoning_code || null;
  } catch {
    return null;
  }
}

// Full Zoneomics enrichment for ONE target — owner / acreage / address / land
// use / zone code. Realie's location endpoint is geometry-only for many
// parcels (empty transfers/assessments), so Zoneomics' parcels block fills the
// SCIP fields the user expects. Returns { owner_name, parcel_address, acreage,
// land_use, zone_code, owner_mailing } (any field may be null).
async function zoneomicsEnrich(lat, lon, apiKey) {
  if (!apiKey) return null;
  try {
    const url = new URL("https://api.zoneomics.com/v2/zoneDetail");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lng", String(lon));
    url.searchParams.set("output_fields", "zoning,parcels");
    const r = await fetch(url.toString());
    if (!r.ok) return null;
    const d = (await r.json())?.data || {};
    const zd = d.zone_details || d.zoning || {};
    const parcel = (d.parcels && d.parcels[0]) || null;
    // Sentinel scrub — Zoneomics returns "NA"/"Unknown"/"-" for missing fields.
    const cln = (v) => {
      const s = String(v ?? "").trim();
      return s && !/^(na|n\/a|unknown|none|null|-|—)$/i.test(s) ? s : null;
    };
    const acreage =
      parcel?.area_unit === "acres" ? Number(parcel.area)
      : parcel?.area_unit === "sq.yds" ? Number(parcel.area) / 4840
      : null;
    return {
      owner_name: cln(parcel?.owner_info?.owner_name),
      owner_mailing: cln(parcel?.owner_info?.owner_address),
      parcel_address: cln(parcel?.address),
      land_use: cln(parcel?.land_use),
      acreage: Number.isFinite(acreage) && acreage > 0 ? Math.round(acreage * 100) / 100 : null,
      zone_code: cln(zd.zone_code) || cln(zd.zone_name),
    };
  } catch {
    return null;
  }
}

async function femaRisk(lat, lon) {
  try {
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outFields: "FLD_ZONE,SFHA_TF",
      returnGeometry: "false",
      f: "json",
    });
    const r = await fetch(`${FEMA_URL}?${params}`, {
      headers: { "User-Agent": "SiteHawk/1.0", Accept: "application/json" },
    });
    if (!r.ok) return { code: "—", level: "unknown" };
    const data = await r.json();
    if (!data.features || data.features.length === 0) return { code: "X", level: "minimal" };
    const zone = (data.features[0].attributes.FLD_ZONE || "X").trim().toUpperCase();
    const level = zone === "X" || zone === "C" || zone === "B" ? "minimal" : zone === "D" ? "undetermined" : "high";
    return { code: zone, level };
  } catch {
    return { code: "—", level: "unknown" };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      lat, lon, radius_miles = 1.0,
      tower_height_ft = 199, compound_side_ft = 100,
      setback_ft = 0, fall_zone_ft = 0, separation_ft = 0,
      cup_or_special_exception = null, pe_self_certification = null,
      fall_zone = null, setback = null,
    } = body;
    if (lat == null || lon == null) return Response.json({ error: "lat and lon required" }, { status: 400 });

    const apiKey = Deno.env.get("REALIE_API_KEY");
    if (!apiKey) return Response.json({ error: "REALIE_API_KEY not set" }, { status: 500 });

    const radius = Math.min(radius_miles, 2.0);
    // Prefer non-residential parcels at the source, but if too few come back, also pull the unfiltered set.
    const urls = [
      `${REALIE_URL}?latitude=${lat}&longitude=${lon}&radius=${radius}&limit=100&residential=false`,
      `${REALIE_URL}?latitude=${lat}&longitude=${lon}&radius=${radius}&limit=100`,
    ];

    const fieldCount = (p) => Object.values(p).filter((v) => v !== null && v !== undefined && v !== "").length;
    const seen = new Map();
    for (const url of urls) {
      const r = await fetch(url, { headers: { Authorization: apiKey } });
      if (!r.ok) continue;
      const data = await r.json();
      const items = data.properties || data.results || (Array.isArray(data) ? data : []);
      for (const p of items) {
        const apn = pick(p, "apn", "parcelId", "parcel_id", "parcel_number");
        const key = apn || `${pick(p, "addressRaw", "address", "fullAddress")}|${pick(p, "latitude", "lat")}`;
        // Keep the richer record when the same parcel appears in both result sets.
        const prev = seen.get(key);
        if (!prev || fieldCount(p) > fieldCount(prev)) seen.set(key, p);
      }
    }

    // ── FALL ZONE: full vs. relief ──────────────────────────────────────────
    // Full (base) fall zone — ordinance fall_zone string wins over the legacy
    // fall_zone_ft number, else default to full tower height.
    const ordFallFt = parseFeet(fall_zone, tower_height_ft);
    const baseFall = fall_zone_ft > 0 ? fall_zone_ft : (ordFallFt > 0 ? ordFallFt : tower_height_ft);
    const peOk = indicatesYes(pe_self_certification);
    const cupOk = indicatesYes(cup_or_special_exception);
    const setbackFt = parseFeet(setback, tower_height_ft);
    let reliefFall = baseFall;
    let reliefLabel = null;
    if (peOk && setbackFt > 0) {
      reliefFall = Math.min(baseFall, setbackFt);
      reliefLabel = cupOk ? "PE letter + CUP" : "PE letter";
    } else if (peOk || cupOk) {
      reliefFall = Math.min(baseFall, 0.75 * tower_height_ft);
      reliefLabel = peOk && cupOk ? "PE letter + CUP" : (cupOk ? "CUP/special exception" : "PE letter");
    }

    // Footprint + minimum buildable acres computed TWICE — full and relief.
    const footprintFt = requiredFootprintFt({ tower_height_ft, compound_side_ft, setback_ft, fall_zone_ft: baseFall, separation_ft });
    const needAcres = requiredAcres(footprintFt);
    // Absolute minimum buildable lot: must at least fit the compound + a full fall zone.
    // Anything smaller can never host the tower, so it is disqualified outright.
    const minBuildableAcres = requiredAcres(compound_side_ft + baseFall);
    // Relief variants — used only when Section 2 grants PE-letter / CUP relief.
    const reliefFootprintFt = requiredFootprintFt({ tower_height_ft, compound_side_ft, setback_ft, fall_zone_ft: reliefFall, separation_ft });
    const reliefNeedAcres = requiredAcres(reliefFootprintFt);
    const reliefMinBuildableAcres = requiredAcres(compound_side_ft + reliefFall);

    const scored = [];
    for (const p of seen.values()) {
      const zoning = pick(p, "zoningCode", "zoning", "zoning_code");
      const landUse = pick(p, "landUse", "land_use", "useDescription", "propertyUseDescription");
      const useCode = pick(p, "useCode", "use_code");
      const acreage = Number(pick(p, "acres", "acreage", "lotSizeArea") || 0);
      const frontage = pick(p, "frontage");
      const depth = pick(p, "depthSize", "depth");
      const plat = Number(pick(p, "latitude", "lat") || 0);
      const plon = Number(pick(p, "longitude", "lon", "lng") || 0);

      // RING GUARD — only keep parcels whose centroid actually falls inside the
      // SARF ring. Realie's radius can return parcels just outside it; we never
      // want a target outside the search area. Parcels with no coords are kept
      // (Realie already constrained the query) but flagged for verification.
      let distMi = null;
      if (plat && plon) {
        distMi = haversineMiles(lat, lon, plat, plon);
        if (distMi > radius) continue; // hard-drop anything outside the ring
      }

      const owner = pick(p, "ownerName", "owner_name", "owner");
      const reasons = [];
      let score = 50;
      let disqualified = false; // physically-too-small = cannot build (FREE filter)
      let floodExcluded = false; // FEMA A/AE/V — excluded unless no alternatives exist
      // Known-residential from Realie data = HARD disqualify now (free). Blank
      // zoning is NOT auto-passed — it is deferred to a Zoneomics resolution that
      // runs ONLY on parcels that survive the free filters below.
      const realieResidential = isResidential(useCode, zoning, landUse);
      const zoningKnown = !!`${zoning || ""} ${landUse || ""}`.trim();
      let needsZoningResolve = false; // true → blank Realie zoning, resolve via Zoneomics before passing

      // 0. Data completeness — a parcel we know nothing about can't be a confident pick.
      if (!owner && !acreage && !useCode) {
        score -= 25;
        reasons.push("Sparse parcel data — low confidence");
      }

      // 1. No residential — HARD disqualifier per client criteria, but ONLY on
      //    KNOWN zoning. Blank zoning is flagged for resolution, never auto-passed.
      if (realieResidential) {
        score -= 45;
        disqualified = true;
        reasons.push("Residential use — disqualified by client criteria");
      } else if (zoningKnown) {
        score += 10;
        reasons.push("Non-residential use");
      } else {
        needsZoningResolve = true;
        reasons.push("Zoning blank from Realie — pending Zoneomics resolution");
      }

      // 2. Zoning classification.
      const zs = zoningScore(zoning, landUse);
      score += zs.pts;
      reasons.push(zs.reason);

      // 3. Lot size vs required footprint (setbacks + fall zone + separation + compound).
      if (acreage > 0) {
        if (acreage >= needAcres * 2) { score += 25; reasons.push(`Large lot (${acreage.toFixed(2)} ac) — easily fits setbacks, fall zone & separation`); }
        else if (acreage >= needAcres) { score += 15; reasons.push(`Lot (${acreage.toFixed(2)} ac) meets required footprint (~${needAcres.toFixed(2)} ac)`); }
        else if (acreage >= minBuildableAcres) { score -= 20; reasons.push(`Lot (${acreage.toFixed(2)} ac) tight vs required ${needAcres.toFixed(2)} ac — verify setbacks/fall zone`); }
        else if (reliefLabel && acreage >= reliefMinBuildableAcres) {
          // Too small for the FULL fall zone, but Section 2 grants PE-letter / CUP
          // relief and it fits the REDUCED fall-zone footprint — keep it buildable.
          score -= 20;
          reasons.push(`Fits with ${reliefLabel} (reduced fall zone ${Math.round(reliefFall)} ft vs ${Math.round(baseFall)} ft full)`);
        }
        else {
          // Too small to physically host the compound + fall zone — cannot build.
          score -= 50;
          disqualified = true;
          reasons.push(`Lot (${acreage.toFixed(2)} ac) too small to build — needs ≥ ${minBuildableAcres.toFixed(2)} ac (target ${needAcres.toFixed(2)} ac)`);
        }
      } else {
        reasons.push("Lot size unknown — verify it fits setbacks/fall zone");
      }

      // 4. Owner type (commercial / industrial / institutional preferred).
      const os = ownerTypeScore(owner);
      score += os.pts;
      reasons.push(os.reason);

      scored.push({
        raw: p,
        buildable: !disqualified,
        needs_zoning_resolve: needsZoningResolve,
        flood_excluded: floodExcluded, // set later once FEMA resolves
        dist_mi: distMi,
        score: Math.max(0, Math.min(100, Math.round(score))),
        score_reasons: reasons,
        owner_name: owner,
        parcel_address: pick(p, "addressRaw", "address", "fullAddress", "site_address"),
        apn: pick(p, "apn", "parcelId", "parcel_id", "parcel_number"),
        acreage: acreage || null,
        boundaries: frontage && depth ? `${frontage} ft frontage × ${depth} ft depth` : (pick(p, "legalDesc", "legalDescription", "legal_description") || null),
        zoning_classification: zoning || null,
        land_use: landUse || null,
        mailing_address: [
          pick(p, "mailerAddress", "ownerAddressLine1"),
          pick(p, "mailingCity", "ownerCity"),
          pick(p, "mailingState", "ownerState"),
          pick(p, "mailingZip5", "ownerZipCode"),
        ].filter(Boolean).join(", ") || null,
        latitude: plat || null,
        longitude: plon || null,
      });
    }

    // HONEST EMPTY-RING DISCIPLINE — if nothing is buildable (all residential /
    // too small), do NOT pad with ineligible parcels. Return the no-data halt.
    const buildableSet = scored.filter((s) => s.buildable);
    if (buildableSet.length === 0) {
      return Response.json({
        count_scanned: seen.size,
        count_in_ring: scored.length,
        count_buildable: 0,
        required_footprint_ft: footprintFt,
        required_acres: Number(needAcres.toFixed(3)),
        min_buildable_acres: Number(minBuildableAcres.toFixed(3)),
        targets: [],
        no_buildable: true,
        message: "No buildable parcel in ring — all parcels are residential, too small for the compound + fall zone, or otherwise ineligible. Adjust the SARF ring or enter a target manually.",
      });
    }

    // FEMA is now an ELIGIBILITY factor, not post-rank decoration. Fetch flood
    // zone for every buildable parcel (capped at 25 to stay fast) so A/AE/V can
    // be excluded BEFORE ranking. Flag a flood parcel rather than drop it only
    // when there is no dry alternative.
    const floodCandidates = buildableSet.slice(0, 25);
    const femaForBuildable = await Promise.all(
      floodCandidates.map((s) => (s.latitude && s.longitude ? femaRisk(s.latitude, s.longitude) : Promise.resolve({ code: "—", level: "unknown" })))
    );
    floodCandidates.forEach((s, i) => {
      s._fema = femaForBuildable[i];
      if (isHighRiskFlood(femaForBuildable[i].code)) {
        s.flood_excluded = true;
        s.score = Math.max(0, s.score - 35);
        s.score_reasons.push(`FEMA ${femaForBuildable[i].code} high-risk flood zone — excluded unless no dry alternative`);
      } else if (femaForBuildable[i].code !== "—") {
        s.score_reasons.push(`FEMA ${femaForBuildable[i].code} (${femaForBuildable[i].level}) flood zone`);
      }
    });

    // RANK FIRST on cheap data (Realie + FEMA only) — dry buildable first, then
    // confirmed acreage fit, then score, then distance to center. This lets us
    // resolve zoning via the PAID Zoneomics API on ONLY the top few ranked
    // parcels, never all survivors (the 48-call cost/runtime blowup).
    const confirmedFits = (s) => Number(s.acreage) >= needAcres ? 1 : 0;
    const rankCmp = (a, b) => {
      if (!!a.flood_excluded !== !!b.flood_excluded) return a.flood_excluded ? 1 : -1;
      const ca = confirmedFits(a), cb = confirmedFits(b);
      if (ca !== cb) return cb - ca;
      if (b.score !== a.score) return b.score - a.score;
      const da = a.latitude ? haversineMiles(lat, lon, a.latitude, a.longitude) : 99;
      const db = b.latitude ? haversineMiles(lat, lon, b.latitude, b.longitude) : 99;
      return da - db;
    };
    buildableSet.sort(rankCmp);

    // ZONING RESOLUTION — cost-controlled. Resolve via Zoneomics on ONLY the top
    // 5 ranked candidates that have blank Realie zoning. Three outcomes per the
    // approved policy:
    //   • residential  → EXCLUDE (disqualified by client criteria)
    //   • non-resident. → PASS, zoning_status = "confirmed"
    //   • null/nothing  → PASS (known-residential filter already removed homes),
    //                     but TAG zoning_status = "unverified" so the user knows
    //                     to confirm before pursuing. Never presented as confirmed.
    // Parcels whose zoning is already KNOWN from Realie are "confirmed" as-is.
    buildableSet.forEach((s) => { if (!s.needs_zoning_resolve) s.zoning_status = "confirmed"; });

    const zoneKey = Deno.env.get("ZONEOMICS_API_KEY");
    const toResolve = buildableSet.filter((s) => s.needs_zoning_resolve && s.latitude && s.longitude).slice(0, 5);
    if (toResolve.length) {
      const resolved = await Promise.all(
        toResolve.map((s) => zoneomicsZone(s.latitude, s.longitude, zoneKey))
      );
      toResolve.forEach((s, i) => {
        const zc = resolved[i];
        if (!zc) {
          // Zoneomics returned nothing → PASS but flag unverified (non-residential
          // assumption; actual homes were already removed by the free filter).
          s.zoning_status = "unverified";
          s.score_reasons.push("Zoning unverified (Realie + Zoneomics blank) — passed on non-residential assumption; confirm before pursuing");
          return;
        }
        s.zoning_classification = zc;
        if (isResidential(null, zc, null)) {
          s.buildable = false;
          s.score = Math.max(0, s.score - 45);
          s.score_reasons.push(`Zoneomics resolved zoning "${zc}" — residential, disqualified by client criteria`);
        } else {
          const zs2 = zoningScore(zc, null);
          s.score = Math.max(0, Math.min(100, s.score + 10 + zs2.pts));
          s.zoning_status = "confirmed";
          s.score_reasons.push(`Zoneomics confirmed zoning "${zc}" — non-residential (${zs2.reason})`);
        }
      });
    }
    // Any blank-zoning parcel beyond the top-5 resolution window passes on the
    // non-residential assumption too, flagged unverified (no paid call spent).
    buildableSet.forEach((s) => { if (s.needs_zoning_resolve && !s.zoning_status) s.zoning_status = "unverified"; });

    // Re-rank: a top-5 parcel flipped residential by Zoneomics is now ineligible
    // and its score dropped, so re-sort to float the true best to the top.
    const eligibleSet = buildableSet.filter((s) => s.buildable);
    eligibleSet.sort(rankCmp);
    if (eligibleSet.length === 0) {
      return Response.json({
        count_scanned: seen.size,
        count_in_ring: scored.length,
        count_buildable: 0,
        required_footprint_ft: footprintFt,
        required_acres: Number(needAcres.toFixed(3)),
        min_buildable_acres: Number(minBuildableAcres.toFixed(3)),
        targets: [],
        no_buildable: true,
        message: "No buildable parcel in ring — all parcels are residential (confirmed via zoning), too small for the compound + fall zone, or otherwise ineligible. Adjust the SARF ring or enter a target manually.",
      });
    }

    const labels = ["Target A", "Target B", "Target C"];
    const top = eligibleSet.slice(0, 3);

    // ENRICH the final 3 — Realie's location endpoint is geometry-only for many
    // parcels (no owner/acreage/address), so fill the blank SCIP fields from
    // Zoneomics' parcels block. Only 3 paid calls (the displayed targets).
    const enrichments = await Promise.all(
      top.map((t) => (t.latitude && t.longitude ? zoneomicsEnrich(t.latitude, t.longitude, zoneKey) : Promise.resolve(null)))
    );
    top.forEach((t, i) => {
      const e = enrichments[i];
      if (!e) return;
      if (!t.owner_name && e.owner_name) t.owner_name = e.owner_name;
      if ((!t.parcel_address || t.parcel_address === "UNKNOWN") && e.parcel_address) t.parcel_address = e.parcel_address;
      if (!t.acreage && e.acreage) t.acreage = e.acreage;
      if (!t.land_use && e.land_use) t.land_use = e.land_use;
      if (!t.mailing_address && e.owner_mailing) t.mailing_address = e.owner_mailing;
      if (!t.zoning_classification && e.zone_code) { t.zoning_classification = e.zone_code; t.zoning_status = "confirmed"; }
    });

    // Zoning is already canonical on each target — known from Realie or resolved
    // via Zoneomics in the cost-controlled fallback above. No extra calls here.
    const targets = top.map((t, i) => {
      const fema = t._fema || { code: "—", level: "unknown" };
      const { raw, dist_mi, _fema, needs_zoning_resolve, ...clean } = t;
      const zone = clean.zoning_classification || null;
      const zStatus = t.zoning_status || (zone ? "confirmed" : "unverified");
      return {
        label: labels[i],
        ...clean,
        zoning_classification: zone || null,
        zoning_status: zStatus,
        zoning_unverified: zStatus === "unverified",
        zoning_note: zStatus === "unverified" ? "Zoning unverified — confirm before pursuing" : null,
        cup_review_required: true,
        pe_letter_review_required: true,
        permitting_note: "Assume CUP/special exception is required unless Section 2 confirms by-right approval; always check whether a PE sealed letter/self-certification can reduce setbacks, fall-zone, or review burden.",
        distance_from_center_mi: dist_mi != null ? Number(dist_mi.toFixed(3)) : null,
        fema_risk_factor: fema.code === "—" ? "—" : `${fema.code} (${fema.level})`,
      };
    });

    const buildableCount = eligibleSet.length;
    const dryCount = eligibleSet.filter((s) => !s.flood_excluded).length;

    return Response.json({
      count_scanned: seen.size,
      count_in_ring: scored.length,
      count_buildable: buildableCount,
      count_dry_buildable: dryCount,
      required_footprint_ft: footprintFt,
      required_acres: Number(needAcres.toFixed(3)),
      min_buildable_acres: Number(minBuildableAcres.toFixed(3)),
      // Honest count discipline — if fewer than 3 qualified, the caller gets only
      // what qualified (B/C may be absent). Never padded with ineligible parcels.
      returned_count: targets.length,
      flood_only: dryCount === 0,
      targets,
    });
  } catch (error) {
    console.error("scipBestParcels error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});