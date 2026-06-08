import { Link } from "react-router-dom";
import { Zap, AlertTriangle } from "lucide-react";
import { useHawkScipUsage } from "@/lib/useHawkScipUsage";

// Persistent, always-visible HawkSCIP usage badge. Shows the user's tier +
// remaining SCIPs and routes to /plans-selection on click. Free users at 0 left
// get an amber "act now" treatment. Display-only — never gates the free scan.
export default function UsageBadge({ className = "" }) {
  const { usage } = useHawkScipUsage();
  if (!usage) return null;

  const { tier, label, window, limit, used, remaining } = usage;
  const unlimited = limit === Infinity;
  const isFree = tier === "free";
  const depleted = !unlimited && remaining <= 0;
  const attention = isFree && depleted;

  let text;
  if (unlimited) text = `${label} · Unlimited Rings`;
  else if (window === "lifetime") text = `${label} · ${remaining} Ring${remaining === 1 ? "" : "s"} left`;
  else text = `${label} · ${used} of ${limit} Rings this month`;

  const tone = attention
    ? "border-amber-400/60 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25"
    : depleted
      ? "border-amber-400/50 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
      : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20";

  return (
    <Link
      to="/plans-selection"
      title="View plans & upgrade"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${tone} ${className}`}
    >
      {attention ? <AlertTriangle className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
      <span className="whitespace-nowrap">{text}</span>
    </Link>
  );
}