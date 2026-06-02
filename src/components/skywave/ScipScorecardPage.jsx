import { buildScorecard, CATEGORY_ORDER } from "@/lib/targetScorecard";
import { SKYWAVE } from "@/lib/skywave";

function scoreColor(s) {
  if (s === null) return "#9ca3af";
  if (s >= 80) return "#059669";
  if (s >= 65) return SKYWAVE.blue;
  if (s >= 50) return "#d97706";
  return "#dc2626";
}

function Bar({ score }) {
  if (score === null) return <span className="text-[7.5pt] italic" style={{ color: SKYWAVE.muted }}>Not scored: data unavailable.</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: "#e5e7eb", overflow: "hidden", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
        <div style={{ width: `${score}%`, height: "100%", background: scoreColor(score), printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
      </div>
      <span className="text-[8pt] font-bold tabular-nums" style={{ color: scoreColor(score) }}>{score}</span>
    </div>
  );
}

function Card({ sc }) {
  return (
    <div className="mb-3" style={{ border: `1.5px solid ${SKYWAVE.line}`, borderRadius: 8, overflow: "hidden", breakInside: "avoid" }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: SKYWAVE.bg, borderBottom: `1px solid ${SKYWAVE.line}` }}>
        <div className="flex items-center gap-2">
          <span className="text-white text-[8.5pt] font-bold px-1.5 py-0.5 rounded" style={{ background: SKYWAVE.blue, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>{sc.label}</span>
          <span className="text-[8.5pt] font-semibold" style={{ color: SKYWAVE.navy }}>{sc.recommendation}</span>
        </div>
        <div className="text-right">
          {sc.overall === null ? (
            <span className="text-[8pt] italic" style={{ color: SKYWAVE.muted }}>Not scored</span>
          ) : (
            <span className="text-[13pt] font-extrabold" style={{ color: scoreColor(sc.overall) }}>
              {sc.overall}<span className="text-[8pt]" style={{ color: SKYWAVE.muted }}>/100 · {sc.overallSource === "saved" ? "ranking" : "estimated"}</span>
            </span>
          )}
        </div>
      </div>

      {sc.whyBullets.length > 0 && (
        <div className="px-3 py-1.5" style={{ borderBottom: `1px solid ${SKYWAVE.line}` }}>
          <div className="text-[7.5pt] font-bold uppercase tracking-wide mb-1" style={{ color: SKYWAVE.navy }}>Why this target?</div>
          <ul style={{ margin: 0, paddingLeft: 14 }}>
            {sc.whyBullets.map((b, i) => <li key={i} className="text-[8.5pt]" style={{ color: SKYWAVE.ink, marginBottom: 1 }}>{b}</li>)}
          </ul>
        </div>
      )}

      <div className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {CATEGORY_ORDER.map((name) => {
          const cat = sc.categories[name];
          return (
            <div key={name}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[8pt] font-semibold" style={{ color: SKYWAVE.ink }}>{name}</span>
                <div style={{ width: 70 }}><Bar score={cat.score} /></div>
              </div>
              <div className="text-[7.5pt] leading-tight" style={{ color: SKYWAVE.muted }}>{cat.explanation}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Printable Target Selection Scorecard page for the SCIP export.
export default function ScipScorecardPage({ record }) {
  const targets = Array.isArray(record?.parcel_targets) ? record.parcel_targets : [];
  const cards = targets.map((_, i) => buildScorecard(record, i));
  return (
    <div>
      {cards.map((sc, i) => <Card key={i} sc={sc} />)}
    </div>
  );
}