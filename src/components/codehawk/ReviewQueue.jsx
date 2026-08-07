import { useCallback, useEffect, useState } from "react";
import { codehawkReview } from "@/functions/codehawkReview";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, AlertTriangle, Inbox, ExternalLink } from "lucide-react";

const REASON_COPY = {
  conflict_with_existing: { label: "Conflicts with the registry", tone: "amber" },
  no_quote: { label: "Quote not found in the source", tone: "red" },
  no_section_ref: { label: "No section reference", tone: "amber" },
  low_confidence: { label: "Low confidence", tone: "amber" },
  qc_failed: { label: "Failed quality control", tone: "red" },
  ambiguous_source: { label: "Source may be the wrong jurisdiction", tone: "red" },
  multiple_candidates: { label: "Conflicting sources", tone: "amber" },
};

const TONES = {
  amber: "border-amber-500/40 bg-amber-500/5 text-amber-700",
  red: "border-destructive/40 bg-destructive/5 text-destructive",
};

const FIELD_LABELS = {
  height_limit_ft: "Maximum tower height (ft)",
  setback_ft: "Setback from property line (ft)",
  fall_zone_ft: "Fall zone (ft)",
  fall_zone_pct_of_height: "Fall zone (% of height)",
  residential_separation_ft: "Residential separation (ft)",
  tower_separation_ft: "Tower-to-tower separation (ft)",
  pe_fall_zone_allowed: "PE letter can reduce fall zone / setback",
  pe_letter_required: "PE letter required",
  stealth_required: "Stealth / concealment required",
  collocation_required: "Collocation required first",
  permit_type: "Approval path",
  setback_rule: "Setback rule (formula)",
};

export default function ReviewQueue({ isAdmin }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await codehawkReview({ action: "list", status: "pending", limit: 200 });
      if (res.data?.error) throw new Error(res.data.error);
      setItems(res.data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load the review queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function resolve(item, action) {
    setBusyId(item.id);
    setNotice("");
    try {
      const res = await codehawkReview({ action, id: item.id });
      if (res.data?.error) throw new Error(res.data.error);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setNotice(
        action === "approve"
          ? `Wrote ${FIELD_LABELS[item.field_name] || item.field_name} = ${item.proposed_value} for ${item.jurisdiction}, ${item.state}.`
          : `Rejected ${FIELD_LABELS[item.field_name] || item.field_name} for ${item.jurisdiction}, ${item.state}.`
      );
    } catch (e) {
      setNotice(e?.response?.data?.error || e.message || "That action failed.");
    } finally {
      setBusyId("");
    }
  }

  if (!isAdmin) {
    return <div className="p-10 text-center text-sm text-muted-foreground">The review queue is admin-only.</div>;
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the queue…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {items.length
            ? `${items.length} value${items.length === 1 ? "" : "s"} CodeHawk would not write on its own. Nothing here has touched the registry.`
            : "Nothing waiting."}
        </p>
        <Button variant="ghost" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      {notice && <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-foreground">{notice}</div>}

      {!items.length && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-12 text-center">
          <Inbox className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">The queue is clear</p>
          <p className="text-xs text-muted-foreground">Every value CodeHawk extracted either passed the gate or was already resolved.</p>
        </div>
      )}

      {items.map((item) => {
        const reason = REASON_COPY[item.reason] || { label: item.reason, tone: "amber" };
        return (
          <div key={item.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-heading text-sm font-bold text-foreground">
                  {item.jurisdiction}, {item.state}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{FIELD_LABELS[item.field_name] || item.field_name}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${TONES[reason.tone]}`}>{reason.label}</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Proposed: </span>
                <span className="font-semibold text-foreground">{item.proposed_value || "—"}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">On file: </span>
                <span className={item.current_value ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  {item.current_value || "empty"}
                </span>
              </div>
              {item.confidence && (
                <div>
                  <span className="text-xs text-muted-foreground">Confidence: </span>
                  <span className="text-foreground">{item.confidence}</span>
                </div>
              )}
            </div>

            {item.quote && (
              <blockquote className="mt-3 border-l-2 border-primary/40 bg-secondary/30 py-2 pl-3 pr-2 text-xs italic leading-relaxed text-foreground">
                &ldquo;{item.quote}&rdquo;
              </blockquote>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {item.section_ref && <span>{item.section_ref}</span>}
              {item.source_url && (
                <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Open the source <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {item.qc_verdict && <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">QC: {item.qc_verdict}</div>}

            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" disabled={busyId === item.id} onClick={() => resolve(item, "approve")} className="gap-1.5">
                {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Approve and write
              </Button>
              <Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => resolve(item, "reject")} className="gap-1.5">
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
