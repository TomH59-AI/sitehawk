// Single coordinate normalization point for the whole Site Search pipeline.
// Every lat/lon that ENTERS the pipeline is rounded to exactly 4 decimal places
// (~11 m on the ground — plenty precise for tower siting) the moment it arrives.
// This guarantees fetches, cache keys (telecom_fiber, viewshed, etc.) and bus
// emits all share the SAME coordinate string, so cache lookups actually hit
// instead of missing on a 6th-decimal difference.

// Round one coordinate value to 4 decimals. Returns null for non-finite input.
export function round4(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : null;
}

// Normalize a {lat, lon} (or {latitude, longitude}) pair to 4 decimals.
// Preserves the original key names so callers can spread the result back.
export function normalizeCoords(lat, lon) {
  return { lat: round4(lat), lon: round4(lon) };
}