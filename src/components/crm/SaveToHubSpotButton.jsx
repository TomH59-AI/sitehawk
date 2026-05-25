/**
 * SaveToHubSpotButton — primary CTA used on the property comparison panel
 * and individual target cards. Opens SaveToHubSpotModal; once HubSpot
 * returns success, flips into a green "Saved to Pipeline" state.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Network } from "lucide-react";
import SaveToHubSpotModal from "./SaveToHubSpotModal";

export default function SaveToHubSpotButton({ target, towerHeightFt, variant = "default", size = "sm", className = "" }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!target) return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size={size}
        variant={saved ? "outline" : variant}
        className={`gap-1.5 ${
          saved
            ? "border-emerald-500 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
            : "bg-orange-600 hover:bg-orange-700 text-white border-orange-600"
        } ${className}`}
      >
        {saved ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Saved to Pipeline
          </>
        ) : (
          <>
            <Network className="w-4 h-4" />
            Save to HubSpot Pipeline
          </>
        )}
      </Button>

      <SaveToHubSpotModal
        open={open}
        onOpenChange={setOpen}
        target={target}
        towerHeightFt={towerHeightFt}
        onSaved={() => setSaved(true)}
      />
    </>
  );
}