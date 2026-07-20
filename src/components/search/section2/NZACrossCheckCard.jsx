import { ExternalLink, Map } from "lucide-react";

/**
 * NZACrossCheckCard — free, legitimate cross-check against the National Zoning
 * Atlas public map (view-only; their data is licensed, so we link out rather
 * than pull it). Shown after a zoning run so the analyst can visually confirm
 * the district and treatment against a second independent source.
 */
export default function NZACrossCheckCard({ jurisdiction, lat, lon }) {
  return (
    <div className="mx-4 my-3 rounded-lg border border-indigo-300/50 bg-indigo-50 dark:bg-indigo-950/20 px-4 py-3 flex items-start gap-3">
      <Map className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-semibold text-indigo-900 dark:text-indigo-200">
          Cross-check on the National Zoning Atlas
        </div>
        <div className="text-xs text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
          Independent, manually-verified zoning map covering thousands of U.S. jurisdictions.
          Search {jurisdiction ? <span className="font-mono font-medium">{jurisdiction}</span> : "the resolved jurisdiction"}
          {Number.isFinite(lat) && Number.isFinite(lon) && (
            <> or navigate to <span className="font-mono">{lat.toFixed(4)}, {lon.toFixed(4)}</span></>
          )}{" "}
          to confirm the district and permitted-use treatment. If it disagrees with the fields above, confirm with the planning department.
        </div>
        <a
          href="https://www.zoningatlas.org/atlas"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline"
        >
          Open National Zoning Atlas <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}