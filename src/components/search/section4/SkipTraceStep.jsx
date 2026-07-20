/**
 * SkipTraceStep — the "Hawk Skip-Trace" step inside the Target A Map Suite.
 *
 * Its own generate button (matching MapSubStep's look) that runs skipTraceCascade
 * for Target A's owner across Enformion + Spokeo + WhitePages, then surfaces every
 * phone and email found — ranked freshest-first, source-badged, copy/call/mail
 * ready. "Try hard, never miss" mode: waits the full cascade (~90s) so the slow
 * WhitePages actor is never skipped.
 *
 * Gating mirrors the map sub-steps: LOCKED until the previous step completes,
 * fires nothing until clicked, hawk spinner in flight, results + Regenerate on done.
 */
import { Lock, Sparkles, RefreshCw, AlertTriangle, Phone, Mail, Copy, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import HawkFlightSpinner from "../HawkFlightSpinner";

const BRAND_GREEN = "#628C83";
const BADGE_COLORS = { CyberBackgroundChecks: "#0e7490", Spokeo: "#7c3aed", WhitePages: "#b45309", TruthFinder: "#be123c" };
const badgeStyle = (s) => (!s ? { background: "#64748b" } : s.startsWith("Aggregated") ? { background: "#628C83" } : { background: BADGE_COLORS[s] || "#475569" });

const copy = (val, what) => { navigator.clipboard?.writeText(val); toast.success(`${what} copied`); };

export default function SkipTraceStep({
  index, unlocked, loading, done, result, error, onRun, ownerName,
}) {
  if (!unlocked) {
    return (
      <div data-tour="skiptrace" className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">STEP {index} · LOCKED</div>
            <h3 className="font-heading font-bold text-base leading-tight">Hawk Skip-Trace</h3>
          </div>
        </div>
        <div className="px-4 py-4 text-sm text-muted-foreground">Complete the previous step to unlock Skip-Trace.</div>
      </div>
    );
  }

  const phones = result?.phones || [];
  const emails = result?.emails || [];
  const isEntity = result?.is_entity_owner;
  const noHits = result && !isEntity && phones.length === 0 && emails.length === 0;

  return (
    <div data-tour="skiptrace" className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-white" style={{ background: BRAND_GREEN }}>
        <div className="flex items-center gap-2">
          <Crosshair className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">STEP {index} · TARGET A</div>
            <h3 className="font-heading font-bold text-base leading-tight">Hawk Skip-Trace</h3>
            {ownerName ? <div className="text-[11px] font-mono opacity-90 mt-0.5">{ownerName}</div> : null}
          </div>
        </div>
        {!done ? (
          <Button data-tour="skiptrace-run" onClick={onRun} disabled={loading} className="bg-white hover:bg-emerald-50 font-semibold shadow" style={{ color: BRAND_GREEN }}>
            <Sparkles className="w-4 h-4 mr-2" /> Run Skip-Trace
          </Button>
        ) : (
          <Button onClick={onRun} disabled={loading} variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20 font-semibold">
            <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
          </Button>
        )}
      </div>

      {loading && <HawkFlightSpinner label="Searching TruthFinder, WhitePages, Spokeo & CyberBackgroundChecks… (this can take ~60s)" />}

      {!loading && !done && !error && (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Click <span className="font-semibold text-foreground">Run Skip-Trace</span> to pull every phone & email for Target A's owner across all sources.
        </div>
      )}

      {error && !loading && (
        <div className="px-4 py-4 bg-destructive/5 border-y border-destructive/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-destructive">Skip-Trace failed: {error}</div>
            <Button onClick={onRun} size="sm" variant="outline" className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      )}

      {done && !loading && (
        <div className="p-4 space-y-4">
          {isEntity && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-300/50 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              Entity / business owner — people-search can't match an LLC/Trust/Corp. Manual lookup required.
            </div>
          )}

          {noHits && (
            <div className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              No phones or emails found across all sources. Try Regenerate, or look this owner up manually.
            </div>
          )}

          {/* PHONES — ranked freshest-first */}
          {phones.length > 0 && (
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-2">
                <Phone className="w-3.5 h-3.5" /> Phones ({phones.length}) · ranked freshest first
              </div>
              <div className="space-y-2">
                {phones.map((p, i) => (
                  <div key={p.phone} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${i === 0 ? "border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/20" : "border-border bg-card"}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <a href={`tel:${p.phone}`} className="font-mono font-bold text-foreground hover:underline">{p.display}</a>
                      {i === 0 && <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: "#059669" }}>BEST</span>}
                      {p.mobile && <span className="text-[9px] font-semibold text-green-600">MOBILE</span>}
                      {p.lastReported && <span className="text-[10px] text-muted-foreground truncate">{p.lastReported}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(p.sources || []).map((s) => (
                        <span key={s} className="text-[9px] font-semibold text-white px-1.5 py-0.5 rounded" style={badgeStyle(s)}>{s}</span>
                      ))}
                      <button onClick={() => copy(p.display, "Phone")} title="Copy" className="text-muted-foreground hover:text-foreground p-1">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EMAILS */}
          {emails.length > 0 && (
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" /> Emails ({emails.length})
              </div>
              <div className="space-y-2">
                {emails.map((e) => (
                  <div key={e.email} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                    <a href={`mailto:${e.email}`} className="font-medium text-foreground hover:underline truncate">{e.email}</a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(e.sources || []).map((s) => (
                        <span key={s} className="text-[9px] font-semibold text-white px-1.5 py-0.5 rounded" style={badgeStyle(s)}>{s}</span>
                      ))}
                      <button onClick={() => copy(e.email, "Email")} title="Copy" className="text-muted-foreground hover:text-foreground p-1">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}