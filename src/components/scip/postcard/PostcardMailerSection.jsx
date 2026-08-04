import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Mail, Send, CheckCircle2, AlertTriangle, Clock, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { SKYWAVE } from "@/lib/skywave";
import PostcardMailerModal from "./PostcardMailerModal";

const STATUS_STYLE = {
  sent: { color: "#059669", icon: CheckCircle2, label: "Sent" },
  failed: { color: "#dc2626", icon: AlertTriangle, label: "Failed" },
  pending_payment: { color: "#d97706", icon: Clock, label: "Pending payment" },
  address_verified: { color: "#2563eb", icon: CheckCircle2, label: "Verified" },
  canceled: { color: "#6b7280", icon: AlertTriangle, label: "Canceled" },
  draft: { color: "#6b7280", icon: Clock, label: "Draft" },
};

// "Send Postcard Mailers" section for ScipDetail — button + order history with
// per-recipient Lob status, send dates, tracking links and failed-address warnings.
export default function PostcardMailerSection({ record }) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await base44.entities.PostcardMailerOrder.filter({ scip_record_id: record.id }, "-created_date", 20);
      setOrders(rows || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [record.id]);

  useEffect(() => { load(); }, [load]);

  const targets = Array.isArray(record?.parcel_targets) ? record.parcel_targets : [];
  const hasTargets = targets.some((t) => t.owner_name && (t.mailing_address || t.parcel_address));

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center gap-3 px-5 py-3.5" style={{ background: SKYWAVE.blue }}>
        <Mail className="w-5 h-5 text-white" />
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[2px]" style={{ color: SKYWAVE.yellow }}>Direct Mail Add-On</div>
          <h3 className="font-heading font-bold text-white leading-tight">Want to Mail These Property Owners?</h3>
        </div>
        <button onClick={load} title="Refresh status" className="text-white/80 hover:text-white">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 bg-card">
        <p className="text-sm text-muted-foreground mb-4">
          Choose any of your three SCIP targets and optionally add up to two more parcels you already evaluated. Add your name and logo or use SiteHawk branding, review the card, verify the addresses, then pay and mail. <strong>Up to 3 for $49 · up to 5 for $79.</strong>
        </p>

        {!hasTargets ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center" style={{ borderColor: SKYWAVE.line }}>
            Pick your SCIP targets (Step 3) first — owners with mailing data will appear here to mail.
          </div>
        ) : (
          <button onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-white font-bold transition-all"
            style={{ background: SKYWAVE.blue }}>
            <Send className="w-4 h-4" /> Send Postcard Mailers
          </button>
        )}

        {/* Order history */}
        {loading ? (
          <div className="mt-5 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading mailer history…</div>
        ) : orders.length > 0 && (
          <div className="mt-6 space-y-4">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Mailer History</p>
            {orders.map((o) => (
              <div key={o.id} className="rounded-lg border p-3" style={{ borderColor: SKYWAVE.line }}>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="text-xs font-semibold" style={{ color: SKYWAVE.navy }}>
                    {o.recipient_count || (o.recipients || []).length} postcard{(o.recipient_count || 0) !== 1 ? "s" : ""} · ${Number(o.price_charged_usd || 0).toFixed(2)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill payment={o.payment_status} mailing={o.mailing_status} />
                    {o.sent_at && <span className="text-[11px] text-muted-foreground">{format(new Date(o.sent_at), "MMM d, yyyy")}</span>}
                  </div>
                </div>
                <div className="divide-y" style={{ borderColor: SKYWAVE.line }}>
                  {(o.recipients || []).map((r, i) => {
                    const s = STATUS_STYLE[r.status] || STATUS_STYLE.draft;
                    const Icon = s.icon;
                    return (
                      <div key={i} className="py-2 flex items-start justify-between gap-3 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-foreground">{r.label ? `${r.label} · ` : ""}{r.owner_name || "—"}</div>
                          <div className="text-muted-foreground truncate">{r.mailing_address}</div>
                          {r.status === "failed" && r.failure_reason && (
                            <div className="text-red-600 flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" /> {r.failure_reason}</div>
                          )}
                          {r.expected_delivery && r.status === "sent" && (
                            <div className="text-muted-foreground mt-0.5">Est. delivery {r.expected_delivery}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.tracking_url && (
                            <a href={r.tracking_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5">
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
              </div>
            ))}
          </div>
        )}
      </div>

      {open && <PostcardMailerModal record={record} onClose={() => { setOpen(false); load(); }} onSent={load} />}
    </div>
  );
}

function Pill({ payment, mailing }) {
  const isPaid = payment === "paid";
  const txt = !isPaid ? (payment === "pending_payment" ? "Awaiting payment" : payment)
    : (mailing === "sent" ? "Mailed" : mailing === "partial" ? "Partially mailed" : mailing === "processing" ? "Processing" : mailing === "failed" ? "Mail failed" : "Paid");
  const color = !isPaid ? "#d97706" : mailing === "failed" ? "#dc2626" : mailing === "partial" ? "#d97706" : "#059669";
  return <span className="px-2 py-0.5 rounded-full text-white text-[10px] font-bold" style={{ background: color }}>{txt}</span>;
}