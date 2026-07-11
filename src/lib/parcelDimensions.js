// Builds a FeatureCollection of boundary-segment midpoint labels ("245 ft")
// for a parcel Polygon/MultiPolygon GeoJSON geometry.

function haversineFt(a, b) {
  const R = 20902231; // earth radius in feet
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function buildDimensionLabels(geometry) {
  if (!geometry) return { type: "FeatureCollection", features: [] };
  const rings = [];
  if (geometry.type === "Polygon") rings.push(...geometry.coordinates);
  else if (geometry.type === "MultiPolygon") geometry.coordinates.forEach((poly) => rings.push(...poly));

  const features = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      const ft = haversineFt(a, b);
      if (ft < 15) continue; // skip tiny vertices/noise
      features.push({
        type: "Feature",
        properties: { label: `${Math.round(ft)} ft` },
        geometry: { type: "Point", coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}