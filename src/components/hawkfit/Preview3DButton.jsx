import { useState } from "react";
import { Box, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import ThreeTower3DViewer from "@/components/towersiter/ThreeTower3DViewer";

// Builds only live Tower3DRender schema fields from a real TowerSitingRun.
function renderFromRun(run) {
  const cw = run.compound_width_ft || 100;
  const cd = run.compound_depth_ft || 100;
  return {
    tower_siting_run_id: run.id,
    property_address: run.property_address || null,
    site_name: run.property_address || "Target A",
    parcel_id: run.parcel_id || null,
    centroid_lat: run.parcel_centroid_lat,
    centroid_lon: run.parcel_centroid_lon,
    parcel_geojson: run.parcel_geometry || null,
    compound_geojson: run.compound_geojson?.geometry || run.compound_geojson || null,
    tower_type: run.tower_type || "monopole",
    tower_height_ft: run.tower_height_ft || 199,
    compound_width_ft: cw,
    compound_depth_ft: cd,
    compound_size: ["50x50", "75x75", "100x100"].includes(`${cw}x${cd}`) ? `${cw}x${cd}` : "75x75",
  };
}

/**
 * HawkFit 3D preview — hydrates from the Tower3DRender tied to the real
 * TowerSitingRun when present, falling back to the run itself. Snapshots are
 * persisted back to Tower3DRender; status flips to "ready" only once a real
 * snapshot image exists. Never a disconnected demo.
 */
export default function Preview3DButton({ threeD, onRenderSaved }) {
  const [open, setOpen] = useState(false);
  const run = threeD?.run || null;
  const rec = threeD?.render || null;
  if (!run && !rec) return null;

  const render = rec || renderFromRun(run);

  const handleSnapshot = async ({ file_url }) => {
    if (!file_url) return;
    try {
      if (rec?.id) {
        await base44.entities.Tower3DRender.update(rec.id, { snapshot_image_url: file_url, status: "ready" });
      } else if (run) {
        await base44.entities.Tower3DRender.create({ ...renderFromRun(run), snapshot_image_url: file_url, status: "ready" });
      }
      onRenderSaved?.();
    } catch { /* preview still shown; record sync retried on next snapshot */ }
  };

  return (
    <>
      {/* 2D snapshot is the default visual */}
      {rec?.snapshot_image_url ? (
        <a href={rec.snapshot_image_url} target="_blank" rel="noreferrer" className="block">
          <img
            src={rec.snapshot_image_url}
            alt="Tower site exhibit (2D)"
            className="w-full rounded-lg border object-cover"
            style={{ maxHeight: 220 }}
          />
        </a>
      ) : (
        <Button variant="outline" className="w-full gap-2" onClick={() => setOpen(true)}>
          <Box className="w-4 h-4" /> Generate Preview
        </Button>
      )}
      {/* 3D stays available as a small optional link */}
      <div className="flex items-center justify-center gap-4">
        {rec?.viewer_html_url && (
          <a
            href={rec.viewer_html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Box className="w-3 h-3" /> 3D view (optional) <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {rec?.snapshot_image_url && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Regenerate
          </button>
        )}
      </div>
      {open && (
        <ThreeTower3DViewer render={render} onClose={() => setOpen(false)} onSnapshot={handleSnapshot} />
      )}
    </>
  );
}