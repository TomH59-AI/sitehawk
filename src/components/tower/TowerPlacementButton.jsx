import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Compass, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import TowerPlacementModal from "./TowerPlacementModal";

const ALLOWED_TIERS = ["hawkeye_20", "hawkeye_apex"];

export default function TowerPlacementButton({ parcel }) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setTier(u?.tier || "free")).catch(() => setTier("free"));
  }, []);

  const allowed = ALLOWED_TIERS.includes(tier);

  if (tier === null) return null;

  if (!allowed) {
    return (
      <Link to="/pricing">
        <Button variant="outline" size="sm" className="gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/10">
          <Lock className="w-3.5 h-3.5" />
          Tower Placement (20/20+)
        </Button>
      </Link>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" size="sm" className="gap-2 border-primary/30 text-primary hover:bg-primary/10">
        <Compass className="w-3.5 h-3.5" />
        Tower Placement
      </Button>
      <TowerPlacementModal open={open} onClose={() => setOpen(false)} parcel={parcel} />
    </>
  );
}