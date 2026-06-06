import { useNavigate } from "react-router-dom";

// Upgrade prompt shown when SCIP generation returns HTTP 402 (over monthly
// SCIP limit). Reads the server payload { error, tier, used, limit } and routes
// the user to the PlansSelection page. Scanning is never gated — only SCIPs.
export default function ScipUpgradeModal({ quota, onClose }) {
  const navigate = useNavigate();
  if (!quota) return null;

  const goToPlans = () => {
    onClose?.();
    navigate("/plans-selection");
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 px-4">
      <div className="w-full max-w-md rounded-2xl border border-cyan-900/50 bg-slate-950 p-6 shadow-2xl shadow-cyan-950/30">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
          SCIP limit reached
        </div>
        <h2 className="text-xl font-semibold text-slate-100">Upgrade SiteHawk</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {quota.error || "You've reached your monthly SCIP limit."}
        </p>
        {quota.limit != null && quota.used != null && (
          <div className="mt-4 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
            <span className="text-slate-500">Current usage:</span>{" "}
            <span className="font-mono text-cyan-300">{quota.used}</span>
            <span className="text-slate-500"> / </span>
            <span className="font-mono text-cyan-300">{quota.limit}</span>
            <span className="text-slate-500"> SCIPs{quota.tier ? ` · ${quota.tier}` : ""}</span>
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-900"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={goToPlans}
            className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
          >
            View plans
          </button>
        </div>
      </div>
    </div>
  );
}