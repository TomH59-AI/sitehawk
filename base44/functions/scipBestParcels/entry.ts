import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { esriZoning } from '../../shared/esriZoning.ts';

// scipBestParcels — Step 3 of the SCIP.
// Searches ALL parcels in the SARF ring via Realie Location Search, scores each one against
// tower-siting criteria, and returns the THREE best as Target A / B / C.
//
// DESIGN PRINCIPLE: The engine searches HARD for 3 qualifying targets.
// Parcels are almost never truly disqualified — they are down-scored.
// Only explicit residential zoning is a hard disqualifier. Everything else
// is scored and ranked, then the top 3 are returned even if small/tight,
// with warnings. The user decides, not the algorithm.
//
// Payload: { lat, lon, radius_miles=1.0, tower_height_ft=199, compound_side_ft=100,
//            setback_ft=0, fall_zone_ft=0, separation_ft=0 }
// Returns: { count_scanned, targets: [ {label, ...parcel fields..., score, score_reasons} x3 ] }

const REALIE_URL = "https://app.realie.ai/api/public/property/location/";
// ReportAll USA — primary ring parcel source. BILLED PER PARCEL RETURNED, so a
// hard cap (max_parcels) bounds the worst-case cost of any single target scan.
const REPORTALL_URL = "https://reportallusa.com/api/parcels";
const REPORTALL_VERSION = "9";
// Default per-ring parcel cap for target selection — keeps the bill predictable.
// Overridable via the request body (`max_parcels`), hard ceiling 250.
const DEFAULT_MAX_PARCELS = 100;
const FEMA_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

// WKT circle approximating the SARF ring, for ReportAll's spatial_intersect.
function circleWkt(lat, lon, radiusMiles, steps = 24) {
  const R = 3958.8;
  const d = radiusMiles / R;
  const latR = (lat * Math.PI) / 180;
  const lonR = (lon * Math.PI) / 180;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(brng));
    const lon2 = lonR + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(latR), Math.cos(d) - Math.sin(latR) * Math.sin(lat2));
    pts.push(`${((lon2 * 180) / Math.PI).toFixed(6)} ${((lat2 * 180) / Math.PI).toFixed(6)}`);
  }
  return `POLYGON((${pts.join(",")}))`;
}

// Blank zoning is NOT auto-disqualified — it goes through Realie-record/ESRI GIS resolution.
// Residential tokens — only CLEAR residential matches; ambiguous codes are NOT residential.
// Shorter list avoids false-positives on "R" in irrelevant strings.
const RESIDENTIAL_TOKENS = [
  "residential", "single family", "single-family", "duplex", "triplex", "quadruplex",
  "apartment", "condo", "townhouse", "mobile home", "dwelling", "sfr", "multi-family",
  "multifamily",
];
// Residential zoning codes — must match the whole code or a clearly bounded substring.
const RESIDENTIAL_ZONE_CODES = [/^R-?\d+[A-Z]?$/i, /^RS-?\d*/i, /^RM-?\d*/i, /^RR-?\d*/i, /^RSF\d*/i, /^RMF\d*/i];

// Zoning families that are favorable for a tower, with a base bonus.
function zoningScore(zoning, landUse) {
  const z = `${zoning || ""} ${landUse || ""}`.toLowerCase();
  if (!z.trim()) return { pts: 5, reason: "Zoning unknown — requires verification but retained for search" };
  if (/(industrial|i-1|i-2|im|light industrial|heavy industrial|manufactur)/.test(z))
    return { pts: 30, reason: "Industrial zoning — strongly favorable" };
  if (/(agricultur|\ba-1\b|\ba-2\b|\bag\b|rural|farm|ranch|timberland|forest)/.test(z))
    return { pts: 26, reason: "Agricultural / rural zoning — favorable" };
  if (/(commercial|\bc-1\b|\bc-2\b|\bc-3\b|business|\bcg\b|\bcc\b|retail|office|general business)/.test(z))
    return { pts: 22, reason: "Commercial zoning — favorable" };
  if (/(utility|public|institution|government|vacant|conservation open|open space|recreation|park|church|school|hospital)/.test(z))
    return { pts: 18, reason: "Utility / public / institutional land — workable" };
  if (/(warehouse|storage|distribution|logistics|flex)/.test(z))
    return { pts: 24, reason: "Warehouse / logistics land — favorable" };
  // Unknown / mixed / other non-residential — always retained for CUP/special exception review.
  return { pts: 12, reason: "Non-residential or mixed zoning — retained for CUP / special-exception review" };
}

