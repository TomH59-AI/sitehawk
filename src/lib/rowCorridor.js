/**
 * rowCorridor — parcel-gap ROW inference (no new API calls, no new keys).
 *
 * The gap between adjacent parcel boundaries IS the right-of-way corridor.
 * Using the Regrid ring parcels already fetched for the Parcel Map, we:
 *  1. Find Target A's parcel polygon.
 *  2. Sample points along its boundary (~every 25 ft).
 *  3. Measure the gap from each sample to the nearest neighboring parcel line.
 *  4. Gaps in the 15–150 ft band = road ROW frontage; estimated ROW width is
 *     the median gap along the frontage. Gaps < 8 ft = shared lot lines.
 *
 * This is an INFERENCE from parcel geometry — not a surveyed ROW line.
 */
import * as turf from "@turf/turf";

const SHARED_MAX_FT = 8;      // below this = shared lot line
const ROW_MIN_FT = 15;        // typical minimum road ROW half-context
const ROW_MAX_FT = 150;       // above this = open land, not a road corridor
const SAMPLE_FT = 25;         // boundary sampling interval
const NEIGHBOR_SEARCH_FT = 250; // bbox prefilter distance for neighbor parcels

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Flatten a (Multi)Polygon feature into an array of LineString features.
function polygonLines(feature) {
  try {
    const line = turf.polygonToLine(feature);
    const fc = line.type === "FeatureCollection" ? line : { type: "FeatureCollection", features: [line] };
    const out = [];
    fc.features.forEach((f) => {
      turf.flatten(f).features.forEach((g) => {
        if (g.geometry.type === "LineString") out.push(g);
      });
    });
    return out;
  } catch {
    return [];
  }
}

/**
 * @param {Array} parcels  Regrid ring parcels (need .parcel_geometry; optional .apn, .row_flag, .row_type)
 * @param {Object} targetA { latitude, longitude, apn? }
 * @returns {null | {
 *   found, estimated_row_width_ft, frontage_ft, frontage_fc, shared_pct,
 *   samples_n, target_apn, note
 * }}
 */
export function inferRowCorridor(parcels = [], targetA) {
  if (!targetA || !Number.isFinite(targetA.latitude)) return null;
  const withGeom = parcels.filter((p) => p.parcel_geometry);
  if (withGeom.length < 2) return null;

  const pt = turf.point([targetA.longitude, targetA.latitude]);
  const isRow = (p) => p.row_flag === true || p.row_flag === "true" || !!p.row_type;
  const feat = (p) => ({ type: "Feature", geometry: p.parcel_geometry, properties: {} });

  // 1. Target A's parcel: containing polygon → APN match → nearest centroid.
  let target = withGeom.find((p) => {
    try { return turf.booleanPointInPolygon(pt, feat(p)); } catch { return false; }
  });
  if (!target && targetA.apn) target = withGeom.find((p) => p.apn && p.apn === targetA.apn);
  if (!target) return null;

  const targetFeature = feat(target);
  const targetLines = polygonLines(targetFeature);
  if (!targetLines.length) return null;

  // 2. Neighbor lines — non-ROW parcels only (ROW parcels sit INSIDE the
  //    corridor and would zero out the gap), bbox-prefiltered for speed.
  const tb = turf.bbox(targetFeature);
  const pad = NEIGHBOR_SEARCH_FT / 364000; // ~degrees per foot (lat)
  const searchBox = [tb[0] - pad, tb[1] - pad, tb[2] + pad, tb[3] + pad];
  const neighborLines = [];
  withGeom.forEach((p) => {
    if (p === target || isRow(p)) return;
    try {
      const b = turf.bbox(feat(p));
      if (b[0] > searchBox[2] || b[2] < searchBox[0] || b[1] > searchBox[3] || b[3] < searchBox[1]) return;
      polygonLines(feat(p)).forEach((l) => neighborLines.push(l));
    } catch { /* skip bad geometry */ }
  });
  if (!neighborLines.length) return null;

  // 3. Sample the target boundary and measure the gap at each sample.
  const samples = [];
  targetLines.forEach((line) => {
    const lenFt = turf.length(line, { units: "feet" });
    const n = Math.max(2, Math.floor(lenFt / SAMPLE_FT));
    for (let i = 0; i <= n; i++) {
      const sp = turf.along(line, (lenFt * i) / n, { units: "feet" });
      let minGap = Infinity;
      for (const nl of neighborLines) {
        const d = turf.pointToLineDistance(sp, nl, { units: "feet" });
        if (d < minGap) minGap = d;
        if (minGap < 1) break;
      }
      samples.push({ coord: sp.geometry.coordinates, gap: minGap });
    }
  });
  if (!samples.length) return null;

  // 4. Classify + group consecutive frontage samples into line segments.
  const frontageGaps = [];
  let shared = 0;
  const segments = [];
  let current = [];
  samples.forEach((s) => {
    const isFrontage = s.gap >= ROW_MIN_FT && s.gap <= ROW_MAX_FT;
    if (s.gap < SHARED_MAX_FT) shared++;
    if (isFrontage) {
      frontageGaps.push(s.gap);
      current.push(s.coord);
    } else {
      if (current.length >= 2) segments.push(current);
      current = [];
    }
  });
  if (current.length >= 2) segments.push(current);

  const widthFt = median(frontageGaps);
  const frontageFc = {
    type: "FeatureCollection",
    features: segments.map((coords) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: { width_ft: widthFt ? Math.round(widthFt) : null },
    })),
  };
  const frontageFt = frontageFc.features.reduce(
    (sum, f) => sum + turf.length(f, { units: "feet" }), 0
  );

  return {
    found: frontageGaps.length > 0,
    estimated_row_width_ft: widthFt ? Math.round(widthFt) : null,
    frontage_ft: Math.round(frontageFt),
    frontage_fc: frontageFc,
    shared_pct: Math.round((shared / samples.length) * 100),
    samples_n: samples.length,
    target_apn: target.apn || null,
    note: "Inferred from parcel-boundary gaps (Regrid geometry) — not a surveyed ROW line.",
  };
}