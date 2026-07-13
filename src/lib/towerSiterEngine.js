/**
 * HawkPerch — SiteHawk Tower Siter placement engine
 * Per SiteHawk_TowerSiter_BuildSheet.md (2026-06-12)
 * Deps: @turf/turf ^6.5, polylabel (Mapbox)
 *
 * Geometry strategy:
 *  - Buffering & circles run on lon/lat via turf with {units:'feet'} — turf v6
 *    projects to a local azimuthal-equidistant plane internally, so the inset
 *    is true planar feet (never buffer with naive degree distances).
 *  - A local planar feet frame (equirectangular about the parcel centroid) is
 *    used for polylabel, drag math, compound construction, and Exhibit A.
 */
import * as turf from "@turf/turf";
import polylabel from "polylabel";

const FT_PER_DEG_LAT = 364000;

/* ---------------- local planar feet frame ---------------- */
export function makeFrame(originLonLat) {
  const [lon0, lat0] = originLonLat;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  return {
    origin: originLonLat,
    toFt: ([lon, lat]) => [
      (lon - lon0) * FT_PER_DEG_LAT * cosLat,
      (lat - lat0) * FT_PER_DEG_LAT,
    ],
    toLonLat: ([x, y]) => [
      lon0 + x / (FT_PER_DEG_LAT * cosLat),
      lat0 + y / FT_PER_DEG_LAT,
    ],
  };
}

const mapRing = (ring, fn) => ring.map(fn);
const mapPoly = (coords, fn) => coords.map((r) => mapRing(r, fn));

export function reprojectPolygon(feature, fn) {
  const g = feature.geometry ?? feature;
  if (g.type === "Polygon") return turf.polygon(mapPoly(g.coordinates, fn));
  if (g.type === "MultiPolygon")
    return turf.multiPolygon(g.coordinates.map((p) => mapPoly(p, fn)));
  throw new Error(`Unsupported geometry: ${g.type}`);
}
export const polygonToFrame = (poly, frame) => reprojectPolygon(poly, frame.toFt);
export const polygonFromFrame = (poly, frame) => reprojectPolygon(poly, frame.toLonLat);

/* ------- MultiPolygon → working Polygon (build sheet §3/§8) ------- */
export function selectWorkingPolygon(multiPolyGeoJSON, locationPoint) {
  const g = multiPolyGeoJSON.geometry ?? multiPolyGeoJSON;
  if (g.type === "Polygon") return { polygon: turf.feature(g), ambiguous: false, parts: 1 };
  const parts = g.coordinates.map((c) => turf.polygon(c));
  if (parts.length === 1) return { polygon: parts[0], ambiguous: false, parts: 1 };
  if (locationPoint) {
    const pt = turf.point(locationPoint);
    const hit = parts.find((p) => turf.booleanPointInPolygon(pt, p));
    if (hit) return { polygon: hit, ambiguous: false, parts: parts.length };
  }
  // ambiguous → caller shows dropdown; default to largest
  const largest = parts.reduce((a, b) => (turf.area(a) >= turf.area(b) ? a : b));
  return { polygon: largest, ambiguous: true, parts: parts.length, allParts: parts };
}

/* ---------------- setback resolution (§4c — single source of truth) ---------------- */
export function resolveSetback(rules, towerHeightFt, peToggle, engineeredFallRadiusFt) {
  const r = rules || {};
  const peOK = peToggle && r.pe_fall_zone_allowed === true;
  const engineered = engineeredFallRadiusFt ?? Math.ceil(0.4 * towerHeightFt); // default 40% of H
  let setback;
  if (peOK) setback = engineered;
  else if (r.setback_rule === "fixed" && r.setback_ft != null) setback = r.setback_ft;
  else if (r.setback_rule === "height_110") setback = Math.ceil(1.1 * towerHeightFt);
  else setback = towerHeightFt; // conservative 1:1 default (also Unverified mode)
  const fallRadius = peOK ? engineered : towerHeightFt;
  return { setback, fallRadius, peApplied: peOK, unverified: !r.setback_rule && !peOK };
}

