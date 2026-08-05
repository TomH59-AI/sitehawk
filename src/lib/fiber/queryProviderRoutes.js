/**
 * Shared provider fiber-route query (KMZ → Supabase PostGIS).
 *
 * Both fiber surfaces read through here so they behave identically:
 *   - Map 11 · Target A Fiber Optics Map  (src/lib/section4/fiberProviderOverlay.js)
 *   - TalonScout scout ring               (src/components/talonscout/FiberRoutesLayer.jsx)
 *
 * Every provider query is bounded by a timeout. A provider that hangs — an
 * unapplied migration, a cold function, a stalled Supabase connection — drops
 * out of the result set instead of holding the caller open forever.
 * Nothing is inferred: only what the imported files actually contain is returned.
 */
import { base44 } from "@/api/base44Client";
import { FIBER_PROVIDERS } from "@/components/maps/fiberLayers";

const MI_TO_DEG_LAT = 1 / 69;

/** Per-provider ceiling. Kept under the Section 4 snapshot pass (8s) plus slack. */
export const FIBER_QUERY_TIMEOUT_MS = 7000;

/** Square bbox around a point, in degrees, corrected for latitude convergence. */
export function fiberBbox(lat, lon, radiusMiles) {
  const dLat = radiusMiles * MI_TO_DEG_LAT;
  const dLon = dLat / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} query timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Query every configured provider layer inside the bbox.
 * Resolves to the providers that actually returned features:
 *   [{ id, name, color, showSplicePoints, features }]
 * Never rejects — a failed or timed-out provider is simply absent.
 */
export async function queryFiberProviderRoutes(lat, lon, radiusMiles, options = {}) {
  const { timeoutMs = FIBER_QUERY_TIMEOUT_MS } = options;
  const bbox = fiberBbox(lat, lon, radiusMiles);

  const sets = await Promise.all(
    FIBER_PROVIDERS.map(async (p) => {
      try {
        const { data } = await withTimeout(
          base44.functions.invoke("fiberProviderRoutes", {
            action: "query_layer",
            layer: `fiberkmz_${p.id}`,
            bbox,
            candidate: { lat, lon },
          }),
          timeoutMs,
          p.id
        );
        const features = data?.features || [];
        return features.length ? { ...p, features } : null;
      } catch (err) {
        // Visible in the console but never fatal — one bad provider must not
        // take the other seven, or the map itself, down with it.
        console.warn(`[FIBER] ${p.id} route query failed:`, err?.message || err);
        return null;
      }
    })
  );

  return sets.filter(Boolean);
}

/** Compact legend payload for callers that surface which providers drew. */
export function fiberLegend(sets) {
  return sets.map((s) => ({ id: s.id, name: s.name, color: s.color, count: s.features.length }));
}
