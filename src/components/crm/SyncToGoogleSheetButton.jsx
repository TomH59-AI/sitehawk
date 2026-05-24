import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, Loader2, ExternalLink } from "lucide-react";
import { syncParcelsToGoogleSheet } from "@/functions/syncParcelsToGoogleSheet";
import { useToast } from "@/components/ui/use-toast";

export default function SyncToGoogleSheetButton() {
  const [loading, setLoading] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(null);
  const { toast } = useToast();

  const handleSync = async () => {
    setLoading(true);
    try {
      const res = await syncParcelsToGoogleSheet({});
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setSheetUrl(data.spreadsheet_url);
      toast({
        title: "Synced to Google Sheet",
        description: `${data.rows_synced} parcels written.`,
      });
    } catch (e) {
      toast({
        title: "Sync failed",
        description: e.message || "Could not sync to Google Sheet.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleSync}
        disabled={loading}
        className="gap-2 font-heading font-semibold"
        variant="outline"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sheet className="w-4 h-4" />}
        {loading ? "Syncing..." : "Sync to Google Sheet"}
      </Button>
      {sheetUrl && (
        <a
          href={sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Open <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}