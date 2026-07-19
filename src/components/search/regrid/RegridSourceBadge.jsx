import { Loader2 } from "lucide-react";
import { isRegridSource } from "@/lib/regridEnrich";

/**
 * RegridSourceBadge — target column header badge.
 * Spinner while enrichment is in flight; "⚡ Realie Confirmed" green badge when
 * verified Realie enrichment data is present.
 */
export default function RegridSourceBadge({ enrich, loading }) {
  if (loading) return <Loader2 className="w-3 h-3 animate-spin opacity-70" />;
  if (!enrich) return null;
  if (isRegridSource(enrich)) {
    return (
      <span className="inline-flex items-center text-[9px] font-bold normal-case tracking-normal px-1.5 py-0.5 rounded-full bg-emerald-500 text-white whitespace-nowrap">
        ⚡ Realie Confirmed
      </span>
    );
  }
  return (
    <span className="text-[9px] font-medium normal-case tracking-normal opacity-60">
      Realie
    </span>
  );
}