/* ---------------- buildable envelope (§5.1) — parcel in lon/lat ---------------- */
export function buildableEnvelope(parcelLonLat, setbackFt) {
  if (setbackFt <= 0) return { envelope: parcelLonLat, collapsed: false, parts: [parcelLonLat] };
  let env = null;
  try {
    env = turf.buffer(parcelLonLat, -setbackFt, { units: "feet", steps: 16 });
  } catch (_) { env = null; }
  if (!env || !env.geometry || !env.geometry.coordinates.length || turf.area(env) < 0.1)
    return { envelope: null, collapsed: true, parts: [] };
  const parts =
    env.geometry.type === "MultiPolygon"
      ? env.geometry.coordinates.map((c) => turf.polygon(c))
      : [env];
  return { envelope: env, collapsed: false, parts };
}

/* ------- auto-site: pole of inaccessibility (§5.2) — runs in feet frame ------- */
export function autoSite(envelopeParts, frame) {
  let best = null;
  for (const part of envelopeParts) {
    const partFt = polygonToFrame(part, frame);
    const p = polylabel(partFt.geometry.coordinates, 1.0);
    if (!best || p.distance > best.distance)
      best = { pointFt: [p[0], p[1]], clearanceFt: p.distance, part };
  }
  if (best) best.pointLonLat = frame.toLonLat(best.pointFt);
  return best;
}

export function excludeBuildingFootprints(envelope, buildings, clearanceFt) {
  let remaining = envelope;
  const footprints = buildings?.features || [];
  for (const footprint of footprints) {
    if (!footprint?.geometry || !["Polygon", "MultiPolygon"].includes(footprint.geometry.type)) continue;
    const obstacle = clearanceFt > 0 ? turf.buffer(footprint, clearanceFt, { units: "feet", steps: 8 }) : footprint;
    if (!obstacle || !turf.booleanIntersects(remaining, obstacle)) continue;
    remaining = turf.difference(remaining, obstacle);
    if (!remaining?.geometry || turf.area(remaining) < 0.1) return { envelope: null, parts: [], collapsed: true };
  }
  const parts = remaining.geometry.type === "MultiPolygon"
    ? remaining.geometry.coordinates.map((coordinates) => turf.polygon(coordinates))
    : [remaining];
  return { envelope: remaining, parts, collapsed: false };
}

/* ---------------- compound rectangle around tower (feet frame) ---------------- */
export function compoundRect(towerFt, widthFt, depthFt, frame) {
  const [x, y] = towerFt;
  const w = widthFt / 2, d = depthFt / 2;
  const ft = turf.polygon([[[x - w, y - d], [x + w, y - d], [x + w, y + d], [x - w, y + d], [x - w, y - d]]]);
  return { ft, lonLat: polygonFromFrame(ft, frame) };
}

/* ---------------- compliance checks (§5.4) — run every recompute ---------------- */
export function runChecks({ parcelLonLat, envelope, towerLonLat, towerHeightFt, fallRadiusFt, compoundLonLat, rules, buildingFootprints, compoundRespectsSetback = true }) {
  const checks = {};
  const r = rules || {};
  checks.height = r.height_limit_ft == null
    ? { status: "skip", label: "Height limit: none on file" }
    : { status: towerHeightFt <= r.height_limit_ft ? "pass" : "fail",
        label: `Height ${towerHeightFt}′ vs cap ${r.height_limit_ft}′` };

  const towerPt = turf.point(towerLonLat);
  checks.setback = { status: envelope && turf.booleanPointInPolygon(towerPt, envelope) ? "pass" : "fail",
    label: "Tower inside setback envelope" };

  const fallCircle = turf.circle(towerLonLat, fallRadiusFt, { units: "feet", steps: 64 });
  checks.fallZone = { status: turf.booleanWithin(fallCircle, parcelLonLat) ? "pass" : "fail",
    label: `Fall zone (${Math.round(fallRadiusFt)}′) contained in parcel`, circle: fallCircle };

  if (compoundLonLat) {
    const inParcel = turf.booleanWithin(compoundLonLat, parcelLonLat);
    const vsLine = compoundRespectsSetback
      ? !!envelope && turf.booleanWithin(compoundLonLat, envelope)
      : true; // tower-to-line jurisdictions: compound only needs to fit parcel
    checks.compound = { status: inParcel && vsLine ? "pass" : "fail",
      label: "Compound fits parcel + setback" };
  }
  const structures = buildingFootprints?.features || [];
  const structureConflict = structures.some((building) =>
    turf.booleanPointInPolygon(towerPt, building) || (compoundLonLat && turf.booleanIntersects(compoundLonLat, building))
  );
  checks.structures = {
    status: structureConflict ? "fail" : "pass",
    label: structureConflict ? "Building overlap — move tower" : "Clear of mapped buildings",
  };
  checks.allPass = Object.values(checks).every((c) => c === true || c.status !== "fail");
  return checks;
}

