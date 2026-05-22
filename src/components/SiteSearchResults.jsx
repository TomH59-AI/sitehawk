import { useState } from "react";

export function SiteSearchResults({ searchResponse, onPlanSite, onNextBatch }) {
  if (!searchResponse) return null;
  const { results, totals, derivedGeometry, page } = searchResponse;

  if (!results || results.length === 0) {
    return (
      <div className="p-4 bg-white/95 rounded shadow text-sm">
        <div className="font-semibold mb-1">No buildable parcels found</div>
        <div className="text-gray-500">
          Checked {totals?.fetchedFromRealie ?? 0} nearby parcels.
          {totals?.excluded && (
            <ul className="mt-2 text-xs">
              <li>{totals.excluded.residentialUse} residential</li>
              <li>{totals.excluded.tooSmall} too small for compound + fall zone</li>
              <li>{totals.excluded.residentialZoning} residential zoning</li>
            </ul>
          )}
          <div className="mt-2">
            Try a wider radius, a lower tower height, or relax setback multiplier.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        {totals.eligibleAfterFilter} viable of {totals.fetchedFromRealie} checked ·
        showing {page.index * 3 + 1}–{page.index * 3 + results.length} ·
        min parcel {derivedGeometry.requiredAcres} ac
        ({derivedGeometry.setbackFt}-ft setback, {derivedGeometry.fallZoneRadiusFt}-ft fall zone)
      </div>

      {results.map((p) => (
        <CandidateCard key={p.parcelId} parcel={p} onPlanSite={onPlanSite} />
      ))}

      {totals.hasMore && (
        <button
          className="w-full px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
          onClick={onNextBatch}
        >
          Show next 3 candidates →
        </button>
      )}
    </div>
  );
}

function CandidateCard({ parcel: p, onPlanSite }) {
  const [expanded, setExpanded] = useState(false);
  const b = p.buildability;
  const scoreColor =
    b.cupRiskFlag === "low" ? "bg-green-100 text-green-800 border-green-300" :
    b.cupRiskFlag === "medium" ? "bg-yellow-100 text-yellow-800 border-yellow-300" :
    "bg-red-100 text-red-800 border-red-300";

  return (
    <div className="border rounded-lg p-3 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{p.addressFull || "(no assigned address)"}</div>
          <div className="text-xs text-gray-500">
            APN {p.parcelId} · {p.city}, {p.state} · {p.acres} ac · zoning {p.zoningCode || "—"}
          </div>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded border ${scoreColor}`}>
          {b.score}/100 · CUP risk {b.cupRiskFlag}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {b.reasons.slice(0, expanded ? b.reasons.length : 3).map((r, i) => (
          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200">
            {r}
          </span>
        ))}
        {b.reasons.length > 3 && (
          <button className="text-xs text-blue-600" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "less" : `+${b.reasons.length - 3} more`}
          </button>
        )}
      </div>

      <div className="mt-2 text-xs text-gray-600">
        Owner: <span className="font-medium">{p.ownerName}</span>
        {p.ownerMailing?.city && (
          <span className="text-gray-400"> · {p.ownerMailing.city}, {p.ownerMailing.state}</span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          className="flex-1 px-3 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold"
          onClick={() => onPlanSite(p)}
        >
          Plan this site →
        </button>
        <button className="px-3 py-2 rounded border text-sm" onClick={() => setExpanded((v) => !v)}>
          Details
        </button>
      </div>
    </div>
  );
}