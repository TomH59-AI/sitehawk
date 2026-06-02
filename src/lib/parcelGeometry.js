/**
 * parcelGeometry — shared helpers for reading/normalizing parcel boundary
 * geometry stored on a ScipRecord parcel_targets[] entry.
 *
 * Targets may carry geometry under any of several historical keys. We read them
 * all and normalize to a GeoJSON geometry (Polygon or MultiPolygon).
 */

const GEOM_KEYS = ["geometry", "parcel_geojson", "boundary_geojson", "polygon", "coordinates", "parcel_geometry"];

// Normalize anything geometry-ish to a GeoJSON Polygon/MultiPolygon geometry.
export function normalizeGeometry(g) {
  if (!g) return null;
  // Feature → unwrap
  if (g.type === "Feature" && g.geometry) return normalizeGeometry(g.geometry);
  // FeatureCollection → first feature
  if (g.type === "FeatureCollection" && Array.isArray(g.features) && g.features.length) {
    return normalizeGeometry(g.features[0]);
  }
  if (g.type === "Polygon" || g.type === "MultiPolygon") return g;
  // Bare coordinates array stored under `coordinates` — assume Polygon ring set.
  if (Array.isArray(g) && g.length && Array.isArray(g[0])) {
    return { type: "Polygon", coordinates: g };
  }
  return null;
}

// Pull the boundary geometry off a target, checking all known keys.
export function getTargetGeometry(target) {
  if (!target) return null;
  for (const k of GEOM_KEYS) {
    const norm = normalizeGeometry(target[k]);
    if (norm) return norm;
  }
  return null;
}

// Extend a Mapbox LngLatBounds with every coordinate of a Polygon/MultiPolygon.
export function extendBoundsWithGeometry(bounds, geom) {
  if (!geom) return bounds;
  const rings = geom.type === "MultiPolygon" ? geom.coordinates.flat() : geom.coordinates;
  rings.forEach((ring) => ring.forEach((c) => {
    if (Number.isFinite(c[0]) && Number.isFinite(c[1])) bounds.extend(c);
  }));
  return bounds;
}