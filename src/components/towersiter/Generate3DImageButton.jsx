/**
 * Generate3DImageButton — links to the standalone Tower3DViewer page.
 * Passes live result data via router state so the viewer doesn't need a saved DB run.
 * Also passes the saved runId (if available) so the snapshot can be persisted.
 */
import { useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import ThreeTower3DViewer from "@/components/towersiter/ThreeTower3DViewer";

export default function Generate3DImageButton({ runId, result, controls, parcel, sitingRun, disabled }) {
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(null);

  // Only show if there's a feasible result
  if (!runId && (!result || result?.collapsed)) return null;

  const towerLonLat = result?.towerLonLat;
  if (!towerLonLat?.[0] || !towerLonLat?.[1]) return null;

  function handleClick() {
    const renderRec = {
      id: null,
      tower_siting_run_id: runId || null,
      property_address: parcel?.addressFull || parcel?.parcel_address || parcel?.apn || sitingRun?.property_address || null,
      site_name: parcel?.addressFull || sitingRun?.property_address || "Target A",
      parcel_id: parcel?.apn || sitingRun?.parcel_id || null,
      parcel_acres: parcel?.acreage || sitingRun?.parcel_acres || null,
      centroid_lat: towerLonLat[1],
      centroid_lon: towerLonLat[0],
      parcel_geojson: result?.parcel?.geometry || result?.parcel || null,
      tower_type: sitingRun?.tower_type || "monopole",
      tower_height_ft: Number(controls?.heightFt) || sitingRun?.tower_height_ft || 199,
      compound_width_ft: Number(controls?.compoundW) || sitingRun?.compound_width_ft || 100,
      compound_depth_ft: Number(controls?.compoundD) || sitingRun?.compound_depth_ft || 100,
      // terrain / landscape context from parcel/rules
      terrain_description: parcel?.land_use
        ? `${parcel.land_use} land with surrounding native vegetation`
        : null,
      landscape_description: null,
      snapshot_image_url: null,
    };
    setRender(renderRec);
    setOpen(true);
  }

  return (
    <>
      <Button
        size="sm"
        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold gap-2"
        onClick={handleClick}
        disabled={disabled}
      >
        <ImageIcon className="w-3.5 h-3.5" />
        Generate Site Illustration
      </Button>

      {open && render && (
        <ThreeTower3DViewer
          render={render}
          onClose={() => setOpen(false)}
          onSnapshot={() => {}}
        />
      )}
    </>
  );
}