import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Image, Loader2 } from "lucide-react";
import { generateMapExhibit } from "@/functions/generateMapExhibit";
import { useToast } from "@/components/ui/use-toast";
import MapExhibitPreview from "@/components/hawkfit/MapExhibitPreview";

// HawkFit Map — generates a static map exhibit and shows it inline, ready to print.
export default function ExportMapButton({ siteTarget, towerLngLat, fit, disabled, scenarioId }) {
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const { toast } = useToast();

  const handleExport = async () => {
    setBusy(true);
    try {
      const res = await generateMapExhibit({
        tower_lat: towerLngLat[1],
        tower_lon: towerLngLat[0],
        parcel_geometry: siteTarget?.parcel_geometry || null,
        fall_zone: fit?.fallZone || null,
        compound: fit?.compound || null,
        site_target_id: siteTarget?.id || null,
        tower_scenario_id: scenarioId || null,
      });
      setImageUrl(res.data.image_url);
    } catch (e) {
      toast({ title: "Export failed", description: e?.response?.data?.error || e.message, variant: "destructive" });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={handleExport} disabled={disabled || busy} className="w-full">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
        {imageUrl ? "Regenerate Map Exhibit" : "Export Map Exhibit"}
      </Button>
      {imageUrl && (
        <MapExhibitPreview
          imageUrl={imageUrl}
          label={siteTarget?.address || siteTarget?.parcel_id || "Tower Site"}
          onClose={() => setImageUrl(null)}
        />
      )}
    </div>
  );
}