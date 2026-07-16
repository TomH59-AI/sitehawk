/**
 * HawkPro Package builder — Turtle Up build (unwired behind HAWKPRO_EXPORT flag).
 *
 * Packages the current Tower Siter scenario into 8 GeoJSON layers (WGS84 /
 * EPSG:4326) + README.txt, matching the desktop HawkPro Bridge pipeline
 * (hawkpro_layout.py). Filename stems are EXACT and must never change — the
 * ArcGIS Pro script ingests them by name with zero renaming.
 *
 * GEOMETRY MATH — all distances in FEET.
 *   - turf.buffer with { units: 'feet' } (negative = inward). NEVER buffer raw
 *     lat/lon degrees.
 *   - turf.circle with { units: 'feet' } for the fall-zone / ring circles.
 *   - compound: square centered on the tower, side from the Siter compound
 *     setting, built with turf.circle steps:4 rotated to a square? NO — we build
 *     an explicit square in feet via a local azimuthal offset using turf.destination.
 *
 * ORDINANCE-DERIVED vs DEFAULT:
 *   Fall-zone percentage defaults to 110% of height. If the cached ordinance
 *   (normalized rules) carries an explicit fall_zone_ft, we derive the effective
 *   percentage from it and mark the layer "ordinance-derived". We NEVER invent
 *   ordinance numbers — absent an ordinance value we fall back to the 110%
 *   default and say so in the README.
 */
import buffer from "@turf/buffer";
import circle from "@turf/circle";
import destination from "@turf/destination";
import { feature, featureCollection, polygon as turfPolygon } from "@turf/helpers";

export const DEFAULT_FALL_PCT = 1.10; // 110% of tower height
export const DEFAULT_BP_FRAC = 0.80;
export const DEFAULT_COMPOUND_FT = 100;

// EXACT filename stems — the desktop HawkPro Bridge ingests these by name.
export const LAYER_STEMS = [
  "parcel",
  "envelope_breakpoint",
  "envelope_nonbreakpoint",
  "fall_radius_bp",
  "ring_nonbp",
  "ring_residential_2xH",
  "compound",
  "tower",
];

// ── helpers ──────────────────────────────────────────────────────────────────
// Normalize any parcel input (Feature | Geometry) into a turf Polygon Feature.
function asPolygonFeature(parcelGeoJSON) {
  if (!parcelGeoJSON) return null;
  if (parcelGeoJSON.type === "Feature") return parcelGeoJSON;
  if (parcelGeoJSON.type === "Polygon" || parcelGeoJSON.type === "MultiPolygon") {
    return feature(parcelGeoJSON);
  }
  return null;
}

// Inward buffer of the parcel by `distFt` feet (negative distance). Returns a
// GeoJSON geometry (Polygon/MultiPolygon) or null if the buffer collapses.
function inwardBuffer(parcelFeat, distFt) {
  if (!parcelFeat || !(distFt > 0)) return null;
  try {
    const buffered = buffer(parcelFeat, -distFt, { units: "feet" });
    return buffered?.geometry || null;
  } catch {
    return null;
  }
}

// Circle centered on [lon,lat], radius in feet → GeoJSON Polygon geometry.
function circleFt(lonLat, radiusFt) {
  if (!lonLat || !(radiusFt > 0)) return null;
  return circle(lonLat, radiusFt, { units: "feet", steps: 128 }).geometry;
}

// Square centered on [lon,lat], side length in feet, axis-aligned to N/E.
// Built with turf.destination so the side is measured in true feet, not degrees.
function squareFt(lonLat, sideFt) {
  if (!lonLat || !(sideFt > 0)) return null;
  const half = sideFt / 2;
  const diag = Math.sqrt(half * half + half * half);
  // Corners at 45°, 135°, 225°, 315° bearings from center at the half-diagonal.
  const corners = [45, 135, 225, 315].map((bearing) =>
    destination(lonLat, diag, bearing, { units: "feet" }).geometry.coordinates
  );
  corners.push(corners[0]); // close the ring
  return turfPolygon([corners]).geometry;
}