/* ------- residential separation (§5.4, HawkVision+) — 1 call per CONFIRM, never per drag ------- */
export async function residentialSeparationCheck({ towerLonLat, separationFt, realieFetch }) {
  if (!separationFt) return { status: "skip", label: "No residential separation rule on file" };
  const radiusMi = separationFt / 5280;
  const hits = await realieFetch({
    endpoint: "location/search",
    params: { lat: towerLonLat[1], lon: towerLonLat[0], radius: radiusMi, residential: true, includeUnassignedAddress: false },
  }); // caller logs to api_call_ledger
  const offending = (hits?.properties || hits || []).filter(Boolean);
  return offending.length
    ? { status: "fail", label: `Residence within ${separationFt}′`, offendingAddress: offending[0].address ?? "(address on file)" }
    : { status: "pass", label: `No residences within ${separationFt}′` };
}

/* ---------------- Tier 2: metes-and-bounds reconstruction (§3 Tier 2) ---------------- */
export function bearingToAzimuthDeg(bearing) {
  // "N 89°51′ E" | "S 12°30'15\" W" | "N 45 E"
  const m = bearing.trim().toUpperCase()
    .match(/^([NS])\s*(\d+(?:\.\d+)?)(?:\D+?(\d+(?:\.\d+)?))?(?:\D+?(\d+(?:\.\d+)?))?\D*([EW])$/);
  if (!m) throw new Error(`Unparseable bearing: ${bearing}`);
  const [, ns, d, mi = 0, s = 0, ew] = m;
  const ang = (+d) + (+mi) / 60 + (+s) / 3600;
  if (ns === "N" && ew === "E") return ang;
  if (ns === "S" && ew === "E") return 180 - ang;
  if (ns === "S" && ew === "W") return 180 + ang;
  return 360 - ang; // N..W
}

export function polygonFromCalls(calls, closeToleranceFt = 2) {
  let x = 0, y = 0;
  const pts = [[0, 0]];
  for (const c of calls) {
    const az = (bearingToAzimuthDeg(c.bearing) * Math.PI) / 180;
    x += Math.sin(az) * c.distance_ft;
    y += Math.cos(az) * c.distance_ft;
    pts.push([x, y]);
  }
  const misclose = Math.hypot(x, y);
  if (misclose > closeToleranceFt) {
    // distribute closure error (compass rule) but WARN
    const n = pts.length - 1;
    pts.forEach((p, i) => { p[0] -= (x * i) / n; p[1] -= (y * i) / n; });
  }
  pts[pts.length - 1] = [...pts[0]];
  return { polygonFt: turf.polygon([pts]), miscloseFt: misclose, warned: misclose > closeToleranceFt };
}

/* ---------------- full recompute pipeline ----------------
 * parcelGeoJSON: Realie geometry (lon/lat Polygon|MultiPolygon)
 * towerOverrideLonLat: set during drag; null = auto-site
 */
