/**
 * GeneratePhoto3DButton — launches the Photorealistic 3D Viewer from Tower Siter.
 * Shows upgrade modal for HawkSite tier users; passes all siting data via router state.
 */
import { useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useBilling } from "@/lib/useBilling";
import Photo3DUpgradeModal from "@/components/photorealistic3d/Photo3DUpgradeModal";

export default function GeneratePhoto3DButton({ result, controls, parcel, rules }) {
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
    // Extract landscape buffer from ordinance rules
    const landscapeBuffer = rules?.setback_ft || rules?.fall_zone_ft || 0;

    navigate("/photo-3d-viewer", {
      state: {
        lat: towerLat,
        lon: towerLon,
        controls: {
          heightFt: controls?.heightFt || 199,
          compoundW: controls?.compoundW || 75,
          compoundD: controls?.compoundD || 75,
        },
        parcelAddress: parcel?.addressFull || parcel?.apn || null,
        landscapeBuffer,
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
        Photorealistic 3D View
      </Button>

      <Photo3DUpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </>
  );
}