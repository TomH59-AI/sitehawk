/**
 * tower3DViewerConfig — hydrates the interactive Cesium viewer for a
 * Tower3DRender (primary) / TowerSitingRun (fallback). Returns scene geometry
 * plus viewer tokens resolved from app secrets. Tokens are returned only to
 * the authenticated caller for the live viewer session — they are NEVER
 * logged, stored in entity fields, or embedded in error messages.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DEFAULT_DISCLAIMER =
  'Illustrative concept — not a survey. Parcel outline and tower height are to scale; the monopole, fence, gravel pad, and landscaped buffer are shown at exaggerated scale so placement is easy to see. Final dimensions set after site walk & survey.';

function firstSecret(names) {
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

    const body = await req.json().catch(() => ({}));
    const renderId = body?.render_id || null;
    const runIdInput = body?.tower_siting_run_id || null;
    if (!renderId && !runIdInput) {
      return Response.json({ error: 'render_id or tower_siting_run_id required' }, { status: 400 });
    }

    // 1. Tower3DRender FIRST
    let render = null;
    if (renderId) render = await base44.entities.Tower3DRender.get(renderId).catch(() => null);
    if (!render && runIdInput) {
      const rows = await base44.entities.Tower3DRender.filter(
        { tower_siting_run_id: runIdInput }, '-created_date', 1
      ).catch(() => []);
      render = rows?.[0] || null;
    }

    // 2. TowerSitingRun fallback / gap-fill
    const runId = render?.tower_siting_run_id || runIdInput || null;
    let run = null;
    if (runId) run = await base44.entities.TowerSitingRun.get(runId).catch(() => null);

    if (!render && !run) {
      return Response.json({
        error: 'No Tower3DRender or TowerSitingRun found for the given id. Run the Tower Siter first, then generate the 3D preview.',
        missing: ['Tower3DRender record', 'TowerSitingRun record'],
      }, { status: 404 });
    }

    const towerLonLat = run?.siting_result?.towerLonLat || run?.siting_result?.tower_lonlat || null;
    const lat = render?.centroid_lat ?? run?.parcel_centroid_lat ?? (Array.isArray(towerLonLat) ? towerLonLat[1] : null);
    const lon = render?.centroid_lon ?? run?.parcel_centroid_lon ?? (Array.isArray(towerLonLat) ? towerLonLat[0] : null);
    const parcelGeojson = render?.parcel_geojson || run?.parcel_geometry || null;
    const compoundGeojson = render?.compound_geojson || run?.compound_geojson || null;

    const missing = [];
    if (!parcelGeojson) missing.push('Parcel boundary geometry (parcel outline will not render)');
    if (!compoundGeojson) missing.push('Compound footprint geometry — generated 75×75 ft compound used instead');

    // Hard guard: no coordinates = no scene. Never open a blank globe.
    if (lat == null || lon == null || !isFinite(Number(lat)) || !isFinite(Number(lon))) {
      return Response.json({
        error: 'Missing tower/centroid coordinates on both the Tower3DRender and its TowerSitingRun — cannot place the 3D scene.',
        missing: ['Tower / parcel centroid coordinates', ...missing],
      }, { status: 422 });
    }

    // Viewer tokens from app secrets (support common alternate names).
    const cesiumIonToken = firstSecret([
      'CESIUM_ION_TOKEN', 'VITE_CESIUM_ION_TOKEN', 'SITEHAWK_CESIUM_ION_TOKEN', 'CESIUM_ION_API',
    ]);
    const googleTilesKey = firstSecret([
      'GOOGLE_MAP_TILES_API_KEY', 'GOOGLE_3D_TILES_API_KEY', 'VITE_GOOGLE_MAP_TILES_API_KEY',
      'SITEHAWK_GOOGLE_MAP_TILES_API_KEY', 'GOOGLE_MAPS_API_KEY',
    ]);
    const ionAssetRaw = firstSecret([
      'CESIUM_GOOGLE_3D_TILES_ASSET_ID', 'VITE_CESIUM_GOOGLE_3D_TILES_ASSET_ID',
      'SITEHAWK_CESIUM_GOOGLE_3D_TILES_ASSET_ID',
    ]);
    if (!cesiumIonToken) missing.push('Cesium Ion token secret (terrain/imagery fallback limited)');
    if (!googleTilesKey) missing.push('Google 3D Tiles key secret (photorealistic tiles unavailable — terrain fallback used)');

    console.log(`tower3DViewerConfig: user=${user.email} render=${render?.id || '—'} run=${runId || '—'} geometry=${parcelGeojson ? 'parcel' : 'none'} missing=${missing.length}`);

    return Response.json({
      tokens: {
        cesiumIonToken,
        googleTilesKey,
        googleTilesIonAssetId: ionAssetRaw ? (Number(ionAssetRaw) || null) : null,
      },
      scene: {
        render_id: render?.id || null,
        tower_siting_run_id: runId,
        lat: Number(lat),
        lon: Number(lon),
        parcel_geojson: parcelGeojson,
        compound_geojson: compoundGeojson,
        tower_height_ft: render?.tower_height_ft || run?.tower_height_ft || 200,
        tower_type: render?.tower_type || run?.tower_type || 'monopole',
        compound_width_ft: render?.compound_width_ft || run?.compound_width_ft || 75,
        compound_depth_ft: render?.compound_depth_ft || run?.compound_depth_ft || 75,
        buffer_ft: render?.buffer_ft || 25,
        property_address: render?.property_address || run?.property_address || null,
        site_name: render?.site_name || 'Target A',
        snapshot_image_url: render?.snapshot_image_url || null,
        disclaimer_text: render?.disclaimer_text || DEFAULT_DISCLAIMER,
      },
      missing,
    });
  } catch (error) {
    console.error('tower3DViewerConfig error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});