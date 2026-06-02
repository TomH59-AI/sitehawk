import { AlertTriangle } from "lucide-react";
import { SKYWAVE } from "@/lib/skywave";
import { isSectionStale, targetA } from "@/lib/scipTarget";

/**
 * Shows a "Target A changed — regenerate" warning when a section's stored output
 * was built for a different active_target_index than the one currently active.
 * Render it inside any SCIP section that stores flat-field output keyed by Target A.
 */
export default function SectionStaleBanner({ record, sectionKey, hasData }) {
  if (!isSectionStale(record, sectionKey, hasData)) return null;
  const t = targetA(record);
  return (
    <div
      className="flex items-start gap-2 text-sm rounded-lg p-3 mb-3"
      style={{ background: "#FEF3C7", color: "#92400E" }}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>
        Target A changed to <strong>{t?.label || "the new target"}</strong>. This section still shows data
        for the previous target — regenerate to rebuild it from the current Target A.
      </span>
    </div>
  );
}