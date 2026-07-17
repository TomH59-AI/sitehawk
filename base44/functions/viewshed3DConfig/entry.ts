/**
 * viewshed3DConfig — returns the Cesium Ion token + Google 3D Tiles key needed
 * to render the interactive 3D viewshed globe for a Target A. Tokens come from
 * app secrets, are returned only to the authenticated caller for the live
 * viewer session, and are NEVER logged or persisted.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function firstSecret(names: string[]): string | null {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const cesiumIonToken = firstSecret([
      'CESIUM_ION_TOKEN', 'VITE_CESIUM_ION_TOKEN', 'SITEHAWK_CESIUM_ION_TOKEN', 'CESIUM_ION_API',
    ]);
    const googleTilesKey = firstSecret([
      'GOOGLE_MAP_TILES_API_KEY', 'GOOGLE_3D_TILES_API_KEY', 'VITE_GOOGLE_MAP_TILES_API_KEY',
      'SITEHAWK_GOOGLE_MAP_TILES_API_KEY', 'GOOGLE_MAPS_API_KEY',
    ]);

    const missing: string[] = [];
    if (!cesiumIonToken) missing.push('Cesium Ion token (terrain unavailable — 3D view limited)');
    if (!googleTilesKey) missing.push('Google 3D Tiles key (photorealistic tiles unavailable — terrain fallback used)');

    return Response.json({
      tokens: { cesiumIonToken, googleTilesKey },
      missing,
    });
  } catch (error) {
    console.error('viewshed3DConfig error:', (error as Error)?.message || error);
    return Response.json({ error: (error as Error)?.message || String(error) }, { status: 500 });
  }
});