export function recompute({ parcelGeoJSON, locationPoint, rules, towerHeightFt, peToggle, engineeredFallRadiusFt, compoundW = 75, compoundD = 75, towerOverrideLonLat = null, buildingFootprints = null, compoundRespectsSetback = true }) {
  const sel = selectWorkingPolygon(parcelGeoJSON, locationPoint);
  const parcel = sel.polygon; // lon/lat
  const centroid = turf.centroid(parcel).geometry.coordinates;
  const frame = makeFrame(centroid);

  const { setback, fallRadius, unverified, peApplied } =
    resolveSetback(rules, towerHeightFt, peToggle, engineeredFallRadiusFt);

  const base = buildableEnvelope(parcel, setback);
  if (base.collapsed)
    return { frame, parcel, collapsed: true, unverified, peApplied, setback, fallRadius,
      banner: "No compliant placement at this height - try a PE letter or shorter tower." };

  const buildingClearanceFt = Math.hypot(compoundW / 2, compoundD / 2);
  const available = excludeBuildingFootprints(base.envelope, buildingFootprints, buildingClearanceFt);
  if (available.collapsed)
    return { frame, parcel, collapsed: true, unverified, peApplied, setback, fallRadius,
      banner: "No placement remains clear of mapped buildings and required setbacks." };
  const { envelope, parts } = available;

  let towerLonLat, towerFt, clearanceFt = null;
  if (towerOverrideLonLat) {
    towerLonLat = towerOverrideLonLat;
    towerFt = frame.toFt(towerLonLat);
  } else {
    const sited = autoSite(parts, frame);
    towerLonLat = sited.pointLonLat;
    towerFt = sited.pointFt;
    clearanceFt = sited.clearanceFt;
  }

  const compound = compoundRect(towerFt, compoundW, compoundD, frame);
  const checks = runChecks({ parcelLonLat: parcel, envelope, towerLonLat, towerHeightFt,
    fallRadiusFt: fallRadius, compoundLonLat: compound.lonLat, rules, buildingFootprints, compoundRespectsSetback });

  return { frame, parcel, parcelFt: polygonToFrame(parcel, frame),
    envelope, envelopeFt: polygonFromFrameSafe(envelope, frame, polygonToFrame),
    envelopeParts: parts, towerLonLat, towerFt, clearanceFt,
    compound, setback, fallRadius, checks, unverified, peApplied,
    collapsed: false, ambiguousParcel: sel.ambiguous };
}
function polygonFromFrameSafe(poly, frame, fn) { try { return fn(poly, frame); } catch { return null; } }

/* -----------------------------------------------------------------------
 * calculateTowerBuildArea (§5.1 alt-entry, per TowerSiter_BuildSheet §4d)
 * Accepts a raw config object — mirrors the external API spec provided.
 * Internally delegates to the engine's resolveSetback + buildableEnvelope
 * so the geometry is consistent with the main recompute pipeline.
 *
 * @param {Object} parcelGeoJSON  - GeoJSON Polygon|Feature<Polygon> (lon/lat)
 * @param {Object} config
 *   @param {number}  config.towerHeight          - Tower height in feet
 *   @param {number}  config.standardSetback      - Zoning setback in feet
 *   @param {number}  config.fallZoneMultiplier   - e.g. 1.1 for 110% height
 *   @param {boolean} config.hasPELetter          - PE letter reduces fall zone
 *   @param {number}  [config.peFallZoneRadius]   - Engineered radius (ft) from PE letter
 * @returns {Object|null} GeoJSON Feature<Polygon|MultiPolygon> of buildable area, or null
 * ----------------------------------------------------------------------- */
export function calculateTowerBuildArea(parcelGeoJSON, config) {
  const {
    towerHeight,
    standardSetback,
    fallZoneMultiplier,
    hasPELetter,
    peFallZoneRadius,
  } = config;

  // 1. Determine active fall zone distance (feet)
  const activeFallZone = hasPELetter
    ? (peFallZoneRadius ?? 0)
    : towerHeight * fallZoneMultiplier;

  // 2. Total required buffer = the larger of the zoning setback or the fall zone
  const totalRequiredSetback = Math.max(standardSetback, activeFallZone);

  // 3. Delegate to the engine's buildableEnvelope (uses turf {units:'feet'})
  const { envelope, collapsed } = buildableEnvelope(parcelGeoJSON, totalRequiredSetback);

  if (collapsed || !envelope) return null;
  return envelope;
}