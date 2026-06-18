/**
 * Generate3DImageButton — links to the standalone Tower3DViewer page.
 * Passes the TowerSitingRun id (from the current siting result) as a query param.
 * Falls back to the page's default (most recent feasible run) if no id is available.
 */
import { Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Generate3DImageButton({ runId, result, disabled }) {
  const navigate = useNavigate();

  // Only show if there's a feasible result or a known run id
  if (!runId && (!result || result?.collapsed)) return null;

  const handleClick = () => {
    const path = runId
      ? `/tower-3d-viewer?runId=${runId}`
      : "/tower-3d-viewer";
    navigate(path);
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