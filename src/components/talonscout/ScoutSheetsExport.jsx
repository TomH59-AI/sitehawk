import { useState } from "react";
import { ExternalLink, Loader2, Sheet } from "lucide-react";
import { syncParcelsToGoogleSheet } from "@/functions/syncParcelsToGoogleSheet";

export default function ScoutSheetsExport({ targets, center }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const exportTargets = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const { data } = await syncParcelsToGoogleSheet({ targets, center });
      setStatus(data);
    } catch (error) {
      setStatus({ error: error?.response?.data?.error || error.message || "Google Sheets export failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3">
      <button onClick={exportTargets} disabled={loading || !targets.length} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sheet className="h-4 w-4" />}
        Replace Google Sheets master list
      </button>
      <p className="text-[11px] text-muted-foreground">Replaces the current Candidates tab with all {targets.length} saved scout targets.</p>
      {status?.spreadsheet_url && <a href={status.spreadsheet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">Open master list <ExternalLink className="h-3.5 w-3.5" /></a>}
      {status?.error && <p role="alert" className="text-xs font-medium text-destructive">{status.error}</p>}
    </div>
  );
}