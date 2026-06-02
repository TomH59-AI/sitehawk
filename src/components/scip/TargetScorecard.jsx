import { buildScorecard, CATEGORY_ORDER } from "@/lib/targetScorecard";
import { Trophy, ShieldCheck, Eye, CheckCircle2, MinusCircle } from "lucide-react";
import { SKYWAVE } from "@/lib/skywave";

const REC_STYLE = {
  "Primary recommendation": { color: "#059669", icon: Trophy },
  "Backup option": { color: "#2563eb", icon: ShieldCheck },
  "Reviewed but not selected": { color: "#6b7280", icon: Eye },
};

function scoreColor(s) {
  if (s === null) return "#9ca3af";
  if (s >= 80) return "#059669";
  if (s >= 65) return "#2563eb";
  if (s >= 50) return "#d97706";
  return "#dc2626";
}

function ScoreBar({ score }) {
  if (score === null) return <span className="text-[11px] italic text-muted-foreground">Not scored</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden min-w-[44px]">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: scoreColor(score) }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums" style={{ color: scoreColor(score) }}>{score}</span>
    </div>
  );
}

function Card({ sc, index }) {
  const rec = REC_STYLE[sc.recommendation] || REC_STYLE["Reviewed but not selected"];
  const RecIcon = rec.icon;
  return (
    <div className="rounded-xl border bg-card overflow-hidden" style={{ borderColor: SKYWAVE.line }}>
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b" style={{ borderColor: SKYWAVE.line }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-md text-white text-xs font-bold shrink-0" style={{ background: SKYWAVE.blue }}>{sc.label}</span>
          <span className="text-[11px] font-semibold inline-flex items-center gap-1 truncate" style={{ color: rec.color }}>
            <RecIcon className="w-3.5 h-3.5 shrink-0" /> {sc.recommendation}
          </span>
        </div>
        <div className="text-right shrink-0">
          {sc.overall === null ? (
            <span className="text-[11px] italic text-muted-foreground">Not scored</span>
          ) : (
            <>
              <div className="font-heading font-extrabold text-2xl leading-none" style={{ color: scoreColor(sc.overall) }}>
                {sc.overall}<span className="text-sm text-muted-foreground font-bold">/100</span>
              </div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {sc.overallSource === "saved" ? "Ranking score" : "Estimated"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Why this target? */}
      {sc.whyBullets.length > 0 && (
        <div className="px-4 py-3 bg-secondary/30 border-b" style={{ borderColor: SKYWAVE.line }}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">Why this target?</div>
          <ul className="space-y-1">
            {sc.whyBullets.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[12px] text-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: rec.color }} /> <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Category grid */}
      <div className="p-3 grid sm:grid-cols-2 gap-x-4 gap-y-2.5">
        {CATEGORY_ORDER.map((name) => {
          const cat = sc.categories[name];
          return (
            <div key={name}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-semibold text-foreground">{name}</span>
                <div className="w-24"><ScoreBar score={cat.score} /></div>
              </div>
              <p className={`text-[10.5px] leading-snug mt-0.5 ${cat.score === null ? "italic" : ""} text-muted-foreground`}>
                {cat.explanation}
                {cat.score !== null && cat.source && <span className="opacity-60"> · {cat.source}</span>}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// On-screen Target Selection Scorecard for ScipDetail. Display-only — does not
// change Target A/B/C ranking. Renders one compact card per parcel target.
export default function TargetScorecard({ record }) {
  const targets = Array.isArray(record?.parcel_targets) ? record.parcel_targets : [];
  if (!targets.length) {
    return (
      <div className="rounded-xl border bg-card p-5" style={{ borderColor: SKYWAVE.line }}>
        <h3 className="font-heading font-bold text-lg mb-1" style={{ color: SKYWAVE.navy }}>Target Selection Scorecard</h3>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <MinusCircle className="w-4 h-4" /> Generate parcel targets (Step 3) to see why each target was selected.
        </p>
      </div>
    );
  }
  const cards = targets.map((_, i) => buildScorecard(record, i));
  return (
    <div className="rounded-xl border bg-card p-5" style={{ borderColor: SKYWAVE.line }}>
      <div className="mb-3">
        <h3 className="font-heading font-bold text-lg" style={{ color: SKYWAVE.navy }}>Target Selection Scorecard</h3>
        <p className="text-xs text-muted-foreground">
          Display-only explanation of why each target was selected — for the carrier, RF and A&amp;E teams. Does not change ranking. Scores marked <em>Estimated</em> are derived from available SCIP data.
        </p>
      </div>
      <div className="space-y-4">
        {cards.map((sc, i) => <Card key={i} sc={sc} index={i} />)}
      </div>
    </div>
  );
}