// Only confirmed residential from Realie data is hard-disqualified.
// Blank zoning is NOT auto-disqualified — it goes through Zoneomics resolution.
function isResidential(useCode, zoning, landUse) {
  const code = String(useCode || "");
  // Realie useCode 1000-1199 block = residential / residential income
  if (/^1[01]\d\d$/.test(code) || code === "1999") return true;
  const s = `${zoning || ""} ${landUse || ""}`.toLowerCase().trim();
  if (!s) return false; // blank → not residential (resolved separately)
  // Check exact residential tokens
  if (RESIDENTIAL_TOKENS.some((t) => s.includes(t))) return true;
  // Check residential zone code patterns against the raw zoning code only
  const z = (zoning || "").trim();
  if (z && RESIDENTIAL_ZONE_CODES.some((re) => re.test(z))) return true;
  return false;
}

// FEMA high-risk Special Flood Hazard Areas
function isHighRiskFlood(code) {
  const z = String(code || "").trim().toUpperCase();
  return /^(A|AE|AH|AO|AR|A99|V|VE)$/.test(z);
}

// Owner-type posture
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

// Minimum parcel diameter (ft) to physically accommodate a tower.
// This is NOT a square footprint formula — it's the minimum bounding dimension:
// the fall zone radius must clear the parcel boundary from the tower center.
// Tower can be placed at the pole of inaccessibility (maximum inset point),
// so we estimate the minimum clearance needed as: fall_zone_radius.
// A parcel CAN work if its widest inscribed circle >= fall_zone_radius.
// We convert acreage to an estimated inscribed circle radius using sqrt(A/π).
function estimatedInscriedCircleRadius(acreage) {
  // Approximate inscribed circle radius for a parcel of given acreage (sq ft).
  // Assumes a roughly square/square-ish shape; elongated parcels will be tighter.
  const sqFt = acreage * 43560;
  return Math.sqrt(sqFt / Math.PI); // circle with area = parcel area
}

