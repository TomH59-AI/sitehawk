/**
 * Generate3DImageButton — links to the standalone Tower3DViewer page.
 * Passes live result data via router state so the viewer doesn't need a saved DB run.
 * Also passes the saved runId (if available) so the snapshot can be persisted.
 */
import { Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Generate3DImageButton({ runId, result, controls, parcel, disabled }) {
  const navigate = useNavigate();

  // Only show if there's a feasible result or a known run id
  if (!runId && (!result || result?.collapsed)) return null;

  const handleClick = () => {
    navigate("/tower-3d-viewer", {
      state: {
        runId: runId || null,
        liveResult: result ? {
          towerLonLat: result.towerLonLat,
          parcelGeojson: result.parcel?.geometry || null,
          centroidLat: result.towerLonLat?.[1] || null,
          centroidLon: result.towerLonLat?.[0] || null,
          towerHeightFt: controls?.heightFt || 150,
          compoundWidthFt: controls?.compoundW || 75,
          compoundDepthFt: controls?.compoundD || 75,
          towerType: "monopole",
          propertyAddress: parcel?.addressFull || parcel?.apn || null,
          parcelId: parcel?.apn || null,
        } : null,
      },
    });
  };

  return (
    <Button
      size="sm"
      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold gap-2"
      onClick={handleClick}
      disabled={disabled}
    >
      <Box className="w-3.5 h-3.5" />
      Generate 3D Image
    </Button>
  );
}