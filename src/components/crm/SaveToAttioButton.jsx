/**
 * SaveToAttioButton — parallels SaveToHubSpotButton. Opens SaveToAttioModal
 * (lease status + optional Apollo enrichment), and once Attio returns success
 * flips into a green "Synced to Attio" state. Never touches HubSpot code.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Boxes } from "lucide-react";
import SaveToAttioModal from "./SaveToAttioModal";

export default function SaveToAttioButton({ target, size = "sm", variant = "default", className = "" }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!target) return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        title="Sends this parcel + full SCIP/zoning/score data as a Deal in your Attio. Saves hours + helps you close faster. Included with your plan."
        size={size}
        variant={saved ? "outline" : variant}
        className={`gap-1.5 ${
          saved
            ? "border-emerald-500 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
            : "bg-violet-600 hover:bg-violet-700 text-white border-violet-600"
        } ${className}`}
      >
        {saved ? (
          <><CheckCircle2 className="w-4 h-4" /> Synced to Attio</>
        ) : (
          <><Boxes className="w-4 h-4" /> Save to Attio + Apollo</>
        )}
      </Button>

      <SaveToAttioModal
        open={open}
        onOpenChange={setOpen}
        target={target}
        onSaved={() => setSaved(true)}
      />
    </>
  );
}