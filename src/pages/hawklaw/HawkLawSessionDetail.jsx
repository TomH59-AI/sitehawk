import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, BookmarkPlus, ShieldAlert, ChevronDown, ChevronUp, Star, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HAWK_LAW_HEADER } from "../HawkLaw";
import { diff_match_patch } from "diff-match-patch";

const HAWK_LAW_EDGE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/hawk-law";

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

const redFlagBadge = {
  none: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  caution: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
};
const redFlagDot = { none: "bg-slate-400", caution: "bg-amber-500", critical: "bg-red-500" };

function Stars({ score }) {
  const n = Math.round(Math.max(1, Math.min(5, score || 0)));
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-border"}`} />
      ))}
    </div>
  );
}

function RedlineDiff({ original, revised }) {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(original || "", revised || "");
  dmp.diff_cleanupSemantic(diffs);
  return (
    <div className="text-xs leading-relaxed font-mono bg-card rounded-lg p-3 border border-border whitespace-pre-wrap break-words">
      {diffs.map(([op, text], i) =>
        op === -1 ? (
          <span
            key={i}
            style={{
              background: "#fee2e2",
              textDecoration: "line-through",
              color: "#dc2626",
              borderRadius: 2,
              padding: "0 1px",
            }}
          >
            {text}
          </span>
        ) : op === 1 ? (
          <span
            key={i}
            style={{
              background: "#dcfce7",
              textDecoration: "underline",
              color: "#16a34a",
              borderRadius: 2,
              padding: "0 1px",
            }}
          >
            {text}
          </span>
        ) : (
          <span key={i} style={{ color: "#374151" }}>{text}</span>
        )
      )}
    </div>
  );
}

function ReviewClauseCard({ clause }) {
  const [expanded, setExpanded] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const name = clause.clause_name || clause.clause_key || clause.category || "Clause";
  const severity = clause.red_flag_severity || clause.severity || "none";
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-card hover:bg-secondary/30 transition-colors text-left gap-3"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${redFlagDot[severity] || "bg-slate-400"}`} />
          <span className="font-medium text-sm text-foreground truncate">{name}</span>
          {clause.clause_category && (
            <span className="text-xs text-muted-foreground px-2 py-0.5 bg-secondary rounded-full shrink-0 hidden sm:inline">
              {clause.clause_category}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {clause.landlord_favorability_score != null && (
            <Stars score={clause.landlord_favorability_score} />
          )}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${redFlagBadge[severity]}`}>
            {severity === "none" ? "OK" : severity === "caution" ? "⚠ Caution" : "⛔ Critical"}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-4 bg-secondary/10 border-t border-border space-y-3">
          {(clause.clause_text || clause.text_as_written) && (clause.industry_standard || clause.standard_language) && (
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Clause Text
              </span>
              <button
                type="button"
                onClick={() => setShowDiff(d => !d)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors border ${
                  showDiff
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-foreground border-border hover:bg-primary/10"
                }`}
              >
                {showDiff ? "✕ Hide Redline" : "📝 Show Redline vs Industry Standard"}
              </button>
            </div>
          )}

          {showDiff && (clause.clause_text || clause.text_as_written) && (clause.industry_standard || clause.standard_language) ? (
            <div>
              <div className="flex gap-4 text-xs mb-1.5">
                <span className="flex items-center gap-1">
                  <span style={{ background:"#fee2e2", color:"#dc2626", padding:"0 4px", borderRadius:2, textDecoration:"line-through" }}>removed</span>
                  Landlord language
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ background:"#dcfce7", color:"#16a34a", padding:"0 4px", borderRadius:2, textDecoration:"underline" }}>added</span>
                  Industry standard
                </span>
              </div>
              <RedlineDiff
                original={clause.clause_text || clause.text_as_written || ""}
                revised={clause.industry_standard || clause.standard_language || ""}
              />
            </div>
          ) : (
            <>
              {(clause.clause_text || clause.text_as_written) && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">As Written</div>
                  <p className="text-xs text-muted-foreground italic leading-relaxed bg-card rounded-lg p-3 border border-border">
                    "{clause.clause_text || clause.text_as_written}"
                  </p>
                </div>
              )}
              {(clause.industry_standard || clause.standard_language) && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Industry Standard</div>
                  <p className="text-xs text-foreground leading-relaxed">{clause.industry_standard || clause.standard_language}</p>
                </div>
              )}
            </>
          )}
          {clause.ai_explainer && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Plain English</div>
              <p className="text-sm text-foreground leading-relaxed">{clause.ai_explainer}</p>
            </div>
          )}
          {clause.counter_suggestion && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Counter Suggestion</div>
              <p className="text-sm text-primary leading-relaxed">{clause.counter_suggestion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OverallScore({ score }) {
  const n = Math.round(Math.max(1, Math.min(5, score || 0)));
  const labels = ["", "Very Landlord-Unfavorable", "Unfavorable", "Neutral", "Favorable", "Very Favorable"];
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} className={`w-6 h-6 ${i <= n ? "fill-amber-400 text-amber-400" : "text-border"}`} />
        ))}
      </div>
      <span className="text-sm font-medium text-foreground">{labels[n] || `${score}/5`}</span>
    </div>
  );
}

