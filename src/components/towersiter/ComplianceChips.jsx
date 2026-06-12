import { CheckCircle2, XCircle, MinusCircle, Lock, Loader2, Clock } from "lucide-react";

const STYLE = {
  pass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  fail: "border-red-500/50 bg-red-500/10 text-red-300",
  skip: "border-slate-500/30 bg-slate-500/10 text-slate-400",
  lock: "border-slate-500/30 bg-slate-500/10 text-slate-400",
  stub: "border-slate-500/30 bg-slate-500/10 text-slate-500",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  loading: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
};
const ICON = { pass: CheckCircle2, fail: XCircle, skip: MinusCircle, lock: Lock, stub: MinusCircle, pending: Clock, loading: Loader2 };

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
// residential separation (HawkVision+, fires once on Confirm), tower separation (Phase 2 stub).
export default function ComplianceChips({ checks, residential, residentialAllowed }) {
  const c = checks || {};
  const order = [
    ["height", "Height cap"],
    ["setback", "Setback"],
    ["fallZone", "Fall-zone containment"],
    ["compound", "Compound fit"],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {order.map(([k, fallback]) =>
        c[k] ? <Chip key={k} status={c[k].status} label={c[k].label || fallback} /> : null
      )}
      {!residentialAllowed ? (
        <Chip status="lock" label="Residential separation — HawkVision+" />
      ) : residential?.loading ? (
        <Chip status="loading" label="Checking residences…" />
      ) : residential?.result ? (
        <Chip status={residential.result.status} label={residential.result.label} title={residential.result.offendingAddress || undefined} />
      ) : (
        <Chip status="pending" label="Residential separation — confirm placement to check" />
      )}
      <Chip status="stub" label="Tower separation — Phase 2 (FCC ASR)" />
    </div>
  );
}