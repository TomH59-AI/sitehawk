import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// scipBestParcels — Step 3 of the SCIP.
// Searches ALL parcels in the SARF ring via Realie Location Search, scores each one against
// tower-siting criteria, and returns the THREE best as Target A / B / C.
//
// Selection criteria (per client): the major factors are
//   - no residential land use,
//   - lot large enough for setbacks + fall zone + tower separation + compound,
//   - favorable zoning classification (industrial / agricultural / commercial preferred),
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
  return { pts: 10, reason: "Mixed / other zoning" };
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

    const footprintFt = requiredFootprintFt({ tower_height_ft, compound_side_ft, setback_ft, fall_zone_ft, separation_ft });
    const needAcres = requiredAcres(footprintFt);
    // Absolute minimum buildable lot: must at least fit the compound + a half fall zone.
    // Anything smaller can never host the tower, so it is disqualified outright.
    const minBuildableAcres = requiredAcres(compound_side_ft + (fall_zone_ft > 0 ? fall_zone_ft : tower_height_ft));

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

    // ── TEMP DIAGNOSTIC — rejection breakdown (Tyler positive-case probe) ──
    const diag = {
      total_in_ring: scored.length,
      residential_known: scored.filter((s) => s.score_reasons.some((r) => r.startsWith("Residential use"))).length,
      too_small: scored.filter((s) => s.score_reasons.some((r) => r.includes("too small to build"))).length,
      needs_zoning_resolve: scored.filter((s) => s.needs_zoning_resolve).length,
      buildable_before_fema_zoning: scored.filter((s) => s.buildable).length,
    };
    console.log("🔬 SCRUB DIAG (pre-FEMA/zoning) →", JSON.stringify(diag));
    // Log the 5 largest parcels so we can see if a good commercial lot is being
    // killed by the lot-size floor vs. zoning.
    const largest = [...scored].sort((a, b) => (b.acreage || 0) - (a.acreage || 0)).slice(0, 5)
      .map((s) => ({ apn: s.apn, ac: s.acreage, zoning: s.zoning_classification, land_use: s.land_use, buildable: s.buildable, why: s.score_reasons }));
    console.log("🔬 LARGEST 5 PARCELS →", JSON.stringify(largest, null, 2));

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

    // ZONING FALLBACK — cost-controlled. The free filters (residential-known,
    // too-small, FEMA) have already run. NOW resolve zoning via Zoneomics ONLY
    // for the survivors that have blank Realie zoning — never the whole ring.
    // A blank-zoning parcel can only become eligible once its zoning is KNOWN;
    // if Zoneomics resolves it residential it is excluded here, and if Zoneomics
    // returns nothing it stays ineligible (never passed on absent data).
    const zoneKey = Deno.env.get("ZONEOMICS_API_KEY");
    const toResolve = buildableSet.filter((s) => s.needs_zoning_resolve && s.latitude && s.longitude);
    console.log("🔬 TO-RESOLVE GATE →", JSON.stringify({
      zoneKey_present: !!zoneKey,
      buildable: buildableSet.length,
      flagged_resolve: buildableSet.filter((s) => s.needs_zoning_resolve).length,
      flagged_with_coords: toResolve.length,
    }));
    if (toResolve.length) {
      const resolved = await Promise.all(
        toResolve.map((s) => zoneomicsZone(s.latitude, s.longitude, zoneKey))
      );
      console.log("🔬 ZONEOMICS RESOLUTION →", JSON.stringify({
        attempted: toResolve.length,
        returned_code: resolved.filter(Boolean).length,
        returned_null: resolved.filter((z) => !z).length,
        sample: toResolve.slice(0, 8).map((s, i) => ({ apn: s.apn, lat: s.latitude, lon: s.longitude, zc: resolved[i] })),
      }, null, 2));
      toResolve.forEach((s, i) => {
        const zc = resolved[i];
        if (!zc) {
          // Zoning still unknown → cannot pass on absent data. Mark ineligible.
          s.buildable = false;
          s.zoning_unresolved = true;
          s.score_reasons.push("Zoning unresolved (Realie + Zoneomics both blank) — cannot pass on absent data");
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
          s.score_reasons.push(`Zoneomics resolved zoning "${zc}" — non-residential (${zs2.reason})`);
        }
      });
    }

    // Re-filter after zoning resolution — any survivor flipped ineligible by the
    // Zoneomics check (residential or unresolved) drops out before ranking.
    const eligibleSet = buildableSet.filter((s) => s.buildable);
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
        message: "No buildable parcel in ring — all parcels are residential (confirmed via zoning), too small for the compound + fall zone, or have unresolvable zoning. Adjust the SARF ring or enter a target manually.",
      });
    }

    // Rank: dry buildable first, then by confirmed acreage fit, then score, then
    // distance to center (closer = better RF). Flood-excluded buildable parcels
    // sink to the bottom but remain selectable when nothing dry qualifies.
    const confirmedFits = (s) => Number(s.acreage) >= needAcres ? 1 : 0;
    eligibleSet.sort((a, b) => {
      if (!!a.flood_excluded !== !!b.flood_excluded) return a.flood_excluded ? 1 : -1;
      const ca = confirmedFits(a), cb = confirmedFits(b);
      if (ca !== cb) return cb - ca;
      if (b.score !== a.score) return b.score - a.score;
      const da = a.latitude ? haversineMiles(lat, lon, a.latitude, a.longitude) : 99;
      const db = b.latitude ? haversineMiles(lat, lon, b.latitude, b.longitude) : 99;
      return da - db;
    });

    const labels = ["Target A", "Target B", "Target C"];
    const top = eligibleSet.slice(0, 3);

    // Zoning is already canonical on each target — known from Realie or resolved
    // via Zoneomics in the cost-controlled fallback above. No extra calls here.
    const targets = top.map((t, i) => {
      const fema = t._fema || { code: "—", level: "unknown" };
      const { raw, dist_mi, _fema, needs_zoning_resolve, zoning_unresolved, ...clean } = t;
      const zone = clean.zoning_classification || null;
      return {
        label: labels[i],
        ...clean,
        zoning_classification: zone || null,
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