/**
 * Resolve the effective fall-zone percentage and its provenance.
 * Returns { pct, source } where source is "ordinance-derived" | "default".
 * NEVER invents ordinance values — only derives from an explicit fall_zone_ft.
 */
export function resolveFallPct(rules, heightFt) {
  const h = Number(heightFt) || 0;
  const raw = rules?._raw || {};
  // Explicit percent-of-height column, if the ordinance table carries one.
  const pctCol = parseFloat(raw.fall_zone_pct_of_height ?? raw.fall_zone_pct);
  if (Number.isFinite(pctCol) && pctCol > 0) {
    return { pct: pctCol / 100, source: "ordinance-derived" };
  }
  // Explicit fall-zone distance in feet (already normalized) → derive a pct.
  const fallFt = Number(rules?.fall_zone_ft);
  if (Number.isFinite(fallFt) && fallFt > 0 && h > 0) {
    return { pct: fallFt / h, source: "ordinance-derived" };
  }
  return { pct: DEFAULT_FALL_PCT, source: "default" };
}

/**
 * Build all 8 GeoJSON layers + a per-layer manifest describing each distance
 * and its source. Pure geometry — reads only values passed in.
 *
 * @param {object} args
 * @param {object} args.parcelGeoJSON  Realie parcel polygon (Feature or Geometry)
 * @param {[number,number]} args.towerLonLat  placed tower point [lon,lat]
 * @param {number} args.heightFt  tower height (H)
 * @param {number} args.bpFrac    breakpoint fraction (default 0.80)
 * @param {number} args.compoundFt  compound square side in feet (default 100)
 * @param {object|null} args.rules  normalized ordinance rules (or null)
 * @returns {{ layers: Record<string,object>, manifest: Array }}
 */
export function buildHawkProLayers({ parcelGeoJSON, towerLonLat, heightFt, bpFrac, compoundFt, rules }) {
  const H = Number(heightFt) || 0;
  const BP = Number.isFinite(Number(bpFrac)) ? Number(bpFrac) : DEFAULT_BP_FRAC;
  const compSide = Number(compoundFt) || DEFAULT_COMPOUND_FT;
  const parcelFeat = asPolygonFeature(parcelGeoJSON);
  if (!parcelFeat) throw new Error("No parcel polygon available to package.");
  if (!Array.isArray(towerLonLat) || towerLonLat.length < 2) throw new Error("No tower point placed.");

  const { pct: fallPct, source: fallSource } = resolveFallPct(rules, H);

  // Distances (all feet)
  const dNonBp = fallPct * H;              // 1.10 × H  (or ordinance-derived)
  const dBp = fallPct * H * (1 - BP);      // 1.10 × H × (1 − BP_FRAC)
  const dResidential = 2 * H;              // 2 × H

  // properties: name (stem) + distance_ft on every feature
  const withProps = (geom, name, distanceFt, extra = {}) =>
    geom ? feature(geom, { name, distance_ft: Math.round(distanceFt * 100) / 100, ...extra }) : null;

  const layers = {
    parcel: feature(parcelFeat.geometry, { name: "parcel", distance_ft: 0 }),
    envelope_breakpoint: withProps(inwardBuffer(parcelFeat, dBp), "envelope_breakpoint", dBp),
    envelope_nonbreakpoint: withProps(inwardBuffer(parcelFeat, dNonBp), "envelope_nonbreakpoint", dNonBp),
    fall_radius_bp: withProps(circleFt(towerLonLat, dBp), "fall_radius_bp", dBp),
    ring_nonbp: withProps(circleFt(towerLonLat, dNonBp), "ring_nonbp", dNonBp),
    ring_residential_2xH: withProps(circleFt(towerLonLat, dResidential), "ring_residential_2xH", dResidential),
    compound: withProps(squareFt(towerLonLat, compSide), "compound", compSide),
    tower: feature({ type: "Point", coordinates: [towerLonLat[0], towerLonLat[1]] }, { name: "tower", height_ft: H }),
  };

  // Per-layer manifest for the README — distance + provenance.
  const ordinanceOrDefault = fallSource; // fall-zone-derived layers share this source
  const manifest = [
    { stem: "parcel", distance_ft: null, source: "Realie parcel boundary", note: "Loaded parcel polygon" },
    { stem: "envelope_breakpoint", distance_ft: dBp, source: ordinanceOrDefault, note: `parcel buffered inward by ${fallPct.toFixed(2)} × H × (1 − ${BP})` },
    { stem: "envelope_nonbreakpoint", distance_ft: dNonBp, source: ordinanceOrDefault, note: `parcel buffered inward by ${fallPct.toFixed(2)} × H` },
    { stem: "fall_radius_bp", distance_ft: dBp, source: ordinanceOrDefault, note: `circle at tower, radius ${fallPct.toFixed(2)} × H × (1 − ${BP})` },
    { stem: "ring_nonbp", distance_ft: dNonBp, source: ordinanceOrDefault, note: `circle at tower, radius ${fallPct.toFixed(2)} × H` },
    { stem: "ring_residential_2xH", distance_ft: dResidential, source: "default", note: "circle at tower, radius 2 × H" },
    { stem: "compound", distance_ft: compSide, source: "default (Siter compound setting)", note: "square centered on tower" },
    { stem: "tower", distance_ft: null, source: "user-placed point", note: `height_ft = ${H}` },
  ];

  return { layers, manifest, meta: { H, BP, fallPct, fallSource, compSide } };
}

