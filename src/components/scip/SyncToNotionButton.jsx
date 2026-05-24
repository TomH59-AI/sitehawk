import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { syncZoningReportToNotion } from "@/functions/syncZoningReportToNotion";

/**
 * SyncToNotionButton — pushes a generated zoning report to the team's Notion
 * workspace as a new page under "SiteHawk Reports" (or the state zoning folder).
 *
 * Props:
 *   reportData: full response object from generateZoningPermitReport
 *   candidate: SearchResult / candidate metadata
 */
export default function SyncToNotionButton({ reportData, candidate }) {
  const [syncing, setSyncing] = useState(false);
  const [pageUrl, setPageUrl] = useState(null);

  const handleSync = async () => {
    if (!reportData?.report) {
      toast.error("No report data to sync yet");
      return;
    }
    setSyncing(true);
    try {
      const res = await syncZoningReportToNotion({
        report: reportData,
        candidate,
      });
      const { page_url, parent_used, error } = res.data || {};
      if (error) throw new Error(error);
      setPageUrl(page_url);
      toast.success(`Synced to Notion → ${parent_used}`);
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || "Notion sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (pageUrl) {
    return (
      <a
        href={pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 border border-purple-200 rounded-md px-3 py-1.5 transition-colors"
      >
        <CheckCircle2 className="w-4 h-4" />
        View in Notion
        <ExternalLink className="w-3 h-3" />
      </a>
    );
  }

  return (
    <Button
      onClick={handleSync}
      disabled={syncing}
      size="sm"
      className="bg-purple-600 hover:bg-purple-700 text-white"
    >
      {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      {syncing ? "Syncing…" : "Sync to Notion"}
    </Button>
  );
}