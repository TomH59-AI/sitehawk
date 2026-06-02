import { notionSnapshotSync } from "@/functions/notionSnapshotSync";

/**
 * maybeSyncSnapshotToNotion — fire-and-forget Notion mirror for a snapshot.
 *
 * Call AFTER a DataSourceSnapshot is created/refreshed. Only runs when the
 * SCIP's `notion_snapshot_sync` toggle is on. Never throws — Notion is a mirror
 * only and must never block SCIP work.
 *
 * @param {object} record - the ScipRecord (needs id + notion_snapshot_sync)
 * @param {string} snapshotId - the DataSourceSnapshot id to mirror
 */
export function maybeSyncSnapshotToNotion(record, snapshotId) {
  if (!record?.notion_snapshot_sync || !snapshotId) return;
  const scip_link = `${window.location.origin}/scip/${record.id}`;
  notionSnapshotSync({ snapshot_id: snapshotId, scip_link }).catch(() => {
    // swallow — function itself records notion_sync_status='failed'
  });
}