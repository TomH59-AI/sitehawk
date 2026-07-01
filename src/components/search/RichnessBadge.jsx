import { useState } from "react";
import { sairPrecheck } from "@/functions/sairPrecheck";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

/**
 * RichnessBadge — S.A.I.R. Data Richness Gate pill.
 * Shows Regrid parcel-schema coverage for a county before spending API credits.
 *
 * Props: state (2-letter), county (string), threshold (default 70)
 */
export default function RichnessBadge({ state, county, threshold = 70 }) {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);

  if (!state || !county) return null;

  const check = async () => {
    setStatus("loading");
    try {
      const result = await sairPrecheck({ state, county, threshold });
      setData(result?.data ?? result);
      setStatus("done");
    } catch (e) {
      setStatus("error");
    }
  };

  const score = data?.richness_score ?? null;
  const proceed = data?.proceed ?? null;

  const pillColor =
    status === "loading" ? "bg-slate-500/20 text-slate-500 border-slate-400/40" :
    status === "error"   ? "bg-red-500/15 text-red-600 border-red-400/40" :
    status === "idle"    ? "bg-slate-500/15 text-slate-500 border-slate-400/30" :
    proceed              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-400/40" :
                           "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-400/40";

  const pillLabel =
    status === "idle"    ? "Check Data Richness" :
    status === "loading" ? "Checking…" :
    status === "error"   ? "Check Failed" :
    score != null        ? `${score}% Richness${proceed ? " ✓" : " ⚠"}` :
                           "No Data Found";

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        onClick={status === "idle" || status === "error" ? check : () => setExpanded((e) => !e)}
        disabled={status === "loading"}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold transition-all ${pillColor}`}
      >
        {status === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
        {pillLabel}
        {status === "done" && (
          expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </button>

      {status === "done" && expanded && data && (
        <div className="mt-1 rounded-xl border border-border bg-card p-3 text-xs space-y-2 shadow-sm min-w-[220px]">
          <div className="font-semibold text-foreground">{county} County, {state}</div>
          {data.message && <p className="text-muted-foreground">{data.message}</p>}
          {data.low_fields && data.low_fields.length > 0 && (
            <div>
              <div className="font-medium text-amber-600 dark:text-amber-400 mb-1">Low coverage fields:</div>
              <ul className="space-y-0.5">
                {data.low_fields.map((f) => (
                  <li key={f} className="font-mono text-muted-foreground">{f}</li>
                ))}
              </ul>
            </div>
          )}
          {data.pcts && Object.keys(data.pcts).length > 0 && (
            <div>
              <div className="font-medium text-foreground mb-1">Field coverage:</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {Object.entries(data.pcts).map(([field, pct]) => (
                  <div key={field} className="flex justify-between gap-2">
                    <span className="font-mono text-muted-foreground truncate">{field}</span>
                    <span className={pct >= threshold ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}