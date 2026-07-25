import { useState } from "react";
import { Ruler, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { downloadTalonFitExhibit } from "@/lib/talonfitExhibit";

const VERDICT_CHIP = {
  "FITS": "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
  "CONDITIONAL": "bg-amber-500/15 text-amber-500 border-amber-500/40",
  "DOES NOT FIT": "bg-red-500/15 text-red-500 border-red-500/40",
};

// Auto-drafted after each TalonFit run: a to-scale PDF site exhibit of the
// boundary, buildable envelope, compound, fall zone, tower, access easement,
// scale bar, north arrow and the verdict.
export default function TalonFitExhibitCard({ exhibit }) {
  const [busy, setBusy] = useState(false);
  if (!exhibit?.towerLngLat) return null;
  const verdict = exhibit.verdict || "CONDITIONAL";

  const download = () => {
    setBusy(true);
    try {
      downloadTalonFitExhibit(exhibit);
    } catch (e) {
      console.error("Site exhibit draft failed:", e);
      toast.error("Could not draft the site exhibit.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 font-heading font-bold text-sm text-foreground">
          <Ruler className="w-5 h-5 text-primary shrink-0" />
          Site Exhibit Drafted
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${VERDICT_CHIP[verdict] || VERDICT_CHIP.CONDITIONAL}`}>{verdict}</span>
        </div>
        <button
          onClick={download}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground text-xs font-bold px-3 py-1.5 transition-colors"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          Site Exhibit (PDF)
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        To-scale drawing: property boundary, setback envelope, compound, fall zone, tower location, access easement, scale bar &amp; north arrow.
      </p>
    </div>
  );
}