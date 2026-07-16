import { ExternalLink } from "lucide-react";
import { RESOURCE_TYPES, RESOURCE_STATUS, resourceTypeLabel } from "./registryConst";

/**
 * Link buttons for a jurisdiction's resources. Business rules enforced here:
 *  - A button renders ONLY when the resource has a real URL.
 *  - Broken/unavailable links never render as clickable official links.
 *  - Verified = green dot; needs_review = yellow dot (never shown as "Verified").
 */
export default function ResourceButtons({ resources }) {
  const order = RESOURCE_TYPES.map((t) => t.value);
  const usable = (resources || [])
    .filter((r) => r.active !== false && (r.url || "").trim() && !["broken", "unavailable"].includes(r.status))
    .sort(
      (a, b) =>
        order.indexOf(a.resource_type) - order.indexOf(b.resource_type) ||
        (a.priority || 0) - (b.priority || 0)
    );

  if (!usable.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No verified links on file yet for this jurisdiction — an admin can add them in the Jurisdiction Resource Manager.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {usable.map((r) => {
        const s = RESOURCE_STATUS[r.status] || RESOURCE_STATUS.needs_review;
        return (
          <a
            key={r.id}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${r.title || resourceTypeLabel(r.resource_type)} — ${s.label}${r.verified_on ? ` (${r.verified_on})` : ""}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-xs font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
            {resourceTypeLabel(r.resource_type)}
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>
        );
      })}
    </div>
  );
}