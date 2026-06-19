/**
 * Tower3DViewer — standalone page for the Generate 3D Image feature.
 * Uses lightweight Three.js renderer (replaces Cesium).
 * Route: /tower-3d-viewer?runId=<TowerSitingRun.id>
 */
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, AlertTriangle, Box, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import ThreeTower3DViewer from "@/components/towersiter/ThreeTower3DViewer";
import Snapshot3DGallery from "@/components/towersiter/Snapshot3DGallery";

function centroidFromGeojson(geojson) {
  let ring = null;
  try {
    const g = geojson?.type === "Feature" ? geojson.geometry : geojson;
    if (!g) return null;
    if (g.type === "Polygon") ring = g.coordinates?.[0];
    else if (g.type === "MultiPolygon") ring = g.coordinates?.[0]?.[0];
    if (!ring || ring.length === 0) return null;
    let sumLon = 0, sumLat = 0;
    for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
    return { lat: sumLat / ring.length, lon: sumLon / ring.length };
  } catch { return null; }
}

function normaliseGeometry(geojson) {
  if (!geojson) return null;
  if (geojson.type === "Feature") return geojson.geometry;
  if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") return geojson;
  return null;
}

export default function Tower3DViewer() {
  const urlParams = new URLSearchParams(window.location.search);
  const runId = urlParams.get("runId");

  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [render, setRender] = useState(null);
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [snapshotRefresh, setSnapshotRefresh] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => { init(); }, [runId]);

  async function init() {
    setStatus("loading");
    try {
      let run = null;
      if (runId) {
        const rows = await base44.entities.TowerSitingRun.filter({ id: runId });
        run = rows?.[0] || null;
      }
      if (!run) {
        const all = await base44.entities.TowerSitingRun.list("-created_date", 20);
        run = all.find((r) => r.feasible === true) || all[0] || null;
      }
      if (!run) throw new Error("No TowerSitingRun found. Run the Tower Siter first.");

      let lat = run.parcel_centroid_lat;
      let lon = run.parcel_centroid_lon;
      if (!lat || !lon) {
        const derived = centroidFromGeojson(run.parcel_geometry);
        if (!derived) throw new Error("TowerSitingRun has no centroid and no parseable parcel geometry.");
        lat = derived.lat; lon = derived.lon;
      }

      const parcelGeom = normaliseGeometry(run.parcel_geometry);
      const cw = run.compound_width_ft || 75;
      const cd = run.compound_depth_ft || 75;
      const closestSize = ["50x50", "75x75", "100x100"].reduce((best, s) => {
        const [w] = s.split("x").map(Number);
        return Math.abs(w - cw) < Math.abs(Number(best.split("x")[0]) - cw) ? s : best;
      }, "75x75");

      let rec = null;
      const existing = await base44.entities.Tower3DRender.filter({ tower_siting_run_id: run.id });
      if (existing?.[0]) {
        rec = await base44.entities.Tower3DRender.update(existing[0].id, {
          centroid_lat: lat, centroid_lon: lon, parcel_geojson: parcelGeom,
          tower_type: run.tower_type || "monopole",
          tower_height_ft: run.tower_height_ft || 150,
          compound_size: closestSize, compound_width_ft: cw, compound_depth_ft: cd, status: "ready",
        });
      } else {
        rec = await base44.entities.Tower3DRender.create({
          tower_siting_run_id: run.id, parcel_id: run.parcel_id || null,
          property_address: run.property_address || null,
          site_name: run.property_address || "Target A",
          centroid_lat: lat, centroid_lon: lon, parcel_geojson: parcelGeom,
          tower_type: run.tower_type || "monopole",
          tower_height_ft: run.tower_height_ft || 150,
          compound_size: closestSize, compound_width_ft: cw, compound_depth_ft: cd,
          buffer_ft: 25, status: "ready",
        });
      }

      setRender(rec);
      setSnapshotUrl(rec.snapshot_image_url || null);
      setStatus("ready");
    } catch (e) {
      console.error("Tower3DViewer init error:", e);
      setErrorMsg(e.message || "Unknown error");
      setStatus("error");
    }
  }

  const handleSnapshot = ({ file_url }) => {
    setSnapshotUrl(file_url);
    setSnapshotRefresh((n) => n + 1);
    setViewerOpen(false);
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to="/tower-siter">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to Tower Siter
          </Button>
        </Link>
      </div>

      <h1 className="font-heading font-bold text-2xl text-foreground mb-1 flex items-center gap-2">
        <Box className="w-6 h-6 text-indigo-500" /> Generate 3D Image
      </h1>
      <p className="text-muted-foreground text-sm mb-6">
        Interactive 3D tower concept from your Tower Siter result. Capture a frame to attach to your landowner packet.
      </p>

      {status === "loading" && (
        <div className="flex items-center gap-3 text-muted-foreground py-12">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading Tower Siting Run data…
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-destructive mb-1">Could not load 3D preview</div>
            <div className="text-sm text-muted-foreground">{errorMsg}</div>
          </div>
        </div>
      )}

      {status === "ready" && render && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-1">
            <div className="font-semibold text-foreground">{render.property_address || render.site_name || "Target A"}</div>
            {render.parcel_id && <div className="text-muted-foreground">Parcel: {render.parcel_id}</div>}
            <div className="text-muted-foreground">
              Tower: <b className="text-foreground">{render.tower_height_ft} ft AGL</b>
              {" · "}Compound: <b className="text-foreground">{render.compound_width_ft}×{render.compound_depth_ft} ft</b>
              {" · "}Type: <b className="text-foreground">{render.tower_type}</b>
            </div>
          </div>

          <Button
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold gap-2"
            onClick={() => setViewerOpen(true)}
          >
            <Box className="w-4 h-4" />
            {snapshotUrl ? "Re-open 3D Viewer" : "Open 3D Viewer"}
          </Button>

          {snapshotUrl && (
            <Snapshot3DGallery towerId={render.id} snapshotUrl={snapshotUrl} refreshKey={snapshotRefresh} />
          )}
        </div>
      )}

      {viewerOpen && render && (
        <ThreeTower3DViewer
          render={render}
          onClose={() => setViewerOpen(false)}
          onSnapshot={handleSnapshot}
        />
      )}
    </div>
  );
}