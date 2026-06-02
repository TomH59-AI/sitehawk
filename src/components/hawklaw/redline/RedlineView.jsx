import { Card } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle, Check, X, RefreshCw } from "lucide-react";
import { HL, FLAG_COLOR, DISCLAIMER } from "../hawklawConst";

const REC_STYLE = {
  accept: { label: "ACCEPT", color: HL.green, Icon: Check },
  reject: { label: "REJECT", color: HL.red, Icon: X },
  counter: { label: "COUNTER", color: HL.gold, Icon: RefreshCw },
};

function Disclaimer() {
  return (
    <div className="flex gap-2 p-3 rounded-lg text-sm" style={{ border: `1.5px solid ${HL.gold}`, background: "rgba(255,184,0,0.08)" }}>
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: HL.gold }} />
      <span>{DISCLAIMER}</span>
    </div>
  );
}

export default function RedlineView({ review, comparison, onBack }) {
  const changes = comparison?.changes || review?.changes || [];
  const summary = comparison?.summary || review?.summary || "";

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
        <ArrowLeft className="w-4 h-4" /> Redline Counter
      </button>

      <div className="space-y-5">
        <h1 className="text-2xl font-bold font-heading">{review.review_name}</h1>
        <Disclaimer />

        {summary && (
          <Card className="p-5">
            <p className="text-sm"><strong>What the landlord changed:</strong> {summary}</p>
          </Card>
        )}

        <div className="space-y-3">
          {changes.map((c, i) => {
            const rec = REC_STYLE[c.recommendation] || REC_STYLE.counter;
            const RecIcon = rec.Icon;
            return (
              <Card key={i} className="p-5">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h3 className="font-bold">{c.clause}</h3>
                  <div className="flex items-center gap-2">
                    {c.impact && (
                      <span className="px-2 py-0.5 rounded-full text-white text-xs font-semibold" style={{ background: FLAG_COLOR[c.impact] || "#888" }}>{c.impact}</span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-white text-xs font-bold" style={{ background: rec.color }}>
                      <RecIcon className="w-3 h-3" /> {rec.label}
                    </span>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 text-sm mb-3">
                  <div className="p-2.5 rounded-lg bg-muted/40">
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Your Original</div>
                    {c.original_text || "—"}
                  </div>
                  <div className="p-2.5 rounded-lg" style={{ background: "rgba(210,59,59,0.06)" }}>
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Landlord's Redline {c.change_type ? `(${c.change_type})` : ""}</div>
                    {c.redlined_text || "—"}
                  </div>
                </div>

                {c.why && <p className="text-sm mb-2"><strong>Why:</strong> {c.why}</p>}
                {c.counter_language && (
                  <div className="p-2.5 rounded-lg text-sm italic" style={{ background: "rgba(0,102,255,0.06)" }}>
                    <span className="not-italic font-semibold">Suggested counter: </span>“{c.counter_language}”
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <Disclaimer />
      </div>
    </div>
  );
}