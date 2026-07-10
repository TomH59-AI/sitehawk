/**
 * generateCesiumTowerViewer — hydration + secrets endpoint for the interactive
 * Cesium viewer route (/cesium-tower-viewer). Accepts { renderId } or { runId },
 * loads Tower3DRender FIRST, falls back to TowerSitingRun, and returns the
 * scene payload plus session-scoped Cesium/Google tokens.
 * Raw secrets are never logged or persisted to entity fields.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const firstEnv = (names) => {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  return null;
};

function geomCentroid(geometry) {
  try {
    const g = geometry?.type === "Feature" ? geometry.geometry : geometry;
    let ring = null;
    if (g?.type === "Polygon") ring = g.coordinates[0];
    else if (g?.type === "MultiPolygon") ring = g.coordinates[0][0];
    if (!ring?.length) return null;
    const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    return { lat, lon };
  } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { /* allow empty */ }
    const renderId = body.renderId || body.render_id || null;
    const runId = body.runId || body.run_id || body.tower_siting_run_id || null;
    if (!renderId && !runId) {
      return Response.json({ error: "missing_input", missing: ["renderId or runId"] }, { status: 422 });
    }

    // 1. Tower3DRender first
    let render = null;
    if (renderId) {
      render = await base44.entities.Tower3DRender.get(renderId).catch(() => null);
    }
    if (!render && runId) {
      const rows = await base44.entities.Tower3DRender.filter(
        { tower_siting_run_id: runId }, "-created_date", 1
      ).catch(() => []);
      render = rows?.[0] || null;
    }

    // 2. TowerSitingRun fallback / geometry backfill
    const effectiveRunId = render?.tower_siting_run_id || runId;
    let run = null;
    if (effectiveRunId) {
      run = await base44.entities.TowerSitingRun.get(effectiveRunId).catch(() => null);
    }

    if (!render && !run) {
      return Response.json({
        error: "not_found",
        missing: ["No Tower3DRender or TowerSitingRun found for the given id"],
      }, { status: 404 });
    }

    const parcelGeojson = render?.parcel_geojson || run?.parcel_geometry || null;
    const compoundGeojson = render?.compound_geojson || run?.compound_geojson?.geometry || run?.compound_geojson || null;

    let lat = render?.centroid_lat ?? run?.parcel_centroid_lat ?? null;
    let lon = render?.centroid_lon ?? run?.parcel_centroid_lon ?? null;
    if ((!lat || !lon) && parcelGeojson) {
      const c = geomCentroid(parcelGeojson);
      if (c) { lat = c.lat; lon = c.lon; }
    }

    const missing = [];
    if (!lat || !lon) missing.push("tower/centroid coordinates (centroid_lat/centroid_lon or parcel geometry)");
    if (!parcelGeojson) missing.push("parcel boundary geometry (parcel_geojson)");

    // Hard guard — never hand the viewer a blank/default globe
    if (!lat || !lon) {
      return Response.json({
        error: "insufficient_geometry",
        missing,
        snapshot_image_url: render?.snapshot_image_url || null,
      }, { status: 422 });
    }

    const ionToken = firstEnv([
      "CESIUM_ION_TOKEN", "CESIUM_ION_API", "VITE_CESIUM_ION_TOKEN", "SITEHAWK_CESIUM_ION_TOKEN",
    ]);
    const googleKey = firstEnv([
      "GOOGLE_MAP_TILES_API_KEY", "GOOGLE_3D_TILES_API_KEY", "VITE_GOOGLE_MAP_TILES_API_KEY",
      "SITEHAWK_GOOGLE_MAP_TILES_API_KEY", "GOOGLE_MAPS_API_KEY",
    ]);

    return Response.json({
      ok: true,
      source: render ? "Tower3DRender" : "TowerSitingRun",
      render_id: render?.id || null,
      run_id: effectiveRunId || null,
      missing,
      ionToken: ionToken || null,
      googleKey: googleKey || null,
      scene: {
        lat, lon,
        property_address: render?.property_address || run?.property_address || null,
        site_name: render?.site_name || run?.property_address || "Target A",
        tower_type: render?.tower_type || run?.tower_type || "monopole",
        tower_height_ft: render?.tower_height_ft || run?.tower_height_ft || 200,
        compound_width_ft: render?.compound_width_ft || run?.compound_width_ft || 75,
        compound_depth_ft: render?.compound_depth_ft || run?.compound_depth_ft || 75,
        buffer_ft: render?.buffer_ft || 25,
        parcel_geojson: parcelGeojson,
        compound_geojson: compoundGeojson,
        snapshot_image_url: render?.snapshot_image_url || null,
        disclaimer_text: render?.disclaimer_text ||
          "Illustrative concept — not a survey. Parcel outline and tower height are to scale; the monopole, fence, gravel pad, and landscaped buffer are shown at exaggerated scale so placement is easy to see. Final dimensions set after site walk & survey.",
      },
    });
  } catch (error) {
    console.error("generateCesiumTowerViewer error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});