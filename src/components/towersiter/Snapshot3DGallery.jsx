/**
 * Snapshot3DGallery — shows saved 3D frame captures for a Tower3DRender record.
 * Embeds in the landowner packet / SCIP exhibit view.
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, ExternalLink, Box } from "lucide-react";
import { format } from "date-fns";

export default function Snapshot3DGallery({ towerId, snapshotUrl, refreshKey }) {
  // towerId: Tower3DRender record id
  // snapshotUrl: the current snapshot_image_url (passed directly to avoid extra fetch)
  // refreshKey: bump this to force a re-check after a new snapshot is saved

  const [url, setUrl] = useState(snapshotUrl || null);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUrl(snapshotUrl || null);
  }, [snapshotUrl, refreshKey]);

  // Fetch the record for the viewer link (and snapshot if not passed directly)
  useEffect(() => {
    if (!towerId) return;
    if (!url) setLoading(true);
    base44.entities.Tower3DRender.filter({ id: towerId })
      .then((rows) => {
        const rec = rows?.[0];
        if (rec?.snapshot_image_url) setUrl((u) => u || rec.snapshot_image_url);
        if (rec?.viewer_html_url) setViewerUrl(rec.viewer_html_url);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [towerId, refreshKey]);

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
      <Camera className="w-3.5 h-3.5 animate-pulse" /> Loading 3D snapshot…
    </div>
  );

  if (!url) return null;

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-200 dark:border-indigo-800">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          <Camera className="w-3.5 h-3.5" />
          3D Tower Concept (HawkPerch)
        </div>
        <div className="flex items-center gap-3">
          {viewerUrl && (
            <a
              href={viewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <Box className="w-3 h-3" /> Open 3D Viewer
            </a>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Open full size
          </a>
        </div>
      </div>

      {/* Image */}
      <img
        src={url}
        alt="3D Tower Concept"
        className="w-full object-cover"
        style={{ maxHeight: 320 }}
      />

      {/* Disclaimer footer — always present */}
      <div className="px-3 py-2 text-[10px] text-indigo-600 dark:text-indigo-400 leading-snug">
        ILLUSTRATIVE CONCEPT — NOT A SURVEY. Parcel outline and tower height are to scale; compound, fence, and landscaped buffer are shown at exaggerated scale. Final dimensions set after site walk &amp; survey.
      </div>
    </div>
  );
}