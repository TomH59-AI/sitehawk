import { Loader2 } from "lucide-react";
import { isRegridSource } from "@/lib/regridEnrich";

/**
 * RegridSourceBadge — target column header badge.
 * Spinner while enrichment is in flight; "⚡ Regrid Confirmed" green badge when
 * Regrid data is present; subtle "Realie" label when the data is Realie-only.
 */
export default function RegridSourceBadge({ enrich, loading }) {
  if (loading) return <Loader2 className="w-3 h-3 animate-spin opacity-70" />;
  if (!enrich) return null;
  if (isRegridSource(enrich)) {
    return (
      <span className="inline-flex items-center text-[9px] font-bold normal-case tracking-normal px-1.5 py-0.5 rounded-full bg-emerald-500 text-white whitespace-nowrap">
        ⚡ Regrid Confirmed
      </span>
    );
  }
  return (
    <span className="text-[9px] font-medium normal-case tracking-normal opacity-60">
      Realie
    </span>
  );
}