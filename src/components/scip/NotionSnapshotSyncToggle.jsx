import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";

// Per-SCIP toggle: "Sync snapshot summaries to Notion".
// Base44 DataSourceSnapshot stays the source of truth; Notion is a read-only
// human audit mirror. Turning this on only affects FUTURE snapshot writes
// (and any manual re-sync); it never blocks SCIP work.
export default function NotionSnapshotSyncToggle({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const on = !!record?.notion_snapshot_sync;

  async function toggle(next) {
    setBusy(true);
    try {
      const updated = await base44.entities.ScipRecord.update(record.id, { notion_snapshot_sync: next });
      onUpdate?.(updated);
      toast.success(next ? "Snapshot summaries will sync to Notion" : "Notion snapshot sync turned off");
    } catch {
      toast.error("Couldn't update the Notion sync setting");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4 bg-card" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-start gap-2.5 min-w-0">
        <BookOpen className="w-4 h-4 mt-0.5 shrink-0" style={{ color: SKYWAVE.blue }} />
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: SKYWAVE.navy }}>Sync snapshot summaries to Notion</div>
          <p className="text-xs mt-0.5" style={{ color: SKYWAVE.muted }}>
            Optional human-readable audit mirror for the team. Base44 stays the source of truth — only sanitized summaries are sent (no secrets, keys, payment data or raw API responses). If Notion is unavailable, your SCIP data is unaffected.
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