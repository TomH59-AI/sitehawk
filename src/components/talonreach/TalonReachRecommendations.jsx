import { AlertTriangle, ArrowUpCircle, Compass, RadioTower, Zap, Wrench, MapPin } from "lucide-react";
import TalonReachTagline from "./TalonReachTagline";

const TYPE_ICON = { height: ArrowUpCircle, azimuth: Compass, infill: RadioTower, power: Zap, other: Wrench };
const SEVERITY_STYLE = {
  moderate: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  severe: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  dead: "bg-red-500/15 text-red-400 border-red-500/40",
};

// Plain-English findings panel. Clicking a zone or recommendation zooms the
// map to the spot it refers to via onFocus([lon, lat]).
export default function TalonReachRecommendations({ report, onFocus }) {
  const a = report?.analysis || {};
  const zones = a.weak_zones || [];
  const recs = [...(a.recommendations || [])].sort((x, y) => (x.priority || 9) - (y.priority || 9));
  const infill = report?.infill;

  const focusZone = (z) => z?.longitude && onFocus?.([z.longitude, z.latitude]);
  const focusRec = (r) => {
    if (r.type === "infill" && infill?.longitude) return onFocus?.([infill.longitude, infill.latitude]);
    const z = Number.isFinite(Number(r.zone_index)) ? zones[Number(r.zone_index)] : null;
    if (z?.longitude) return onFocus?.([z.longitude, z.latitude]);
    onFocus?.([report.longitude, report.latitude]);
  };

  return (
    <div className="space-y-3">
      {a.summary && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">RF ENGINEER ASSESSMENT</span>
            {a.coverage_grade && (
              <span className="text-xs font-heading font-bold px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/40">
                Coverage grade: {a.coverage_grade}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed">{a.summary}</p>
        </div>
      )}

      {zones.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">WEAK / DEAD ZONES — click to zoom</div>
          {zones.map((z, i) => (
            <button key={i} onClick={() => focusZone(z)}
              className="w-full text-left rounded-lg border border-border hover:border-red-500/50 hover:bg-red-500/5 transition-colors p-2.5 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{z.label}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${SEVERITY_STYLE[z.severity] || SEVERITY_STYLE.moderate}`}>
                    {(z.severity || "moderate").toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {z.direction} · {z.distance_mi} mi out · {z.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {recs.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground">RECOMMENDED FIXES — click to zoom</div>
          {recs.map((r, i) => {
            const Icon = TYPE_ICON[r.type] || Wrench;
            return (
              <button key={i} onClick={() => focusRec(r)}
                className="w-full text-left rounded-lg border border-border hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-colors p-2.5 flex items-start gap-2.5">
                <Icon className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{i + 1}. {r.action}</div>
                  {r.expected_benefit && <p className="text-xs text-muted-foreground mt-0.5">{r.expected_benefit}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {infill?.latitude && (
        <button onClick={() => onFocus?.([infill.longitude, infill.latitude])}
          className="w-full text-left rounded-lg border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/15 transition-colors p-2.5 flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-cyan-300">
              Infill / repeater site — {infill.latitude}, {infill.longitude}
              <span className="ml-2 text-[10px] font-bold text-cyan-400/80">
                {report.infill_source === "cloudrf_bsa" ? "CloudRF Best Site Analysis" : "AI estimate"}
              </span>
            </div>
            {infill.rationale && <p className="text-xs text-muted-foreground mt-0.5">{infill.rationale}</p>}
          </div>
        </button>
      )}

      <TalonReachTagline />
    </div>
  );
}