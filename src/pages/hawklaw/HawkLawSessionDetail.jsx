import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Send, BookmarkPlus, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HAWK_LAW_HEADER } from "../HawkLaw";

const triageColor = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  yellow: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  red: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};
const triageBadge = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  yellow: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/10 text-red-700 dark:text-red-400",
};
const triageLabel = { green: "✓ Green — Low Risk", yellow: "⚠ Yellow — Moderate Risk", red: "⛔ Red — High Risk" };

function ClauseCard({ clause }) {
  const [expanded, setExpanded] = useState(false);
  const redFlagColor = { none: "bg-slate-400", caution: "bg-amber-500", critical: "bg-red-500" };
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-secondary/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${redFlagColor[clause.red_flag_severity] || "bg-slate-400"}`} />
          <span className="font-medium text-sm text-foreground truncate">{clause.clause_name || clause.clause_key}</span>
          {clause.clause_category && (
            <span className="text-xs text-muted-foreground px-2 py-0.5 bg-secondary rounded-full shrink-0">{clause.clause_category}</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-4 py-3 bg-secondary/10 border-t border-border space-y-2">
          {clause.clause_text && <p className="text-xs text-muted-foreground italic leading-relaxed">"{clause.clause_text}"</p>}
          {clause.ai_explainer && <p className="text-sm text-foreground leading-relaxed">{clause.ai_explainer}</p>}
          {clause.counter_suggestion && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-primary">
              <strong>Counter Suggestion:</strong> {clause.counter_suggestion}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HawkLawSessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingToLease, setSavingToLease] = useState(false);

  useEffect(() => {
    base44.entities.HawkLawSession.filter({ id }).then(data => {
      setSession(Array.isArray(data) ? data[0] : data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const handleSaveToLease = async () => {
    if (!session) return;
    setSavingToLease(true);
    try {
      await base44.entities.HawkLawSession.update(id, {
        attorney_export_at: new Date().toISOString(),
      });
      navigate("/hawk-lease/sites");
    } finally {
      setSavingToLease(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>;
  if (!session) return <div className="text-sm text-muted-foreground py-12 text-center">Session not found.</div>;

  const triage = session.triage_result;
  const triageReasons = (() => {
    if (!session.triage_reasons) return [];
    if (Array.isArray(session.triage_reasons)) return session.triage_reasons;
    try { return JSON.parse(session.triage_reasons); } catch { return []; }
  })();
  const extractedClauses = (() => {
    if (!session.extracted_clauses) return [];
    if (Array.isArray(session.extracted_clauses)) return session.extracted_clauses;
    try {
      const parsed = JSON.parse(session.extracted_clauses);
      return Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([k, v]) => ({ clause_key: k, ...v }));
    } catch { return []; }
  })();
  const negotiationRounds = (() => {
    if (!session.negotiation_rounds) return [];
    if (Array.isArray(session.negotiation_rounds)) return session.negotiation_rounds;
    try { return JSON.parse(session.negotiation_rounds); } catch { return []; }
  })();
  const riskAssessment = session.risk_assessment;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/hawk-law/sessions")} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-bold text-xl text-foreground truncate">{session.file_name}</h2>
          <p className="text-sm text-muted-foreground">Vendor: {session.vendor_detected || "Unknown"}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={handleSaveToLease} disabled={savingToLease}>
            <BookmarkPlus className="w-4 h-4 mr-1" /> Save to HawkLease
          </Button>
          <Button size="sm" variant="outline">
            <Send className="w-4 h-4 mr-1" /> Send to Attorney
          </Button>
        </div>
      </div>

      {/* Analysis Header */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
        {HAWK_LAW_HEADER}
      </div>

      {/* Triage Result */}
      {triage && (
        <div className={`border rounded-xl p-5 space-y-3 ${triageColor[triage]}`}>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${triageBadge[triage]}`}>
              {triageLabel[triage]}
            </span>
          </div>
          {session.triage_summary && (
            <p className="text-sm leading-relaxed">{session.triage_summary}</p>
          )}
          {triageReasons.length > 0 && (
            <ul className="space-y-1">
              {triageReasons.map((r, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="mt-1 shrink-0">•</span>
                  <span>{typeof r === "string" ? r : r.reason || JSON.stringify(r)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* No triage yet */}
      {!triage && (
        <div className="bg-secondary/30 border border-border rounded-xl p-5 text-sm text-muted-foreground text-center">
          Triage not yet run. Use the analysis tools in Hawk Law to process this document.
        </div>
      )}

      {/* Extracted Clauses */}
      {extractedClauses.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading font-semibold text-foreground">Extracted Clauses ({extractedClauses.length})</h3>
          {extractedClauses.map((clause, i) => (
            <ClauseCard key={i} clause={clause} />
          ))}
        </div>
      )}

      {/* Negotiation Rounds */}
      {negotiationRounds.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-heading font-semibold text-foreground">Negotiation Rounds</h3>
          {negotiationRounds.map((round, i) => (
            <div key={i} className="space-y-2">
              <div className="text-xs text-muted-foreground font-medium uppercase">Round {round.round_num || i + 1} · {round.timestamp ? new Date(round.timestamp).toLocaleDateString() : ""}</div>
              {round.user_message && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-sm text-foreground">
                  <strong className="text-primary">You:</strong> {round.user_message}
                </div>
              )}
              {round.ai_response && (
                <div className="bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground">
                  <strong>Hawk Law:</strong> {round.ai_response}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Risk Assessment */}
      {riskAssessment && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" /> Risk Assessment
          </h3>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {typeof riskAssessment === "string" ? riskAssessment : JSON.stringify(riskAssessment, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}