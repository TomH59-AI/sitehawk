import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { generatePropertyInfoTargets } from "@/functions/generatePropertyInfoTargets";
import SoaringHawkLoader from "@/components/ui/SoaringHawkLoader";

export default function GeneratePropertyInfoButton({ lat, lon, towerHeightFt, setbackFt, searchId, onComplete }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    if (lat == null || lon == null) {
      toast({ title: "Missing coordinates", description: "Open a SCIP with a candidate first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await generatePropertyInfoTargets({
        lat,
        lon,
        tower_height_ft: towerHeightFt || 199,
        setback_ft: setbackFt || 50,
        search_id: searchId || null,
      });
      const data = res.data;
      if (data?.error) {
        toast({ title: "No qualifying parcels", description: data.error, variant: "destructive" });
      } else {
        toast({
          title: `Generated ${data.targets.length} targets`,
          description: `Target A skip-traced. ${data.saved_deal_ids?.length || 0} CRM deals saved.`,
        });
        onComplete?.(data);
        setTimeout(() => {
          document.getElementById("scip-property-info-targets")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 200);
      }
    } catch (e) {
      toast({ title: "Generation failed", description: e?.message || "Unknown error", variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-2 min-w-[260px]">
      <Button onClick={handleClick} disabled={loading} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? "Generating Targets…" : "Generate Property Info"}
      </Button>
      <SoaringHawkLoader
        active={loading}
        message="SiteHawk is scouting parcels & ranking targets..."
      />
    </div>
  );
}