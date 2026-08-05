import { CheckCircle2, Clock, ExternalLink, MailWarning } from "lucide-react";

const labels = { draft: "Draft", pending_payment: "Awaiting payment", processing: "Processing", sent: "Mailed", partial: "Partially mailed", failed: "Failed", canceled: "Canceled" };
export default function PostcardOrderHistory({ orders }) {
  return (
    <section className="space-y-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Postal Tracking</p><h2 className="font-heading text-xl font-bold text-foreground">Your postcard orders</h2></div>
      {!orders.length ? <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No postcard orders yet.</div> : orders.map((order) => {
        const sent = order.mailing_status === "sent";
        return <article key={order.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">{sent ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" /> : order.mailing_status === "failed" ? <MailWarning className="mt-0.5 h-5 w-5 text-destructive" /> : <Clock className="mt-0.5 h-5 w-5 text-amber-500" />}<div><h3 className="font-bold text-foreground">{order.site_name || "Postcard campaign"}</h3><p className="text-xs text-muted-foreground">{order.recipient_count || order.recipients?.length || 0} recipient(s) · ${Number(order.price_charged_usd || 0).toFixed(2)} · {new Date(order.created_date).toLocaleDateString()}</p></div></div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{labels[order.mailing_status] || order.mailing_status}</span>
          </div>
          {(order.recipients || []).some((recipient) => recipient.tracking_url) && <div className="mt-3 flex flex-wrap gap-2">{order.recipients.filter((recipient) => recipient.tracking_url).map((recipient, index) => <a key={index} href={recipient.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ExternalLink className="h-3 w-3" />{recipient.label || recipient.owner_name || "Track with Lob"}</a>)}</div>}
        </article>;
      })}
    </section>
  );
}