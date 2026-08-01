import { useState } from "react";
import { Loader2, Table2, FileDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { scipBookSheet } from "@/functions/scipBookSheet";
import { buildPropertySections, buildMapPages } from "./scipBookData";

// Google Sheets SCIP — builds/refreshes the live NEW SCIP 8.1.2026 sheet in the
// connected Google account and surfaces the shareable URL + letter PDF link.
export default function BookSheetExport({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const gs = record?.gsheet;

  const sync = async () => {
    setBusy(true);
    try {
      const res = await scipBookSheet({
        scip_id: record.id,
        sections: buildPropertySections(record),
        map_pages: buildMapPages(record),
      });
      const d = res?.data;
      if (!d?.ok) throw new Error(d?.error || "Sheet generation failed");
      onUpdate?.({ ...record, gsheet: d.gsheet });
      toast.success("Google Sheet SCIP ready");
      window.open(d.gsheet.url, "_blank");
    } catch (e) {
      toast.error(e.message || "Could not build the Google Sheet");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {gs?.url && (
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
        {busy ? "Building…" : gs ? "Refresh Sheet" : "Google Sheet SCIP"}
      </button>
    </div>
  );
}