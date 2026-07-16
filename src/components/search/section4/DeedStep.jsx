/**
 * DeedStep — the "Warranty Deed" step inside the Target A Map Suite.
 *
 * Its own generate button (matching MapSubStep's look) that fetches Target A's
 * deed of record + chain of title from Realie (click lookup). If Realie returns
 * deed data it's shown on-screen; if not, a clean "Not Available For This Target"
 * notice. Screen-only — does NOT touch the printed SCIP deed page or any pipeline
 * business logic.
 */
import { format } from "date-fns";
import { Lock, Sparkles, RefreshCw, AlertTriangle, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import HawkFlightSpinner from "../HawkFlightSpinner";

const BRAND_GREEN = "#628C83";

function fmtDate(d) {
  if (!d) return "";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return String(d); }
}
function money(v) {
  return v != null && Number(v) > 0 ? `$${Number(v).toLocaleString()}` : "";
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2 border-b border-border last:border-0">
      <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

export default function DeedStep({
  index, unlocked, loading, done, deed, error, onRun, ownerName,
}) {
  if (!unlocked) {
    return (
      <div data-tour="deed" className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">STEP {index} · LOCKED</div>
            <h3 className="font-heading font-bold text-base leading-tight">Warranty Deed</h3>
          </div>
        </div>
        <div className="px-4 py-4 text-sm text-muted-foreground">Complete the previous step to unlock the Deed.</div>
      </div>
    );
  }

  const hasDeed = deed && (deed.deed_type || deed.deed_doc_num || deed.last_sale_date || deed.legal_description || (deed.transfers && deed.transfers.length));
  const transfers = Array.isArray(deed?.transfers) ? deed.transfers.slice(0, 8) : [];

  return (
    <div data-tour="deed" className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-white" style={{ background: BRAND_GREEN }}>
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">STEP {index} · TARGET A</div>
            <h3 className="font-heading font-bold text-base leading-tight">Warranty Deed</h3>
            {ownerName ? <div className="text-[11px] font-mono opacity-90 mt-0.5">{ownerName}</div> : null}
          </div>
        </div>
        {!done ? (
          <Button data-tour="deed-run" onClick={onRun} disabled={loading} className="bg-white hover:bg-emerald-50 font-semibold shadow" style={{ color: BRAND_GREEN }}>
            <Sparkles className="w-4 h-4 mr-2" /> Run Deed Lookup
          </Button>
        ) : (
          <Button onClick={onRun} disabled={loading} variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20 font-semibold">
            <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
          </Button>
        )}
      </div>

      {loading && <HawkFlightSpinner label="Pulling deed of record & chain of title from Realie…" />}

      {!loading && !done && !error && (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Click <span className="font-semibold text-foreground">Run Deed Lookup</span> to pull Target A's deed of record from Realie.
        </div>
      )}

      {error && !loading && (
        <div className="px-4 py-4 bg-destructive/5 border-y border-destructive/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-destructive">Deed lookup failed: {error}</div>
            <Button onClick={onRun} size="sm" variant="outline" className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      )}

      {done && !loading && (
        <div className="p-4 space-y-4">
          {!hasDeed ? (
            <div className="rounded-lg bg-muted px-4 py-6 text-center text-sm font-semibold text-muted-foreground">
              Not Available For This Target
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: BRAND_GREEN }}>Deed of Record</div>
                <Row label="Deed Type" value={deed.deed_type} />
                <Row label="Document #" value={deed.deed_doc_num} />
                <Row label="Book / Page" value={deed.deed_book} />
                <Row label="Current Owner" value={deed.owner_name} />
                <Row label="Ownership Start" value={fmtDate(deed.ownership_start)} />
                <Row label="Last Sale" value={[fmtDate(deed.last_sale_date), money(deed.last_sale_price)].filter(Boolean).join(" · ")} />
                <Row label="Legal Description" value={deed.legal_description} />
              </div>

              {transfers.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: BRAND_GREEN }}>Chain of Title</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/60 text-[10px] uppercase text-muted-foreground">
                        <th className="text-left px-3 py-1.5 font-semibold">Date</th>
                        <th className="text-left px-3 py-1.5 font-semibold">Type</th>
                        <th className="text-left px-3 py-1.5 font-semibold">Grantor → Grantee</th>
                        <th className="text-left px-3 py-1.5 font-semibold">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map((t, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-1.5 align-top">{fmtDate(t.date || t.sale_date || t.recording_date)}</td>
                          <td className="px-3 py-1.5 align-top">{t.deed_type || t.type || ""}</td>
                          <td className="px-3 py-1.5 align-top">{[t.grantor || t.seller, t.grantee || t.buyer].filter(Boolean).join(" → ")}</td>
                          <td className="px-3 py-1.5 align-top">{money(t.price || t.sale_price || t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}