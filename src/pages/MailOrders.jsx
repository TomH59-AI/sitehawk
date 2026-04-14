import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { getMailOrders } from "@/functions/getMailOrders";
import { updateMailOrderStatus } from "@/functions/updateMailOrderStatus";
import { Mail, RefreshCw, ExternalLink, MapPin, User, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const STATUS_CONFIG = {
  pending:   { label: "Pending",   color: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  printing:  { label: "Printing",  color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  mailed:    { label: "Mailed",    color: "bg-violet-500/10 text-violet-400 border-violet-500/30" },
  delivered: { label: "Delivered", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
};
const STATUS_FLOW = ["pending", "printing", "mailed", "delivered"];

export default function MailOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchOrders = async () => {
    setLoading(true);
    const me = await base44.auth.me();
    if (me?.role !== "admin") { navigate("/dashboard"); return; }
    const res = await getMailOrders({});
    setOrders(res.data?.orders || []);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  const advanceStatus = async (order) => {
    const currentIdx = STATUS_FLOW.indexOf(order.fulfillment_status);
    if (currentIdx === STATUS_FLOW.length - 1) return;
    const nextStatus = STATUS_FLOW[currentIdx + 1];
    setUpdatingId(order.id);
    await updateMailOrderStatus({ session_id: order.id, status: nextStatus });
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, fulfillment_status: nextStatus } : o));
    toast({ title: `Order updated to "${STATUS_CONFIG[nextStatus].label}"` });
    setUpdatingId(null);
  };

  const counts = STATUS_FLOW.reduce((acc, s) => {
    acc[s] = orders.filter(o => o.fulfillment_status === s).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground flex items-center gap-2">
            <Mail className="w-6 h-6 text-violet-400" /> Mail Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Direct mail fulfillment dashboard — admin only</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOrders} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATUS_FLOW.map(s => (
          <div key={s} className={`rounded-xl border px-4 py-3 ${STATUS_CONFIG[s].color}`}>
            <p className="text-xs font-bold uppercase tracking-wider">{STATUS_CONFIG[s].label}</p>
            <p className="text-2xl font-heading font-bold mt-1">{counts[s]}</p>
          </div>
        ))}
      </div>

      {/* Orders */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
          <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No mail orders yet</p>
          <p className="text-sm mt-1">Orders will appear here once customers purchase a campaign.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders
            .sort((a, b) => b.created - a.created)
            .map(order => {
              const cfg = STATUS_CONFIG[order.fulfillment_status] || STATUS_CONFIG.pending;
              const isLast = order.fulfillment_status === "delivered";
              const isUpdating = updatingId === order.id;
              return (
                <div key={order.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-muted-foreground font-medium">
                          {order.letters} Letters · ${(order.amount / 100).toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(order.created * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">{order.owner_name || "Unknown Owner"}</span>
                        <span className="text-xs text-muted-foreground">· ordered by {order.user_email}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isLast && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpdating}
                          onClick={() => advanceStatus(order)}
                          className="gap-1.5 text-xs"
                        >
                          {isUpdating
                            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Saving...</>
                            : <><Package className="w-3 h-3" /> Mark as {STATUS_CONFIG[STATUS_FLOW[STATUS_FLOW.indexOf(order.fulfillment_status) + 1]]?.label}</>
                          }
                        </Button>
                      )}
                      <a
                        href={`https://dashboard.stripe.com/payments/${order.payment_intent}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
                        title="View in Stripe"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <p className="text-muted-foreground font-medium">Mail To</p>
                        <p className="text-foreground font-semibold">{order.mailing_address}</p>
                      </div>
                    </div>
                    {order.parcel_address && (
                      <div className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-muted-foreground font-medium">Parcel Address</p>
                          <p className="text-foreground font-semibold">{order.parcel_address}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Fulfillment progress */}
                  <div className="flex items-center gap-1">
                    {STATUS_FLOW.map((s, i) => {
                      const currentIdx = STATUS_FLOW.indexOf(order.fulfillment_status);
                      const done = i <= currentIdx;
                      return (
                        <div key={s} className="flex items-center gap-1 flex-1">
                          <div className={`h-1.5 flex-1 rounded-full transition-all ${done ? "bg-primary" : "bg-secondary"}`} />
                          {i === STATUS_FLOW.length - 1 && null}
                        </div>
                      );
                    })}
                    <span className="text-[10px] text-muted-foreground ml-1 whitespace-nowrap">{cfg.label}</span>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}