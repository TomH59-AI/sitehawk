/**
 * TargetComparisonTable — Side-by-side comparison of Targets A / B / C.
 *
 * Renders one column per target with parcel stats + zoning details so the
 * operator can pick a final selection at a glance. The winning cell in each
 * row is highlighted in amber (largest acreage, highest score, etc.).
 *
 * Pure presentation — reuses the `targets` array from PropertyInfoTargetsBlock.
 */

import { Trophy, GitCompare } from "lucide-react";

// Numeric rows where a "higher is better" highlight is meaningful.
const NUMERIC_HIGHER_BETTER = new Set(["score", "parcel_size_acres"]);

const ROWS = [
  { key: "score", label: "Match Score" },
  { key: "parcel_size_acres", label: "Parcel Size (acres)", fmt: (v) => (v != null ? `${v} ac` : null) },
  { key: "zoning_classification", label: "Zoning" },
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "owner_name", label: "Owner" },
  { key: "parcel_address", label: "Address" },
  { key: "parcel_id", label: "Parcel ID" },
  { key: "owner_mailing_address", label: "Mailing Address" },
  {
    key: "coords",
    label: "Coordinates",
    derive: (t) =>
      t.latitude != null && t.longitude != null
        ? `${Number(t.latitude).toFixed(5)}, ${Number(t.longitude).toFixed(5)}`
        : null,
  },
  { key: "phone", label: "Phone (skip trace)" },
];

function getValue(target, row) {
  if (row.derive) return row.derive(target);
  const raw = target[row.key];
  return row.fmt ? row.fmt(raw) : raw;
}

function findWinner(targets, rowKey) {
  if (!NUMERIC_HIGHER_BETTER.has(rowKey)) return null;
  let bestIdx = -1;
  let bestVal = -Infinity;
  targets.forEach((t, i) => {
    const n = Number(t[rowKey]);
    if (Number.isFinite(n) && n > bestVal) {
      bestVal = n;
      bestIdx = i;
    }
  });
  return bestIdx;
}

export default function TargetComparisonTable({ targets }) {
  if (!targets || targets.length < 2) return null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-800 text-white flex items-center gap-2">
        <GitCompare className="w-4 h-4 text-amber-400" />
        <h3 className="font-heading font-semibold text-sm tracking-wide">
          SIDE-BY-SIDE COMPARISON — TARGETS {targets.map((t) => t.label).join(" · ")}
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-40">
                Metric
              </th>
              {targets.map((t) => {
                const isA = t.label === "A";
                return (
                  <th
                    key={t.label}
                    className={`text-left px-3 py-2 text-xs font-semibold ${
                      isA ? "text-amber-700 bg-amber-50" : "text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {isA && <Trophy className="w-3.5 h-3.5" />}
                      Target {t.label}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const winnerIdx = findWinner(targets, row.key);
              return (
                <tr key={row.key} className="border-b border-border last:border-0 hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-xs font-medium text-slate-500 align-top">
                    {row.label}
                  </td>
                  {targets.map((t, i) => {
                    const val = getValue(t, row);
                    const isWinner = winnerIdx === i;
                    return (
                      <td
                        key={t.label}
                        className={`px-3 py-2 align-top text-sm break-words ${
                          isWinner ? "bg-amber-50 font-semibold text-amber-900" : "text-slate-900"
                        }`}
                      >
                        {val != null && val !== "" ? (
                          val
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2 bg-slate-50 border-t border-border text-[11px] text-slate-500 font-mono">
        Amber cells = best value in that row (higher score / larger parcel). Target A is the system's top pick.
      </div>
    </div>
  );
}