export default function HawkLawSessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingToLease, setSavingToLease] = useState(false);
  const [runningReview, setRunningReview] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [reviewData, setReviewData] = useState(null);

  useEffect(() => {
    base44.entities.HawkLawSession.filter({ id }).then(data => {
      const s = Array.isArray(data) ? data[0] : data;
      setSession(s);
      // Pre-populate review data if already in session
      if (s?.extracted_clauses) {
        const clauses = (() => {
          if (Array.isArray(s.extracted_clauses)) return s.extracted_clauses;
          try {
            const parsed = JSON.parse(s.extracted_clauses);
            return Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([k, v]) => ({ clause_key: k, ...v }));
          } catch { return []; }
        })();
        if (clauses.length > 0) setReviewData({ clauses, overall_score: s.risk_assessment?.overall_score });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const handleRunFullReview = async () => {
    setRunningReview(true);
    setReviewError(null);
    try {
      const user = await base44.auth.me();
      // Load clause library
      const clauseLibrary = await base44.entities.HawkLawClause.list("-landlord_favorability_score", 200);

      // Fetch the lease file text
      let leaseText = "";
      if (session.uploaded_lease_file) {
        const fileResp = await fetch(session.uploaded_lease_file);
        leaseText = await fileResp.text();
      }

      const resp = await fetch(HAWK_LAW_EDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool_name: "hawk-review",
          lease_text: leaseText,
          session_id: id,
          user_id: user?.email || "unknown",
          clause_library: clauseLibrary,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Review failed: ${resp.status} ${errText}`);
      }

      const result = await resp.json();
      const data = result.data || result;

      const clauses = data.clauses || data.extracted_clauses || data.clause_analysis || [];
      const overallScore = data.overall_favorability_score || data.overall_score;

      // Update session
      const updated = await base44.entities.HawkLawSession.update(id, {
        extracted_clauses: clauses,
        risk_assessment: { overall_score: overallScore, raw: data },
      });
      setSession(prev => ({ ...prev, extracted_clauses: clauses, risk_assessment: { overall_score: overallScore, raw: data } }));
      setReviewData({ clauses, overall_score: overallScore });
    } catch (err) {
      setReviewError(err.message || "Review failed.");
    } finally {
      setRunningReview(false);
    }
  };

  const handleSaveToLease = async () => {
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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/hawk-law/sessions")} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-heading font-bold text-xl text-foreground truncate">{session.file_name}</h2>
            {triage && (
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${triageBadge[triage]}`}>
                {triageLabel[triage]}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Uploaded {session.created_date ? new Date(session.created_date).toLocaleDateString() : "—"}
            {session.vendor_detected && session.vendor_detected !== "Unknown" && ` · Vendor: ${session.vendor_detected}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
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

      {/* Triage Results */}
      {triage ? (
        <div className={`border-2 rounded-xl p-5 space-y-4 ${triageColor[triage] || "border-border bg-card"}`}>
          <h3 className="font-heading font-semibold text-foreground">Triage Results</h3>
          {session.triage_summary && (
            <p className="text-sm leading-relaxed">{session.triage_summary}</p>
          )}
          {triageReasons.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-70">Key Concerns</div>
              <ul className="space-y-1.5">
                {triageReasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 shrink-0">⚠</span>
                    <span>{typeof r === "string" ? r : r.concern || r.reason || JSON.stringify(r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-secondary/30 border border-border rounded-xl p-5 text-sm text-muted-foreground text-center">
          No triage data yet. Upload a document and run analysis.
        </div>
      )}

      {/* Full Review Section */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" /> Full Review
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clause-by-clause analysis with favorability scoring and counter suggestions.
            </p>
          </div>
          <Button onClick={handleRunFullReview} disabled={runningReview} size="sm">
            {runningReview
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing…</>
              : reviewData ? "Re-run Full Review" : "Run Full Review"
            }
          </Button>
        </div>

        {reviewError && (
          <div className="flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{reviewError}</p>
          </div>
        )}

        {runningReview && (
          <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
            <span className="text-sm text-primary font-medium">Hawk Law is reviewing clause-by-clause…</span>
          </div>
        )}

        {reviewData && !runningReview && (
          <div className="space-y-4">
            {reviewData.overall_score != null && (
              <div className="bg-secondary/30 rounded-xl p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Overall Landlord Favorability</div>
                <OverallScore score={reviewData.overall_score} />
              </div>
            )}

            {reviewData.clauses?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Clause Analysis ({reviewData.clauses.length} clauses)
                </div>
                {reviewData.clauses.map((clause, i) => (
                  <ReviewClauseCard key={i} clause={clause} />
                ))}
              </div>
            )}

            {/* Attribution footer */}
            <div className="text-xs text-muted-foreground border-t border-border pt-3">
              {HAWK_LAW_HEADER}
            </div>
          </div>
        )}

        {!reviewData && !runningReview && (
          <p className="text-sm text-muted-foreground">
            Click "Run Full Review" to get clause-by-clause analysis with favorability scoring, industry standards, and counter suggestions.
          </p>
        )}
      </div>
    </div>
  );
}