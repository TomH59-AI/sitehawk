import * as turf from "@turf/turf";

export const TALONFIT_SEARCH_RADIUS_MILES = 1;
export const PRIMARY_SEARCH_RADIUS_MILES = 0.5;

export function toGeoJSONPosition(lng, lat) {
  const position = [Number(lng), Number(lat)];
  if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) return null;
  return position;
}

export function toLeafletPosition(position) {
  return position ? [position[1], position[0]] : null;
}

export function pointFeature(lng, lat, properties = {}) {
  const position = toGeoJSONPosition(lng, lat);
  return position ? turf.point(position, properties) : null;
}

export function distanceMiles(from, to) {
  if (!from || !to) return null;
  return turf.distance(from, to, { units: "miles" });
}

export function searchRing(centerPoint, radiusMiles = TALONFIT_SEARCH_RADIUS_MILES) {
  if (!centerPoint || !Number.isFinite(Number(radiusMiles)) || Number(radiusMiles) <= 0) return null;
  const ring = turf.buffer(centerPoint, Number(radiusMiles), { units: "miles", steps: 96 });
  return closePolygonLoops(ring);
}

export function closePolygonLoops(feature) {
  if (!feature?.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) return feature;
  const closeRing = (ring) => {
    if (!Array.isArray(ring) || ring.length === 0) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, [...first]];
  };
  const coordinates = feature.geometry.type === "Polygon"
    ? feature.geometry.coordinates.map(closeRing)
    : feature.geometry.coordinates.map((polygon) => polygon.map(closeRing));
  return { ...feature, geometry: { ...feature.geometry, coordinates } };
}

export function isPointInsideBoundary(point, polygon) {
  return Boolean(point && polygon && turf.booleanPointInPolygon(point, polygon, { ignoreBoundary: false }));
}

export function candidateSpatialRecord(candidate, centerPoint, ring) {
  const point = pointFeature(candidate?.longitude, candidate?.latitude, { id: candidate?.id });
  const distance_miles = point ? distanceMiles(centerPoint, point) : null;
  return {
    candidate,
    point,
    distance_miles,
    within_one_mile: point ? isPointInsideBoundary(point, ring) : false,
  };
}

export function featureBounds(features) {
  const valid = features.filter(Boolean);
  if (!valid.length) return null;
  return turf.bbox(turf.featureCollection(valid));
}
