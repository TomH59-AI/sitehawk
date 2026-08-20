import { useState } from "react";
import { Loader2, Table2, FileDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { scipBookSheet } from "@/functions/scipBookSheet";
import { ensureScipQcPass, isScipQcPass } from "@/lib/scipQcGate";
import { buildPropertySections, buildMapPages } from "./scipBookData";

export default function BookSheetExport({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const gs = record?.gsheet;
  const releaseReady = isScipQcPass(record);

  const sync = async () => {
    setBusy(true);
    try {
      const qc = await ensureScipQcPass(record, { repairAllowed: true });
      const audited = qc.record || record;
      onUpdate?.(audited);
      const res = await scipBookSheet({
        scip_id: audited.id,
        sections: buildPropertySections(audited),
        map_pages: buildMapPages(audited),
      });
      const data = res?.data;
      if (!data?.ok) throw new Error(data?.error || "Sheet generation failed");
      onUpdate?.({ ...audited, gsheet: data.gsheet });
      toast.success("QC-passed Google Sheet SCIP ready");
      window.open(data.gsheet.url, "_blank");
    } catch (error) {
      toast.error(error.message || "OpenRouter QC blocked the Google Sheet release");
      if (error.qcRecord) onUpdate?.(error.qcRecord);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {releaseReady && gs?.url && (
        <>
          <a href={gs.url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-white border"
            style={{ borderColor: "#188038", color: "#188038" }}>
            <Table2 className="w-4 h-4" /> Live Sheet
          </a>
          <a href={gs.pdf_url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-white border"
            style={{ borderColor: "#b3261e", color: "#b3261e" }}>
            <FileDown className="w-4 h-4" /> PDF
          </a>
        </>
      )}
      <button onClick={sync} disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: "#188038" }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : gs ? <RefreshCw className="w-4 h-4" /> : <Table2 className="w-4 h-4" />}
        {busy ? "QC + Building…" : gs ? "QC + Refresh Sheet" : "QC + Google Sheet"}
      </button>
    </div>
  );
}
