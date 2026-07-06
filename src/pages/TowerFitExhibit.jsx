/* Tower Fit Exhibit (FIGMA-SKILL) — standalone, to-scale landlord-facing exhibit.
 * No pipeline, no Supabase, no APIs — dimensions in, PDF/SVG/PNG out. */
import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, FileText, Image as ImageIcon, PencilRuler } from "lucide-react";
import { DEFAULT_CONFIG, computeExhibit, VERDICT_META } from "@/lib/towerFitExhibit";
import ExhibitIntakeForm from "@/components/towerfit/ExhibitIntakeForm";
import ExhibitSheet from "@/components/towerfit/ExhibitSheet";
import { downloadPDF, downloadSVG, downloadPNG } from "@/components/towerfit/exportExhibit";

export default function TowerFitExhibit() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [busy, setBusy] = useState(false);
  const svgRef = useRef(null);

  const model = useMemo(() => computeExhibit(config), [config]);
  const meta = VERDICT_META[model.verdict];
  const fileBase = `${(config.siteName || "site").replace(/[^a-z0-9]+/gi, "_")}_TowerFit`;

  const doExport = async (fn, label) => {
    if (!svgRef.current) return;
    setBusy(true);
    try {
      await fn(svgRef.current, fileBase);
    } catch (e) {
      toast.error(`${label} export failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground flex items-center gap-2">
            <PencilRuler className="w-6 h-6 text-primary" /> Tower Fit Exhibit
          </h1>
          <p className="text-sm text-muted-foreground">
            To-scale concept exhibit — boundary, setbacks, compound, fall zone, verdict. Standalone: no data leaves this page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => doExport(downloadPDF, "PDF")} disabled={busy}>
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => doExport(downloadSVG, "SVG")} disabled={busy}>
            <Download className="w-4 h-4 mr-1" /> SVG (Figma)
          </Button>
          <Button size="sm" variant="outline" onClick={() => doExport(downloadPNG, "PNG")} disabled={busy}>
            <ImageIcon className="w-4 h-4 mr-1" /> PNG
          </Button>
        </div>
      </div>

      {/* live verdict strip */}
      <div className="rounded-xl border px-4 py-2.5 text-sm font-semibold flex items-center gap-3"
        style={{ borderColor: meta.color, background: `${meta.color}14`, color: meta.color }}>
        <span className="text-base font-bold tracking-wide">{meta.label}</span>
        <span className="text-foreground/80 font-normal">{model.verdictReason}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[400px,1fr] gap-4 items-start">
        <div className="rounded-2xl border border-border bg-card p-4">
          <ExhibitIntakeForm config={config} onChange={setConfig} />
        </div>
        <div className="rounded-2xl border border-border overflow-hidden shadow-sm bg-white">
          <ExhibitSheet ref={svgRef} model={model} config={config} />
        </div>
      </div>
    </div>
  );
}