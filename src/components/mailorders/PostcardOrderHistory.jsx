import { useState } from "react";
import { CheckCircle2, Clock, ExternalLink, MailWarning, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

const ORDER_LABELS = { draft: "Draft", pending_payment: "Awaiting payment", processing: "Processing", sent: "Mailed", partial: "Partially mailed", failed: "Failed", canceled: "Canceled" };

const RECIPIENT_STATUS = {
  sent: { color: "#059669", icon: CheckCircle2, label: "Sent" },
  failed: { color: "#dc2626", icon: AlertTriangle, label: "Failed" },
  pending_payment: { color: "#d97706", icon: Clock, label: "Pending" },
  address_verified: { color: "#2563eb", icon: CheckCircle2, label: "Verified" },
  canceled: { color: "#6b7280", icon: MailWarning, label: "Canceled" },
  draft: { color: "#6b7280", icon: Clock, label: "Draft" },
};

export default function PostcardOrderHistory({ orders }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Postal Tracking</p>
        <h2 className="font-heading text-xl font-bold text-foreground">Your postcard orders</h2>
        <p className="mt-1 text-sm text-muted-foreground">Per-recipient Lob status, tracking links, and delivery estimates for every postcard.</p>
      </div>
      {!orders.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No postcard orders yet.</div>
      ) : (
        orders.map((order) => <OrderCard key={order.id} order={order} />)
      )}
    </section>
  );
}

function OrderCard({ order }) {
  const [expanded, setExpanded] = useState(true);
  const sent = order.mailing_status === "sent";
  const recipients = order.recipients || [];
  const hasDetail = recipients.some((r) => r.status || r.tracking_url || r.failure_reason || r.expected_delivery);

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          {sent ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" /> : order.mailing_status === "failed" ? <MailWarning className="mt-0.5 h-5 w-5 text-destructive" /> : <Clock className="mt-0.5 h-5 w-5 text-amber-500" />}
          <div>
            <h3 className="font-bold text-foreground">{order.site_name || "Postcard campaign"}</h3>
            <p className="text-xs text-muted-foreground">
              {order.recipient_count || recipients.length} recipient(s) · ${Number(order.price_charged_usd || 0).toFixed(2)} · {new Date(order.created_date).toLocaleDateString()}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{ORDER_LABELS[order.mailing_status] || order.mailing_status}</span>
      </div>

      {hasDetail && (
        <div className="mt-3">
          <button onClick={() => setExpanded((v) => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Per-recipient status
          </button>
          {expanded && (
            <div className="mt-2 divide-y divide-border border border-border rounded-lg">
              {recipients.map((r, i) => {
                const s = RECIPIENT_STATUS[r.status] || RECIPIENT_STATUS.draft;
                const Icon = s.icon;
                return (
                  <div key={i} className="px-3 py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground">{r.label ? `${r.label} · ` : ""}{r.owner_name || "—"}</div>
                      <div className="text-muted-foreground truncate">{r.mailing_address}</div>
                      {r.status === "failed" && r.failure_reason && (
                        <div className="text-destructive flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" /> {r.failure_reason}</div>
                      )}
                      {r.expected_delivery && r.status === "sent" && (
                        <div className="text-muted-foreground mt-0.5">Est. delivery {r.expected_delivery}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.tracking_url && (
                        <a href={r.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                          <ExternalLink className="w-3 h-3" /> Lob
                        </a>
                      )}
                      <span className="font-bold uppercase text-[10px] tracking-wider inline-flex items-center gap-1" style={{ color: s.color }}>
                        <Icon className="w-3 h-3" /> {s.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!hasDetail && recipients.some((r) => r.tracking_url) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {recipients.filter((r) => r.tracking_url).map((r, i) => (
            <a key={i} href={r.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              <ExternalLink className="h-3 w-3" />{r.label || r.owner_name || "Track with Lob"}
            </a>
          ))}
        </div>
      )}
    </article>
  );
}