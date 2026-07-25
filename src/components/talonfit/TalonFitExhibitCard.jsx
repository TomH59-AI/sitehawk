import { useMemo, useState } from "react";
import { Download, Loader2, Rotate3d, DraftingCompass } from "lucide-react";
import { toast } from "sonner";
import TalonFitTagline from "./TalonFitTagline";
import TalonFitSite3D from "./TalonFitSite3D";
import { generateSiteExhibitPdf, computeEnvelope } from "@/lib/talonfitExhibit";

const VERDICT_CHIP = {
  FITS: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  CONDITIONAL: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  DOES_NOT_FIT: "bg-red-500/15 text-red-400 border-red-500/40",
};
const VERDICT_LABEL = { FITS: "FITS", CONDITIONAL: "CONDITIONAL", DOES_NOT_FIT: "DOES NOT FIT" };

// Auto-drafted after each TalonFit run: to-scale PDF site exhibit download +
// interactive 3D site view (orbit / zoom) of the same certified geometry.
// exhibit: { parcelGeometry, envelopeGeometry?, compoundGeometry, fallZoneGeometry,
//            towerLngLat, setbackFt, verdict: "FITS"|"CONDITIONAL"|"DOES NOT FIT",
//            meta: { siteLabel, apn, jurisdiction, owner, heightFt, compoundW,
//                    compoundD, fallRadiusFt, setbackFt, runId } }
export default function TalonFitExhibitCard({ exhibit }) {
  const [busy, setBusy] = useState(false);

  const data = useMemo(() => {
    if (!exhibit?.parcelGeometry || !exhibit?.towerLngLat) return null;
    const m = exhibit.meta || {};
    const verdict = exhibit.verdict === "FITS" ? "FITS" : exhibit.verdict === "DOES NOT FIT" ? "DOES_NOT_FIT" : "CONDITIONAL";
    return {
      verdict,
      parcel: exhibit.parcelGeometry,
      envelope: exhibit.envelopeGeometry || computeEnvelope(exhibit.parcelGeometry, exhibit.setbackFt || 25),
      compound: exhibit.compoundGeometry || null,
      fallZone: exhibit.fallZoneGeometry || null,
      towerLngLat: exhibit.towerLngLat,
      towerHeightFt: Number(m.heightFt) || 199,
      fallRadiusFt: Number(m.fallRadiusFt) || Number(m.heightFt) || 199,
      meta: {
        address: m.siteLabel || null,
        apn: m.apn || null,
        jurisdiction: m.jurisdiction || null,
        compoundW: Number(m.compoundW) || 0,
        compoundD: Number(m.compoundD) || 0,
        source: m.runId ? `TalonFit® Run ${String(m.runId).slice(0, 8).toUpperCase()}` : "TalonFit®",
      },
    };
  }, [exhibit]);

  if (!data) return null;

  const download = () => {
    setBusy(true);
    try {
      generateSiteExhibitPdf(data);
    } catch (e) {
      console.error("Site exhibit PDF failed:", e);
      toast.error("Could not draft the site exhibit PDF.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 font-heading font-bold text-sm text-foreground">
          <DraftingCompass className="w-5 h-5 shrink-0 text-primary" />
          TalonFit® Site Exhibit
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${VERDICT_CHIP[data.verdict]}`}>
            {VERDICT_LABEL[data.verdict]}
          </span>
        </div>
        <button
          onClick={download}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground text-xs font-bold px-3 py-1.5 transition-colors"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Site Exhibit (PDF)
        </button>
      </div>

      <div className="rounded-lg overflow-hidden border border-border h-[320px] relative">
        <TalonFitSite3D
          parcel={data.parcel}
          envelope={data.envelope}
          compound={data.compound}
          fallZone={data.fallZone}
          towerLngLat={data.towerLngLat}
          towerHeightFt={data.towerHeightFt}
          fallRadiusFt={data.fallRadiusFt}
          verdict={data.verdict}
        />
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/55 text-white/85 text-[10px] px-2 py-1 pointer-events-none">
          <Rotate3d className="w-3 h-3" /> Drag to orbit · scroll to zoom
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground leading-snug">
        To-scale from the TalonFit run: boundary, buildable envelope, compound, fall zone and tower at {Math.round(data.towerHeightFt)} ft. Preliminary exhibit — not a survey.
      </p>
      <TalonFitTagline />
    </div>
  );
}