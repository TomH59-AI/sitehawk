import { CheckCircle2, XCircle } from "lucide-react";
import TalonFitTagline from "@/components/talonfit/TalonFitTagline";

/**
 * LiveSitingVerdict — updates live as the tower pin is dragged.
 * "May work" / "Will not work here" + clearance stats + failure reasons.
 * All thresholds are rule-driven (jurisdiction ordinance / engine result).
 */
export default function LiveSitingVerdict({ live, jurisdiction, rules, unverified }) {
  if (!live) return null;
  const ok = live.feasible;

  return (
    <div className={`rounded-xl border p-3 text-sm ${ok ? "border-emerald-500/50 bg-emerald-500/10" : "border-red-500/50 bg-red-500/10"}`}>
      <div className={`flex items-center gap-2 font-heading font-bold text-base ${ok ? "text-emerald-300" : "text-red-300"}`}>
        {ok ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
        {live.verdict}
      </div>

      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-white/75">
        <div>
          Property-line clearance:{" "}
          <b className={ok || live.clearanceFt == null || live.requiredFt == null || live.clearanceFt >= live.requiredFt ? "text-white" : "text-red-300"}>
            {live.clearanceFt != null ? `${live.clearanceFt} ft` : "—"}
          </b>
          {live.requiredFt != null && <span className="text-white/50"> / need {live.requiredFt} ft</span>}
        </div>
        <div>Fall zone: <b className="text-white">{live.fallRadiusFt != null ? `${live.fallRadiusFt} ft radius` : "—"}</b></div>
        <div>Compound: <b className="text-white">{live.compoundW} ft × {live.compoundD} ft</b></div>
      </div>

      {ok ? (
        <p className="mt-2 text-xs text-emerald-200/80">Preliminary 2D siting checks pass at this location.</p>
      ) : (
        <div className="mt-2">
          <p className="text-xs font-bold text-red-300 mb-1">Reasons:</p>
          <ul className="space-y-0.5 text-xs text-red-200/90 list-disc list-inside">
            {live.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <p className="mt-2 text-[10px] text-white/40">
        {unverified
          ? "No verified ordinance on file — conservative 1:1 height default applied. Preliminary only, not a survey or zoning determination."
          : `Using ${jurisdiction || "jurisdiction"} ordinance rules${rules?._raw?.last_verified_at ? ` last verified ${String(rules._raw.last_verified_at).slice(0, 10)}` : ""}. Preliminary only, not a survey or zoning determination.`}
      </p>
      <TalonFitTagline className="mt-1.5" />
    </div>
  );
}