/**
 * Build the README.txt body. `agentName` comes from base44.auth.me() — never
 * hardcoded (multi-tenant: every subscriber gets their own name).
 */
export function buildReadme({ siteLabel, parcelId, jurisdiction, manifest, meta, agentName }) {
  const ts = new Date().toISOString();
  const lines = [];
  lines.push("SITEHAWK — HAWKPRO PACKAGE");
  lines.push("==========================");
  lines.push("");
  lines.push(`Site:          ${siteLabel || "—"}`);
  lines.push(`Parcel ID:     ${parcelId || "—"}`);
  lines.push(`Jurisdiction:  ${jurisdiction || "—"}`);
  lines.push(`Tower height H: ${meta.H} ft`);
  lines.push(`Breakpoint fraction (BP_FRAC): ${meta.BP}`);
  lines.push(`Fall-zone factor: ${meta.fallPct.toFixed(2)} × H  (${meta.fallSource})`);
  lines.push(`Compound side: ${meta.compSide} ft`);
  lines.push("");
  lines.push("LAYERS (WGS84 / EPSG:4326):");
  for (const m of manifest) {
    const dist = m.distance_ft == null ? "—" : `${Math.round(m.distance_ft * 100) / 100} ft`;
    lines.push(`  ${m.stem}.geojson`);
    lines.push(`     distance: ${dist}   source: ${m.source}`);
    lines.push(`     ${m.note}`);
  }
  lines.push("");
  lines.push(`Prepared by ${agentName || "SiteHawk user"}`);
  lines.push(`Generated: ${ts}`);
  lines.push("");
  lines.push("Concept exhibit — not a survey; field verification required.");
  return lines.join("\n");
}

/**
 * Assemble the .zip client-side with JSZip and trigger a browser download.
 * filename: HawkPro_{parcelId}_{YYYYMMDD}.zip
 */
export async function buildAndDownloadZip({ layers, readme, parcelId }) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  for (const stem of LAYER_STEMS) {
    const feat = layers[stem];
    if (!feat) continue; // a collapsed inward buffer is simply omitted
    // Each file is a single-feature FeatureCollection (JSONToFeatures friendly).
    zip.file(`${stem}.geojson`, JSON.stringify(featureCollection([feat]), null, 2));
  }
  zip.file("README.txt", readme);

  const blob = await zip.generateAsync({ type: "blob" });
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeId = String(parcelId || "site").replace(/[^a-z0-9-]/gi, "_");
  const fname = `HawkPro_${safeId}_${ymd}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return fname;
}