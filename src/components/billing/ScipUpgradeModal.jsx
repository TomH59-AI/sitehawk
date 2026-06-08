import { useNavigate } from "react-router-dom";
import { Zap, Check } from "lucide-react";

// Upgrade prompt shown when SCIP generation returns HTTP 402 (over the HawkSCIP
// limit). This is the primary conversion moment — it reads the server payload
// { error, tier, used, limit } and routes the user to /plans-selection.
// Scanning is never gated — only SCIP generation.
const PLAN_OPTIONS = [
  { name: "Hawk Site", price: "$249/mo", detail: "15 Search Rings / month" },
  { name: "Hawkeyes", price: "$599/mo", detail: "40 Search Rings / month" },
  { name: "Hawkeye Apex", price: "Contact us", detail: "Unlimited Search Rings" },
];

export default function ScipUpgradeModal({ quota, onClose }) {
  const navigate = useNavigate();
  if (!quota) return null;

  const goToPlans = () => {
    onClose?.();
    navigate("/plans-selection");
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl border border-cyan-700/40 bg-slate-950 p-7 shadow-2xl shadow-cyan-950/40">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">
          <Zap className="w-4 h-4" />
          You're out of Search Rings
        </div>

        <h2 className="mt-3 text-2xl font-bold leading-tight text-slate-50">
          Upgrade to keep generating
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {quota.error || "You've reached your Search Ring limit."} Each Search Ring
          delivers all three AI-selected targets (A, B & C) in one SCIP bundle. Pick a
          plan to keep working rings — your scans and SARF maps stay free.
        </p>

        {quota.limit != null && quota.used != null && (
          <div className="mt-4 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
            <span className="text-slate-500">Current usage:</span>{" "}
            <span className="font-mono text-cyan-300">{quota.used}</span>
            <span className="text-slate-500"> / </span>
            <span className="font-mono text-cyan-300">{quota.limit}</span>
            <span className="text-slate-500"> Search Rings{quota.tier ? ` · ${quota.tier}` : ""}</span>
          </div>
        )}

        {/* Tier options — the clear next step */}
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {PLAN_OPTIONS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={goToPlans}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-left transition-all hover:border-cyan-600/60 hover:bg-slate-900"
            >
              <div className="text-sm font-semibold text-slate-100">{p.name}</div>
              <div className="text-base font-bold text-cyan-300">{p.price}</div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                <Check className="w-3 h-3 text-cyan-400" />
                {p.detail}
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={goToPlans}
          className="mt-6 w-full rounded-xl bg-cyan-400 px-4 py-3 text-base font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-300"
        >
          View Plans / Upgrade →
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full text-center text-xs font-medium text-slate-500 hover:text-slate-300"
        >
          Not now
        </button>
      </div>
    </div>
  );
}