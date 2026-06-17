import { CheckCircle2, XCircle, MinusCircle, Lock, Loader2, Clock, Radio } from "lucide-react";

const STYLE = {
  pass:    "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  fail:    "border-red-500/50 bg-red-500/10 text-red-300",
  skip:    "border-slate-500/30 bg-slate-500/10 text-slate-400",
  lock:    "border-slate-500/30 bg-slate-500/10 text-slate-400",
  stub:    "border-slate-500/30 bg-slate-500/10 text-slate-500",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  loading: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  unverified: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
};
const ICON = { pass: CheckCircle2, fail: XCircle, skip: MinusCircle, lock: Lock, stub: MinusCircle, pending: Clock, loading: Loader2, unverified: Clock };

function Chip({ status, label, title }) {
  const Icon = ICON[status] || MinusCircle;
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${STYLE[status] || STYLE.skip}`}>
      <Icon className={`w-3.5 h-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

// Live compliance chips — height cap, setback, fall-zone, compound fit,
// residential separation, tower separation (FCC ASR + OpenCellID).
export default function ComplianceChips({ checks, residential, residentialAllowed, towerSeparation, towerSeparationLoading }) {
  const c = checks || {};
  const order = [
    ["height",   "Height cap"],
    ["setback",  "Setback"],
    ["fallZone", "Fall-zone containment"],
    ["compound", "Compound fit"],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {order.map(([k, fallback]) =>
        c[k] ? <Chip key={k} status={c[k].status} label={c[k].label || fallback} /> : null
      )}

      {/* Tower separation — now live via FCC ASR + OpenCellID */}
      {towerSeparationLoading ? (
        <Chip status="loading" label="Checking tower separation…" />
      ) : towerSeparation ? (
        <Chip
          status={towerSeparation.status}
          label={towerSeparation.status === "pass"
            ? `Tower sep. — ${(towerSeparation.nearest_distance_ft || 0).toLocaleString()}′`
            : towerSeparation.status === "fail"
            ? `Tower sep. FAIL — ${(towerSeparation.nearest_distance_ft || 0).toLocaleString()}′ (need ${(towerSeparation.required_ft || 0).toLocaleString()}′)`
            : `Tower sep. — ${towerSeparation.message || "no rule"}`}
          title={towerSeparation.message}
        />
      ) : (
        <Chip status="pending" label="Tower separation — run placement to check" />
      )}

      {/* Residential separation */}
      {!residentialAllowed ? (
        <Chip status="lock" label="Residential separation — HawkVision+" />
      ) : residential?.loading ? (
        <Chip status="loading" label="Checking residences…" />
      ) : residential?.result ? (
        <Chip status={residential.result.status} label={residential.result.label} title={residential.result.offendingAddress || undefined} />
      ) : (
        <Chip status="pending" label="Residential separation — confirm placement to check" />
      )}
    </div>
  );
}