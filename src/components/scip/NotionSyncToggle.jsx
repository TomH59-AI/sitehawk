import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";

// "Sync snapshot summaries to Notion" toggle for ScipDetail.
// Flips ScipRecord.notion_snapshot_sync. Notion is a human-readable review
// mirror only — Base44 DataSourceSnapshot stays the source of truth, and a
// failed Notion sync never blocks SCIP work.
export default function NotionSyncToggle({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const on = !!record?.notion_snapshot_sync;

  async function toggle(next) {
    setBusy(true);
    try {
      const updated = await base44.entities.ScipRecord.update(record.id, { notion_snapshot_sync: next });
      onUpdate(updated);
      toast.success(next ? "Snapshot summaries will sync to Notion" : "Notion snapshot sync turned off");
    } catch {
      toast.error("Couldn't update the Notion sync setting");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-white px-4 py-3" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-start gap-2.5 min-w-0">
        <BookOpen className="w-4 h-4 mt-0.5 shrink-0" style={{ color: SKYWAVE.blue }} />
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: SKYWAVE.navy }}>Sync snapshot summaries to Notion</div>
          <p className="text-xs" style={{ color: SKYWAVE.muted }}>
            Optional human-readable audit mirror. Only safe summaries sync — never secrets, keys, payment data, or raw API responses. Base44 stays the system of record; a failed sync won't block your SCIP.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {busy && <Loader2 className="w-4 h-4 animate-spin" style={{ color: SKYWAVE.muted }} />}
        <Switch checked={on} disabled={busy} onCheckedChange={toggle} />
      </div>
    </div>
  );
}