/**
 * GeneratePhoto3DButton — launches the Photorealistic 3D Tower Siter Exhibit.
 * Passes full siting GeoJSON overlays so the 3D viewer renders the real
 * deterministic siting geometry on top of Google Photorealistic 3D Tiles.
 */
import { useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useBilling } from "@/lib/useBilling";
import Photo3DUpgradeModal from "@/components/photorealistic3d/Photo3DUpgradeModal";

export default function GeneratePhoto3DButton({
  result,
  controls,
  parcel,
  rules,
  // TowerSitingRun fields — GeoJSON overlays and metadata
  sitingRun,
}) {
  const navigate = useNavigate();
  const { tierKey, admin, loading } = useBilling();
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!result || result.collapsed) return null;

  const towerLon = result.towerLonLat?.[0];
  const towerLat = result.towerLonLat?.[1];
  if (!towerLon || !towerLat) return null;

  // HawkSite tiers blocked
  const blocked = !loading && !admin && (tierKey === "free" || tierKey === "hawk_site" || tierKey === "hawk_site_law");

  const handleClick = () => {
    if (blocked) { setShowUpgrade(true); return; }
    const landscapeBuffer = rules?.setback_ft || rules?.fall_zone_ft || 0;

    navigate("/photo-3d-viewer", {
      state: {
        lat: towerLat,
        lon: towerLon,
        controls: {
          heightFt: controls?.heightFt || sitingRun?.tower_height_ft || 199,
          compoundW: controls?.compoundW || sitingRun?.compound_width_ft || 75,
          compoundD: controls?.compoundD || sitingRun?.compound_depth_ft || 75,
          towerType: sitingRun?.tower_type || "monopole",
        },
        parcelAddress: parcel?.addressFull || parcel?.apn || null,
        landscapeBuffer,
        // GeoJSON overlays from TowerSitingRun
        sitingGeojson: {
          parcelBoundary: sitingRun?.parcel_geometry || null,
          candidateArea: sitingRun?.candidate_area_geojson || null,
          compoundGeojson: sitingRun?.compound_geojson || null,
          fallZone: sitingRun?.fall_zone_geojson || null,
          conflictLayers: sitingRun?.conflict_layers_geojson || null,
        },
        // Metadata for the exhibit header
        sitingMeta: {
          towerSitingRunId: sitingRun?.id || null,
          resultClass: sitingRun?.result_class || null,
          feasible: sitingRun?.feasible ?? null,
          jurisdictionName: sitingRun?.jurisdiction_name || null,
          towerHeightFt: sitingRun?.tower_height_ft || controls?.heightFt || 199,
        },
      },
    });
  };

  return (
    <>
      <Button
        size="sm"
        className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold gap-2 border-0"
        onClick={handleClick}
        disabled={loading}
      >
        <Globe className="w-3.5 h-3.5" />
        3D Exhibit
      </Button>

      <Photo3DUpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </>
  );
}