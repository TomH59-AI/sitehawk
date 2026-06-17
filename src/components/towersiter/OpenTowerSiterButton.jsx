/**
 * OpenTowerSiterButton — launches the Tower Siter page pre-loaded with
 * parcel data from a ScipRecord, SearchResult, or TowerVisualization.
 *
 * Usage:
 *   <OpenTowerSiterButton sourceType="scip" sourceId={scipRecord.id} parcelAddress={...} />
 *   <OpenTowerSiterButton sourceType="search" sourceId={searchResult.id} parcelAddress={...} />
 *
 * The button passes the source via URL params so TowerSiter can auto-load
 * the parcel when the user navigates there.
 */
import { useNavigate } from "react-router-dom";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OpenTowerSiterButton({ sourceType, sourceId, parcelAddress, variant = "outline", size = "sm", className = "" }) {
  const navigate = useNavigate();

  const handleClick = () => {
    // Pass source context via URL query params — TowerSiter reads them on mount
    const params = new URLSearchParams();
    if (sourceType) params.set("sourceType", sourceType);
    if (sourceId) params.set("sourceId", sourceId);
    navigate(`/tower-siter?${params.toString()}`);
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleClick}
      className={`gap-1.5 ${className}`}
      title={`Open Tower Siter${parcelAddress ? ` for ${parcelAddress}` : ""}`}
    >
      <Layers className="w-4 h-4" />
      Tower Siter
    </Button>
  );
}