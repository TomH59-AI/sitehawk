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
      let disqualified = false; // residential or physically-too-small = cannot build

      // 0. Data completeness — a parcel we know nothing about can't be a confident pick.
      if (!owner && !acreage && !useCode) {
        score -= 25;
        reasons.push("Sparse parcel data — low confidence");
      }

      // 1. No residential — HARD disqualifier per client criteria.
      if (isResidential(useCode, zoning, landUse)) {
        score -= 45;
        disqualified = true;
        reasons.push("Residential use — disqualified by client criteria");
      } else {
        score += 10;
        reasons.push("Non-residential use");
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

      scored.push({
        raw: p,
        buildable: !disqualified,
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

    // Buildable parcels ALWAYS rank above disqualified ones (residential / too
    // small); then prefer parcels with CONFIRMED adequate acreage over those with
    // unknown size; then by score; then by distance to center (closer = better RF).
    const confirmedFits = (s) => Number(s.acreage) >= needAcres ? 1 : 0;
    scored.sort((a, b) => {
      if (a.buildable !== b.buildable) return a.buildable ? -1 : 1;
      const ca = confirmedFits(a), cb = confirmedFits(b);
      if (ca !== cb) return cb - ca;
      if (b.score !== a.score) return b.score - a.score;
      const da = a.latitude ? haversineMiles(lat, lon, a.latitude, a.longitude) : 99;
      const db = b.latitude ? haversineMiles(lat, lon, b.latitude, b.longitude) : 99;
      return da - db;
    });

    const labels = ["Target A", "Target B", "Target C"];
    const top = scored.slice(0, 3);
    const zoneKey = Deno.env.get("ZONEOMICS_API_KEY");

    // FEMA flood risk + Zoneomics zoning for the chosen 3 only (keeps it fast).
    const [femaResults, zoneResults] = await Promise.all([
      Promise.all(top.map((t) => (t.latitude && t.longitude ? femaRisk(t.latitude, t.longitude) : Promise.resolve({ code: "—", level: "unknown" })))),
      Promise.all(top.map((t) => (t.latitude && t.longitude ? zoneomicsZone(t.latitude, t.longitude, zoneKey) : Promise.resolve(null)))),
    ]);

    const targets = top.map((t, i) => {
      const fema = femaResults[i];
      const { raw, dist_mi, ...clean } = t;
      const zone = clean.zoning_classification || zoneResults[i];
      return {
        label: labels[i],
        ...clean,
        zoning_classification: zone || null,
        distance_from_center_mi: dist_mi != null ? Number(dist_mi.toFixed(3)) : null,
        fema_risk_factor: fema.code === "—" ? "—" : `${fema.code} (${fema.level})`,
      };
    });

    const buildableCount = scored.filter((s) => s.buildable).length;

    return Response.json({
      count_scanned: seen.size,
      count_in_ring: scored.length,
      count_buildable: buildableCount,
      required_footprint_ft: footprintFt,
      required_acres: Number(needAcres.toFixed(3)),
      min_buildable_acres: Number(minBuildableAcres.toFixed(3)),
      targets,
    });
  } catch (error) {
    console.error("scipBestParcels error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});