// How much clearance the siting solver actually needs (conservative):
// the fall zone must be contained in the parcel, so the max inset (pole of
// inaccessibility) must be >= fall zone radius.
function minimumRequiredInscriedRadius(tower_height_ft, fall_zone_ft, compound_side_ft) {
  const fallR = fall_zone_ft > 0 ? fall_zone_ft : tower_height_ft;
  // The compound must fit inside the envelope (which is inset by setback/fall zone).
  // Minimum: inscribed radius must exceed the fall zone radius.
  // Add half the compound diagonal as the compound must also fit.
  const compoundDiag = Math.sqrt(2) * compound_side_ft / 2;
  return Math.max(fallR, fallR + compoundDiag * 0.5);
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

// Realie FULL property record by parcel ID — the ring location-search returns
// slim records; the parcelId endpoint carries the legal zoningCode + the
// controlling jurisdiction. useCode/useDescription is land use, NOT zoning.
async function realieRecordZoning(apn, county, state, apiKey) {
  if (!apiKey || !apn || !county || !state) return null;
  try {
    const url = `https://app.realie.ai/api/public/property/parcelId/?${new URLSearchParams({ state, county, parcelId: String(apn) })}`;
    const r = await fetch(url, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const d = await r.json();
    const p = d.property || (Array.isArray(d.properties) ? d.properties[0] : null);
    if (!p) return null;
    const cln = (v) => { const s = String(v ?? "").trim(); return s && !/^(na|n\/a|unknown|none|null)$/i.test(s) ? s : null; };
    return {
      zoning: cln(p.zoningCode || p.zoning),
      jurisdiction: cln(p.jurisdiction),
      land_use: cln(p.useDescription || p.landUse || p.useCode),
    };
  } catch { return null; }
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
      signal: AbortSignal.timeout(8000),
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
      // PE-sealed-letter fall-zone/setback relief provision found in the ordinance
      // (Section 2 tower_specifics.pe_letter). "YES — ..." means the ordinance
      // lets a PE seal reduce the fall zone/setback, which helps us fit tighter parcels.
      pe_letter = null,
      fall_zone = null, setback = null,
      // Section 2 ordinance HARD limits — a parcel must satisfy these to
      // qualify as Target A/B/C. Null = unknown (not enforced, only warned).
      max_tower_height = null, residential_separation = null,
      max_parcels = DEFAULT_MAX_PARCELS,
      // BOTH parcel sources run by default so the ring is fully populated:
      // Realie (strong in metros) + ReportAll USA (broad national coverage).
      // Pass include_realie:false explicitly only to skip Realie for cost.
      include_realie = true,
    } = body;
    if (lat == null || lon == null) return Response.json({ error: "lat and lon required" }, { status: 400 });

    const apiKey = include_realie ? Deno.env.get("REALIE_API_KEY") : null;
    const reportAllKey = Deno.env.get("REPORT_API_TOKEN");
    // Bill guard — cap parcels pulled from ReportAll for this scan (1 credit each).
    const cap = Math.max(1, Math.min(Number(max_parcels) || DEFAULT_MAX_PARCELS, 250));

    const radius = Math.min(radius_miles, 2.0);
    const tStart = Date.now();

    const fieldCount = (p) => Object.values(p).filter((v) => v !== null && v !== undefined && v !== "").length;
    const seen = new Map();

    // ── PARALLEL SOURCE FETCH ────────────────────────────────────────────────
    // Realie (2 query variants) + ReportAll all fire AT THE SAME TIME instead of
    // serially — the single biggest latency win for the target scan. Each fetch
    // carries a hard timeout so one slow provider can never hang the whole run.
    const realieUrls = apiKey ? [
      `${REALIE_URL}?latitude=${lat}&longitude=${lon}&radius=${radius}&limit=150&residential=false`,
      `${REALIE_URL}?latitude=${lat}&longitude=${lon}&radius=${radius}&limit=150`,
    ] : [];
    const realiePromises = realieUrls.map((url) =>
      fetch(url, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(25000) })
        .then(async (r) => {
          if (!r.ok) { console.error("Realie fetch failed", r.status); return null; }
          return r.json();
        })
        .catch((e) => { console.error("Realie fetch error:", e.message); return null; })
    );

    let reportAllPromise = null;
    if (reportAllKey) {
      const params = new URLSearchParams({
        client: reportAllKey,
        v: REPORTALL_VERSION,
        rpp: String(cap),
        page: "1",
        return_geometry: "true",
        si_srid: "4326",
        spatial_intersect: circleWkt(lat, lon, radius),
      });
      // POST form-encoded — a ring's WKT polygon exceeds GET URL limits.
      reportAllPromise = fetch(REPORTALL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(30000),
      }).catch((e) => { console.error("ReportAll fetch error:", e.message); return null; });
    }

    // Merge Realie results first (dedupe keeps the richest record per parcel).
    const realieResults = await Promise.all(realiePromises);
    for (const data of realieResults) {
      if (!data) continue;
      const items = data.properties || data.results || (Array.isArray(data) ? data : []);
      for (const p of items) {
        const apn = pick(p, "apn", "parcelId", "parcel_id", "parcel_number");
        const key = apn || `${pick(p, "addressRaw", "address", "fullAddress")}|${pick(p, "latitude", "lat")}`;
        const prev = seen.get(key);
        if (!prev || fieldCount(p) > fieldCount(prev)) seen.set(key, p);
      }
    }
    if (apiKey) console.log(`Realie: ${seen.size} parcels`);

    // Merge ReportAll results (already in flight since the start of the scan).
    if (reportAllPromise) {
      try {
        const r = await reportAllPromise;
        if (r && r.ok) {
          const data = await r.json();
          const items = data.results || [];
          let raAdded = 0;
          for (const p of items) {
            const acres = p.acreage != null ? Number(p.acreage) : (p.calc_acreage != null ? Number(p.calc_acreage) : null);
            const addr = p.situs || [p.addr_number, p.addr_street_name, p.situs_city].filter(Boolean).join(" ") || null;
            const normalized = {
              apn: p.parcel_id || p.robust_id || null,
              ownerName: p.owner || null,
              address: addr,
              addressRaw: addr,
              fullAddress: addr,
              parcelCity: p.situs_city || null,
              acres,
              zoningCode: p.zoning || p.land_use_class || p.land_use_code || null,
              landUse: p.land_use_class || p.land_use_code || null,
              useDescription: p.land_use_class || null,
              latitude: p.latitude != null ? Number(p.latitude) : null,
              longitude: p.longitude != null ? Number(p.longitude) : null,
              mailerAddress: [p.mail_address1, p.mail_address2, p.mail_address3].filter(Boolean).join(", ") || null,
              mailingCity: null,
              mailingState: null,
              mailingZip5: null,
              county: p.county_name || null,
              state: p.state_abbr || null,
              _source: "reportall",
            };
            const key = normalized.apn || `${normalized.addressRaw}|${normalized.latitude}`;
            const prev = seen.get(key);
            if (!prev || fieldCount(normalized) > fieldCount(prev)) {
              seen.set(key, normalized);
              raAdded++;
            }
          }
          console.log(`ReportAll: ${items.length} parcels (cap ${cap}, available ${data.count ?? "?"}), ${raAdded} new/richer, quota_used=${r.headers.get("x-reportall-api-parcels-request-quota-used")}`);
        } else if (r) {
          console.error("ReportAll fetch failed", r.status, (await r.text()).slice(0, 200));
        }
      } catch (e) { console.error("ReportAll fetch error:", e.message); }
    }

    console.log(`[TIMING] parcel sources: ${Date.now() - tStart}ms`);
    console.log(`Combined: ${seen.size} unique parcels in ring`);

    // ── FALL ZONE: full vs. relief ──────────────────────────────────────────
    const ordFallFt = parseFeet(fall_zone, tower_height_ft);
    const baseFall = fall_zone_ft > 0 ? fall_zone_ft : (ordFallFt > 0 ? ordFallFt : tower_height_ft);
    // PE relief is available if the jurisdiction accepts PE self-certification OR
    // the ordinance has a PE-sealed-letter fall-zone/setback reduction provision
    // (pe_letter value starts with "YES").
    const peLetterYes = typeof pe_letter === "string" && /^\s*yes\b/i.test(pe_letter);
    const peOk = indicatesYes(pe_self_certification) || peLetterYes;
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

    // ── ORDINANCE HARD LIMITS (from Section 2 zoning) ───────────────────────
    // A parcel that violates these does NOT qualify as a top-3 target — it is
    // marked non-compliant and always ranks below every compliant parcel.
    const maxHeightFt = parseFeet(max_tower_height, tower_height_ft);
    const heightCapViolated = maxHeightFt > 0 && tower_height_ft > maxHeightFt;
    const resSepFt = parseFeet(residential_separation, tower_height_ft);

    // Minimum inscribed circle radius the parcel must have to host the tower.
    // This is the correct geometric test: can the solver find a point inside
    // the setback-inset envelope that also keeps the fall zone inside the parcel?
    const minInscriedR = minimumRequiredInscriedRadius(tower_height_ft, baseFall, compound_side_ft);
    const minInscriedRRelief = minimumRequiredInscriedRadius(tower_height_ft, reliefFall, compound_side_ft);
    // Min acreage that has ANY chance of working (very approximate lower bound).
    // A circle of radius minInscriedR has area π*r² sq ft.
    const absoluteMinAcres = (Math.PI * Math.pow(Math.max(baseFall, compound_side_ft / 2), 2)) / 43560;

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

      // RING GUARD — hard-drop anything outside the ring.
      let distMi = null;
      if (plat && plon) {
        distMi = haversineMiles(lat, lon, plat, plon);
        if (distMi > radius) continue;
      }

      const owner = pick(p, "ownerName", "owner_name", "owner");
      const reasons = [];
      let score = 50;
      // HARD disqualifier — only explicit confirmed residential. Everything else stays.
      let hardDisqualified = false;

      const realieResidential = isResidential(useCode, zoning, landUse);
      const zoningKnown = !!`${zoning || ""} ${landUse || ""}`.trim();
      let needsZoningResolve = false;

      // 0. Data completeness
      if (!owner && !acreage && !useCode) {
        score -= 15;
        reasons.push("Sparse parcel data — low confidence, verify before pursuing");
      }

      // 1. Residential check — ONLY confirmed residential from Realie is hard-disqualified.
      if (realieResidential) {
        hardDisqualified = true;
        score = 0;
        reasons.push("Confirmed residential zoning — hard disqualified");
      } else if (zoningKnown) {
        score += 10;
        reasons.push("Non-residential use confirmed from assessor data");
      } else {
        // Blank zoning from Realie — NOT disqualified; resolve via Realie record/ESRI below.
        needsZoningResolve = true;
        score -= 5; // slight penalty for uncertainty, not disqualification
        reasons.push("Zoning not in assessor data — pending property-record/GIS resolution; retained");
      }

      // 2. Zoning classification score (does not disqualify).
      if (!hardDisqualified) {
        const zs = zoningScore(zoning, landUse);
        score += zs.pts;
        reasons.push(zs.reason);
      }

      // 3. Lot size scoring — parcels that cannot contain the fall zone even
      //    WITH PE/CUP relief are flagged too_small and always rank BELOW any
      //    parcel that fits. They are never chosen as Target A while a fitting
      //    parcel exists in the ring.
      let tooSmall = false;
      if (acreage > 0 && !hardDisqualified) {
        const estR = estimatedInscriedCircleRadius(acreage);
        if (estR >= minInscriedR * 1.5) {
          score += 25;
          reasons.push(`Large lot (${acreage.toFixed(2)} ac) — comfortably fits fall zone & compound`);
        } else if (estR >= minInscriedR) {
          score += 15;
          reasons.push(`Lot (${acreage.toFixed(2)} ac) estimated to fit fall zone — solver will confirm`);
        } else if (reliefLabel && estR >= minInscriedRRelief) {
          score -= 10;
          reasons.push(`Lot (${acreage.toFixed(2)} ac) — tight without relief; feasible with ${reliefLabel} (reduced fall zone ${Math.round(reliefFall)} ft)`);
        } else if (acreage >= absoluteMinAcres * 0.5) {
          tooSmall = true;
          score -= 20;
          reasons.unshift(`⚠ DOES NOT FIT: lot (${acreage.toFixed(2)} ac) cannot contain the ${Math.round(reliefFall)} ft fall zone even with relief — do not pursue without engineering relief`);
        } else {
          tooSmall = true;
          score -= 35;
          reasons.unshift(`⚠ DOES NOT FIT: lot (${acreage.toFixed(2)} ac) far too small for the ${Math.round(reliefFall)} ft fall zone — do not pursue`);
        }
      } else if (!hardDisqualified) {
        reasons.push("Lot size unknown — solver will attempt placement; verify dimensions");
      }

      // 4. Owner type
      if (!hardDisqualified) {
        const os = ownerTypeScore(owner);
        score += os.pts;
        reasons.push(os.reason);
      }

      // 5. Tower separation bonus — parcels far from ring center may be closer to
      //    existing towers; slight distance-to-center penalty for far parcels.
      if (distMi != null && !hardDisqualified) {
        if (distMi <= radius * 0.3) { score += 5; reasons.push("Close to search ring center — good coverage position"); }
        else if (distMi > radius * 0.85) { score -= 5; reasons.push("Near ring edge — verify tower separation & coverage"); }
      }

      // ── ZONING COMPLIANCE GATE ──────────────────────────────────────────
      // Build the per-parcel compliance verdict against the Section 2 ordinance
      // limits. A parcel is NON-COMPLIANT (never a top-3 target while a
      // compliant one exists) if it busts the height cap or cannot physically
      // hold the fall zone even with PE/CUP relief (too_small).
      const complianceChecks = [];
      let nonCompliant = false;
      // Zoning classification — confirmed non-residential is the entry ticket.
      complianceChecks.push({
        criterion: "Zoning classification",
        pass: !hardDisqualified,
        detail: hardDisqualified ? "Residential — disqualified" : (zoningKnown ? "Non-residential" : "Pending verification"),
      });
      // Height restriction
      if (maxHeightFt > 0) {
        complianceChecks.push({
          criterion: "Height restriction",
          pass: !heightCapViolated,
          detail: heightCapViolated
            ? `Tower ${tower_height_ft} ft exceeds ${Math.round(maxHeightFt)} ft cap`
            : `Within ${Math.round(maxHeightFt)} ft cap`,
        });
        if (heightCapViolated) { nonCompliant = true; score = Math.max(0, score - 40); reasons.unshift(`⚠ HEIGHT CAP: tower ${tower_height_ft} ft exceeds the ${Math.round(maxHeightFt)} ft ordinance limit`); }
      }
      // Setback + fall zone containment (from the too_small geometry test above)
      complianceChecks.push({
        criterion: "Setbacks & fall zone",
        pass: !tooSmall,
        detail: tooSmall
          ? `Cannot contain the ${Math.round(reliefFall)} ft fall zone / setback`
          : `Fits the ${Math.round(reliefFall)} ft fall zone${reliefLabel ? ` (with ${reliefLabel})` : ""}`,
      });
      if (tooSmall) nonCompliant = true;

      scored.push({
        raw: p,
        too_small: tooSmall,
        non_compliant: nonCompliant,
        compliance: { pass: !nonCompliant && !hardDisqualified, checks: complianceChecks },
        hardDisqualified,
        needs_zoning_resolve: needsZoningResolve,
        flood_excluded: false, // set after FEMA
        dist_mi: distMi,
        score: Math.max(0, Math.min(100, Math.round(score))),
        score_reasons: reasons,
        owner_name: owner,
        parcel_address: pick(p, "addressRaw", "address", "fullAddress", "site_address"),
        parcel_city: pick(p, "parcelCity", "city", "addressCity", "siteCity", "situsCity", "propertyCity", "situs_city"),
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
        county: pick(p, "county", "countyName", "county_name", "situsCounty", "fipsCounty") || null,
        state: (pick(p, "state", "stateCode", "state_code", "situsState", "mailingState", "ownerState") || "").toString().toUpperCase().slice(0, 2) || null,
      });
    }

    // Separate hard-disqualified (residential) from candidates.
    const candidates = scored.filter((s) => !s.hardDisqualified);
    console.log(`${scored.length} total scored, ${candidates.length} non-residential candidates`);

    // FEMA flood zone — eligibility factor. Fetch for top 35 candidates to stay fast.
    // Flood parcels are down-scored but NOT excluded unless dry alternatives exist.
    const floodBatch = candidates.slice(0, 35);
    const tFema = Date.now();
    const femaResults = await Promise.all(
      floodBatch.map((s) => (s.latitude && s.longitude ? femaRisk(s.latitude, s.longitude) : Promise.resolve({ code: "—", level: "unknown" })))
    );
    console.log(`[TIMING] FEMA batch (${floodBatch.length} lookups): ${Date.now() - tFema}ms`);
    floodBatch.forEach((s, i) => {
      s._fema = femaResults[i];
      if (isHighRiskFlood(femaResults[i].code)) {
        // Informational only — flood is NOT a gate. A light score nudge keeps
        // dry parcels slightly ahead when scores are otherwise tied, but a
        // flood-zone parcel is never excluded or forced to the bottom.
        s.score = Math.max(0, s.score - 5);
        s.score_reasons.push(`FEMA ${femaResults[i].code} — high-risk flood zone (flagged for review; not excluded)`);
      } else if (femaResults[i].code !== "—") {
        s.score_reasons.push(`FEMA ${femaResults[i].code} (${femaResults[i].level})`);
      }
    });

    // RANKING — liberal posture: only the hard gates reorder; score breaks ties.
    const rankCmp = (a, b) => {
      // ── ONLY THREE HARD GATES ────────────────────────────────────────────
      // Per the acquisition posture: be liberal. The jurisdiction will have its
      // say, so we DON'T pre-judge on soft factors. A parcel only ranks below
      // another if it fails one of the two remaining hard gates that survive
      // ranking (residential is already removed upstream):
      //   1. Can't fit the setbacks / fall zone (too_small)
      //   2. Busts the ordinance height cap (non_compliant)
      // Flood, zoning tier, and unverified zoning NO LONGER exclude or reorder
      // past these — the human fights those out from here.
      if (!!a.too_small !== !!b.too_small) return a.too_small ? 1 : -1;
      if (!!a.non_compliant !== !!b.non_compliant) return a.non_compliant ? 1 : -1;
      // Everything past the hard gates is ranked by suitability score, then by
      // proximity to the ring center for coverage. No zoning-tier or flood gate.
      if (b.score !== a.score) return b.score - a.score;
      const da = a.latitude ? haversineMiles(lat, lon, a.latitude, a.longitude) : 99;
      const db = b.latitude ? haversineMiles(lat, lon, b.latitude, b.longitude) : 99;
      return da - db;
    };
    candidates.sort(rankCmp);

    // If we have fewer than 3 candidates total, log a warning but continue.
    if (candidates.length === 0) {
      return Response.json({
        count_scanned: seen.size,
        count_in_ring: scored.length,
        count_buildable: 0,
        targets: [],
        no_buildable: true,
        message: seen.size === 0
          ? "No parcel data was returned for this ring from Realie or ReportAll — parcel coverage may be unavailable for this location. Verify the coordinates or try a nearby point."
          : "No non-residential parcels found in ring. Widen the SARF radius or enter a target manually.",
        missing_reasons: [0, 1, 2].map((i) => ({
          slot: i,
          label: ["Target A", "Target B", "Target C"][i],
          reasons: seen.size === 0
            ? [
                "The parcel providers (Realie + ReportAll USA) returned zero parcels for this ring — this is a data-coverage gap, NOT a residential exclusion.",
                "Double-check the SARF center coordinates, or enter a target manually.",
              ]
            : [
                `All ${scored.length} parcel${scored.length !== 1 ? "s" : ""} scanned in the ring resolved as residential — towers are not permitted on residential-zoned land.`,
                Number(radius_miles) < 1 ? "Widen the SARF radius to 1 mile to pull in non-residential rural/industrial parcels." : "Widen the SARF radius or enter a target manually.",
              ],
        })),
      });
    }

    // ZONING RESOLUTION — resolve blank-zoning parcels via our own cascade:
    // Realie full property record (legal zoningCode) → ESRI USA Zoning GIS.
    // Resolve up to top 10 candidates (not just 5) to ensure we find 3 good targets.
    candidates.forEach((s) => { if (!s.needs_zoning_resolve) s.zoning_status = "confirmed"; });

    const esriKey = Deno.env.get("ESRI_API_KEY");
    const realieKey = Deno.env.get("REALIE_API_KEY");
    const toResolve = candidates.filter((s) => s.needs_zoning_resolve && s.latitude && s.longitude).slice(0, 10);
    if (toResolve.length) {
      console.log(`Resolving ${toResolve.length} blank-zoning parcels via Realie record + ESRI GIS`);
      const resolved = await Promise.all(
        toResolve.map(async (s) => {
          const rz = await realieRecordZoning(s.apn, s.county, s.state, realieKey);
          if (rz?.zoning) return rz.zoning;
          const ez = await esriZoning(s.latitude, s.longitude, esriKey).catch(() => null);
          return ez?.zoning || null;
        })
      );
      toResolve.forEach((s, i) => {
        const zc = resolved[i];
        if (!zc) {
          // Still no zoning — pass but flag unverified. NOT disqualified.
          s.zoning_status = "unverified";
          s.score_reasons.push("Zoning unverified (assessor + property record + GIS blank) — included on non-residential assumption; verify before pursuing");
          return;
        }
        s.zoning_classification = zc;
        if (isResidential(null, zc, null)) {
          // Confirmed residential via property record/GIS — NOW hard-disqualify.
          s.hardDisqualified = true;
          s.score = 0;
          s.score_reasons.push(`Property record/GIS confirmed zoning "${zc}" — residential, disqualified`);
        } else {
          const zs2 = zoningScore(zc, null);
          s.score = Math.max(0, Math.min(100, s.score + 15 + zs2.pts));
          s.zoning_status = "confirmed";
          s.score_reasons.push(`Zoning resolved: "${zc}" — non-residential (${zs2.reason})`);
        }
      });
    }
    // Remaining blank-zoning candidates beyond the resolution window — pass, flag unverified.
    candidates.forEach((s) => { if (s.needs_zoning_resolve && !s.zoning_status) s.zoning_status = "unverified"; });

    // Remove those newly confirmed as residential by GIS resolution; re-sort.
    const eligibleSet = candidates.filter((s) => !s.hardDisqualified);
    eligibleSet.sort(rankCmp);

    console.log(`${eligibleSet.length} eligible candidates after zoning resolution ([TIMING] ${Date.now() - tStart}ms elapsed)`);

    if (eligibleSet.length === 0) {
      return Response.json({
        count_scanned: seen.size,
        count_in_ring: scored.length,
        count_buildable: 0,
        targets: [],
        no_buildable: true,
        message: "All parcels in ring resolved as residential or no data. Widen the SARF radius or enter a target manually.",
        missing_reasons: [0, 1, 2].map((i) => ({
          slot: i,
          label: ["Target A", "Target B", "Target C"][i],
          reasons: [
            "Every parcel in the ring resolved as residential (or had no zoning data) after property-record/GIS verification — no tower-eligible land available.",
            Number(radius_miles) < 1 ? "Widen the SARF radius to 1 mile, or enter a target manually." : "Widen the SARF radius or enter a target manually.",
          ],
        })),
      });
    }

    // Take top 3 pipeline targets + next 2 as standalone ALTERNATES (Target D & E).
    const labels = ["Target A", "Target B", "Target C", "Target D", "Target E"];
    const top = eligibleSet.slice(0, 5);

    // ── REALIE FULL-RECORD ZONING BACKFILL ─────────────────────────────────
    // The ring search returns slim records; the Realie parcelId endpoint
    // carries the legal zoningCode + controlling jurisdiction. Try it first
    // for any final target still missing zoning, before the ESRI backstop.
    const missingAfterEnrich = top.filter((t) => !t.zoning_classification && t.apn && t.county && t.state);
    if (missingAfterEnrich.length && realieKey) {
      const rz = await Promise.all(
        missingAfterEnrich.map((t) => realieRecordZoning(t.apn, t.county, t.state, realieKey))
      );
      missingAfterEnrich.forEach((t, i) => {
        const z = rz[i];
        if (z?.zoning) {
          t.zoning_classification = z.zoning;
          t.zoning_status = "confirmed";
          t.score_reasons.push(`Zoning resolved via Realie property record: "${z.zoning}"${z.jurisdiction ? ` — jurisdiction ${z.jurisdiction}` : ""}`);
        } else if (z?.land_use && !t.land_use) {
          t.land_use = z.land_use;
        }
      });
    }

    // ── ZONING CLASSIFICATION BACKSTOP ─────────────────────────────────────
    // Every returned target MUST carry a zoning classification so the rules
    // are always known when picking sites. Anything still blank after
    // assessor + Zoneomics enrichment is resolved against the ESRI Living
    // Atlas "USA Zoning" layer; the true last resort surfaces the land use
    // clearly labeled as unverified — never an empty cell.
    const stillMissing = top.filter((t) => !t.zoning_classification && t.latitude && t.longitude);
    if (stillMissing.length && esriKey) {
      const esriResults = await Promise.all(
        stillMissing.map((t) => esriZoning(t.latitude, t.longitude, esriKey).catch(() => null))
      );
      stillMissing.forEach((t, i) => {
        const z = esriResults[i];
        if (z?.zoning) {
          t.zoning_classification = z.zoning;
          t.zoning_status = "confirmed";
          t.score_reasons.push(`Zoning resolved via ESRI USA Zoning layer: "${z.zoning}"`);
        } else if (z?.land_use && !t.land_use) {
          t.land_use = z.land_use;
        }
      });
    }
    top.forEach((t) => {
      if (!t.zoning_classification && t.land_use) {
        t.zoning_classification = `${t.land_use} (land use — zoning unverified)`;
      }
    });

    const allRanked = top.map((t, i) => {
      const fema = t._fema || { code: "—", level: "unknown" };
      const { raw, dist_mi, _fema, needs_zoning_resolve, hardDisqualified: _hd, ...clean } = t;
      const zone = clean.zoning_classification || null;
      const zStatus = t.zoning_status || (zone ? "confirmed" : "unverified");
      return {
        label: labels[i],
        ...clean,
        buildable_estimate: !t.too_small,
        zoning_compliant: !t.non_compliant && !t.hardDisqualified,
        compliance: t.compliance || { pass: !t.non_compliant, checks: [] },
        zoning_classification: zone || null,
        zoning_status: zStatus,
        zoning_unverified: zStatus === "unverified",
        zoning_note: zStatus === "unverified" ? "Zoning unverified — confirm before pursuing" : null,
        cup_review_required: true,
        pe_letter_review_required: true,
        permitting_note: "Assume CUP/special exception is required unless Section 2 confirms by-right approval; always verify whether a PE sealed letter/self-certification reduces setbacks, fall zone, or review burden.",
        distance_from_center_mi: dist_mi != null ? Number(dist_mi.toFixed(3)) : null,
        fema_risk_factor: fema.code === "—" ? "—" : `${fema.code} (${fema.level})`,
      };
    });

    // Split: A/B/C feed the pipeline; D/E are alternates only (never in pipeline).
    const targets = allRanked.slice(0, 3);
    const alternates = allRanked.slice(3, 5).map((t) => ({ ...t, is_alternate: true }));

    const compliantCount = eligibleSet.filter((s) => !s.non_compliant).length;

    // ── WHY A TARGET SLOT COULDN'T BE FILLED ─────────────────────────────────
    // When the ring yields fewer than 3 buildable/compliant parcels, explain the
    // specific reason(s) per empty slot so the user knows what to widen/relax.
    // Indexed by slot 0/1/2 (Target A/B/C); only slots WITHOUT a target get a reason.
    const missing_reasons = [];
    const LABELS = ["Target A", "Target B", "Target C"];
    // Count how the scanned parcels dropped out so the message is concrete.
    const residentialCount = scored.filter((s) => s.hardDisqualified).length;
    const tooSmallCount = scored.filter((s) => s.too_small && !s.hardDisqualified).length;
    const heightCapCount = scored.filter((s) => s.non_compliant && !s.too_small && !s.hardDisqualified).length;
    for (let i = targets.length; i < 3; i++) {
      const reasons = [];
      if (seen.size === 0) {
        reasons.push("No parcels were returned for this ring — parcel data may be unavailable for this county.");
      } else {
        if (residentialCount > 0) reasons.push(`${residentialCount} parcel${residentialCount !== 1 ? "s were" : " was"} residential-zoned (hard-excluded — towers not permitted).`);
        if (tooSmallCount > 0) reasons.push(`${tooSmallCount} non-residential parcel${tooSmallCount !== 1 ? "s were" : " was"} too small to contain the ${Math.round(reliefFall)} ft fall zone${reliefLabel ? ` even with ${reliefLabel} relief` : ""}.`);
        if (heightCapCount > 0 && maxHeightFt > 0) reasons.push(`${heightCapCount} parcel${heightCapCount !== 1 ? "s exceed" : " exceeds"} the ${Math.round(maxHeightFt)} ft ordinance height cap at ${tower_height_ft} ft.`);
        if (!reasons.length) reasons.push(`Only ${eligibleSet.length} qualifying parcel${eligibleSet.length !== 1 ? "s" : ""} found in the ring — not enough to fill this slot.`);
      }
      reasons.push(Number(radius_miles) < 1
        ? "Try widening the SARF radius to 1 mile, lowering tower height, or shrinking the compound."
        : "Try lowering tower height, shrinking the compound, or confirming a PE letter / CUP path to relax the fall zone.");
      missing_reasons.push({ slot: i, label: LABELS[i], reasons });
    }

    return Response.json({
      count_scanned: seen.size,
      count_in_ring: scored.length,
      count_buildable: eligibleSet.length,
      count_compliant: compliantCount,
      elapsed_ms: Date.now() - tStart,
      required_footprint_ft: Math.round(minInscriedR),
      required_acres: Number((Math.PI * minInscriedR * minInscriedR / 43560).toFixed(3)),
      min_buildable_acres: Number(absoluteMinAcres.toFixed(3)),
      returned_count: targets.length,
      fit_warning: targets[0] && targets[0].buildable_estimate === false
        ? "No parcel in this ring is estimated to fit the tower fall zone — Target A is shown for reference only. Widen the SARF radius or reduce tower height."
        : null,
      targets,
      alternates,
      missing_reasons,
    });
  } catch (error) {
    console.error("scipBestParcels error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});