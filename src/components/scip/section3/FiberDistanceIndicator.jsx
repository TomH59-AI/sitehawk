/**
 * FiberDistanceIndicator — visual gauge showing distance from Target A
 * to the nearest mapped fiber/telecom connection point.
 *
 * Bands (industry rule-of-thumb for telecom backhaul build cost):
 *   < 0.25 mi  → EXCELLENT (green)  — likely on-net or trivial lateral
 *   < 0.50 mi  → GOOD      (lime)
 *   < 1.00 mi  → MARGINAL  (amber)  — typical $50k–$150k lateral
 *   ≥ 1.00 mi  → POOR      (red)    — costly trench / aerial extension
 */

import { Cable, AlertTriangle, CheckCircle2 } from "lucide-react";

const MAX_MILES = 1.5; // gauge ceiling

function classify(miles) {
  if (miles == null || !isFinite(miles)) {
    return { label: "UNKNOWN", color: "#64748b", textColor: "#cbd5e1", icon: AlertTriangle, note: "Run map to detect nearest fiber" };
  }
  if (miles < 0.25) return { label: "EXCELLENT", color: "#10b981", textColor: "#10b981", icon: CheckCircle2, note: "On-net candidate · trivial lateral" };
  if (miles < 0.5)  return { label: "GOOD",      color: "#84cc16", textColor: "#65a30d", icon: CheckCircle2, note: "Short lateral · standard build" };
  if (miles < 1.0)  return { label: "MARGINAL",  color: "#f59e0b", textColor: "#b45309", icon: AlertTriangle, note: "Lateral build cost likely $50k–$150k" };
  return                  { label: "POOR",      color: "#dc2626", textColor: "#b91c1c", icon: AlertTriangle, note: "Long extension · costly trench/aerial" };
}

export default function FiberDistanceIndicator({ distanceMiles, operator, infraType }) {
  const cls = classify(distanceMiles);
  const Icon = cls.icon;
  const pctRaw = distanceMiles != null && isFinite(distanceMiles)
    ? Math.min(100, (distanceMiles / MAX_MILES) * 100)
    : 0;

  return (
    <div className="border-b border-border">
      {/* Header strip */}
      <div className="px-3 py-2 bg-gradient-to-r from-orange-50 to-card border-b border-orange-200 flex items-center gap-2">
        <Cable className="w-3.5 h-3.5 text-orange-600" />
        <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-orange-700">
          NEAREST FIBER · DISTANCE
        </span>
      </div>

      <div className="px-3 py-3 space-y-2.5">
        {/* Headline number + status pill */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="leading-none">
            <span
              className="font-mono font-bold text-2xl"
              style={{ color: cls.textColor }}
            >
              {distanceMiles != null && isFinite(distanceMiles)
                ? Number(distanceMiles).toFixed(2)
                : "—"}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground ml-1 tracking-wider">MI</span>
            {distanceMiles != null && isFinite(distanceMiles) && (
              <span className="text-[10px] font-mono text-muted-foreground ml-1">
                ({Math.round(distanceMiles * 5280).toLocaleString()} ft)
              </span>
            )}
          </div>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-[0.15em]"
            style={{
              backgroundColor: `${cls.color}22`,
              color: cls.textColor,
              border: `1px solid ${cls.color}55`,
            }}
          >
            <Icon className="w-2.5 h-2.5" /> {cls.label}
          </span>
        </div>

        {/* Gradient gauge bar */}
        <div className="relative">
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{
              background:
                "linear-gradient(90deg, #10b981 0%, #84cc16 16%, #f59e0b 33%, #dc2626 66%, #7f1d1d 100%)",
              opacity: 0.35,
            }}
          />
          {/* Tick marks at boundary thresholds (0.25 / 0.5 / 1.0 mi over 1.5 mi span) */}
          {[0.25, 0.5, 1.0].map((t) => (
            <div
              key={t}
              className="absolute top-0 bottom-0 w-px bg-foreground/30"
              style={{ left: `${(t / MAX_MILES) * 100}%` }}
            />
          ))}
          {/* Pointer */}
          {distanceMiles != null && isFinite(distanceMiles) && (
            <div
              className="absolute -top-1 w-3 h-4 rounded-sm shadow-md transition-all duration-500"
              style={{
                left: `calc(${pctRaw}% - 6px)`,
                backgroundColor: cls.color,
                border: "1.5px solid #fff",
              }}
            />
          )}
        </div>

        {/* Scale labels */}
        <div className="flex justify-between text-[8px] font-mono text-muted-foreground tracking-wider">
          <span>0</span>
          <span>0.25</span>
          <span>0.5</span>
          <span>1.0</span>
          <span>1.5+ mi</span>
        </div>

        {/* Operator / type + interpretation note */}
        <div className="pt-1.5 border-t border-border space-y-0.5">
          <div className="text-[10px] font-mono text-foreground">
            <span className="text-muted-foreground">OPERATOR: </span>
            {operator || <span className="italic text-muted-foreground">unknown</span>}
          </div>
          <div className="text-[10px] font-mono text-foreground">
            <span className="text-muted-foreground">TYPE: </span>
            {infraType || <span className="italic text-muted-foreground">—</span>}
          </div>
          <div className="text-[10px] italic" style={{ color: cls.textColor }}>
            {cls.note}
          </div>
        </div>
      </div>
    </div>
  );
}