import { useEffect, useState } from "react";
import { X, AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { lobOwnerMailers } from "@/functions/lobOwnerMailers";

export default function LobMailerModal({ recipients, searchId, onClose }) {
  const [phase, setPhase] = useState("loading"); // loading | confirm | sending | done | error
  const [quote, setQuote] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await lobOwnerMailers({ action: "quote", recipients });
        if (res.data?.error) {
          setError(res.data.error);
          setPhase("error");
        } else {
          setQuote(res.data);
          setPhase("confirm");
        }
      } catch (e) {
        setError(e.message);
        setPhase("error");
      }
    })();
  }, [recipients]);

  const handleSend = async () => {
    setPhase("sending");
    try {
      const validRecipients = quote.recipients.filter((r) => r.valid);
      const res = await lobOwnerMailers({
        action: "send",
        recipients: validRecipients,
        search_id: searchId,
      });
      if (res.data?.error) {
        setError(res.data.error);
        setPhase("error");
      } else {
        setResults(res.data);
        setPhase("done");
      }
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-heading font-bold text-foreground">Send Owner Mailers via Lob</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {phase === "loading" && (
            <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
              <Loader2 className="w-5 h-5 animate-spin" /> Validating addresses with Lob…
            </div>
          )}

          {phase === "confirm" && quote && (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-700 dark:text-amber-300">Confirm before sending</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Lob will charge for each letter. Review the list and total cost below.
                    Click <strong>Confirm &amp; Send</strong> to dispatch.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Stat label="Recipients" value={quote.recipients.length} />
                <Stat label="Valid" value={quote.valid_count} accent="emerald" />
                <Stat label="Total Cost" value={`$${quote.total_cost_usd.toFixed(2)}`} accent="primary" />
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-secondary/50 px-3 py-2 text-xs font-semibold text-foreground">
                  Recipients (${quote.unit_cost_usd.toFixed(2)} each)
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-border">
                  {quote.recipients.map((r, i) => (
                    <div key={i} className="px-3 py-2 flex items-start justify-between gap-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground">{r.owner_name || "Unknown owner"}</div>
                        <div className="text-muted-foreground truncate">{r.mailing_address || "—"}</div>
                      </div>
                      {r.valid ? (
                        <span className="text-emerald-600 font-bold">${r.cost_usd.toFixed(2)}</span>
                      ) : (
                        <span className="text-red-600 font-bold">SKIP</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={quote.valid_count === 0}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition-all"
                >
                  <Send className="w-4 h-4" /> Confirm &amp; Send ({quote.valid_count})
                </button>
              </div>
            </div>
          )}

          {phase === "sending" && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-sm font-semibold text-foreground">Dispatching letters via Lob…</div>
              <div className="text-xs">Please don't close this window.</div>
            </div>
          )}

          {phase === "done" && results && (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div className="font-bold text-emerald-700 dark:text-emerald-300">
                  {results.sent} of {results.total} letters successfully queued for delivery.
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-border border border-border rounded-lg">
                {results.results.map((r, i) => (
                  <div key={i} className="px-3 py-2 flex items-start justify-between gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground">{r.owner_name || "—"}</div>
                      {r.reason && <div className="text-red-600">{r.reason}</div>}
                      {r.expected_delivery && <div className="text-muted-foreground">ETA {r.expected_delivery}</div>}
                    </div>
                    <span className={`font-bold uppercase text-[10px] tracking-wider ${
                      r.status === "sent" ? "text-emerald-600" : r.status === "skipped" ? "text-amber-600" : "text-red-600"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                  Done
                </button>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm">
              <div className="font-bold text-red-700 dark:text-red-300 mb-1">Mailer error</div>
              <div className="text-xs text-muted-foreground">{error}</div>
              <button onClick={onClose} className="mt-3 px-4 py-2 rounded-lg border border-border text-sm font-medium">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  const tone = accent === "emerald" ? "text-emerald-600" : accent === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-lg bg-secondary/50 border border-border p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className={`font-heading font-bold text-xl mt-1 ${tone}`}>{value}</div>
    </div>
  );
}