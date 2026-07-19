/**
 * Billing page — /billing
 * Shows current tier, next billing date, and Stripe Customer Portal link.
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { TIERS } from "@/lib/billingConfig";
import { hawkBillingPortal } from "@/functions/hawkBillingPortal";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import DeleteAccountSection from "@/components/billing/DeleteAccountSection";
import BillingUsageSection from "@/components/billing/BillingUsageSection";

const STATUS_BADGE = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  trialing: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  past_due: "bg-red-500/10 text-red-700 dark:text-red-400",
  canceled: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  unknown: "bg-secondary text-muted-foreground",
};

export default function Billing() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") setSuccess(true);
    base44.auth.me().then(u => { setUser(u); setLoading(false); });
  }, []);

  const tierKey = user?.tier || "free";
  const tier = TIERS[tierKey] || TIERS.free;
  const status = user?.subscription_status || "unknown";

  const handlePortal = async () => {
    if (window.self !== window.top) {
      alert("Billing portal works only from the published app.");
      return;
    }
    setPortalLoading(true);
    setError(null);
    const res = await hawkBillingPortal({ return_url: window.location.href });
    if (res.data?.url) {
      window.location.href = res.data.url;
    } else {
      setError(res.data?.error || "Could not open billing portal");
      setPortalLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-primary" /> Billing & Subscription
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your SiteHawk plan and payment method.</p>
      </div>

      {success && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">Subscription activated! Your features are now unlocked.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Current plan card */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Current Plan</div>
            <div className="text-2xl font-bold text-foreground">{tier.label || "Free"}</div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[status]}`}>
            {status === "active" ? "Active" : status === "trialing" ? "Trial" : status === "past_due" ? "Past Due" : status === "canceled" ? "Canceled" : "—"}
          </span>
        </div>

        {/* Plan features */}
        <div className="space-y-1.5 text-sm text-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{tier.unlimited ? "Unlimited SCIPs" : tier.scip_quota > 0 ? `${tier.scip_quota} SCIPs/month` : "No SCIP access"}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{tier.unlimited ? "Unlimited lease sites" : tier.lease_site_cap > 0 ? `Up to ${tier.lease_site_cap} lease sites` : "No HawkLease access"}</span>
          </div>
          <div className={`flex items-center gap-2 ${!tier.hawk_law ? "opacity-40" : ""}`}>
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${tier.hawk_law ? "text-emerald-500" : "text-muted-foreground"}`} />
            <span>Hawk Law {tier.hawk_law ? "✓" : "(not included)"}</span>
          </div>
          <div className={`flex items-center gap-2 ${!tier.carrier_overlay ? "opacity-40" : ""}`}>
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${tier.carrier_overlay ? "text-emerald-500" : "text-muted-foreground"}`} />
            <span>Carrier overlay {tier.carrier_overlay ? "✓" : "(not included)"}</span>
          </div>
        </div>

        {/* Next billing date */}
        {user?.stripe_current_period_end && (
          <div className="text-xs text-muted-foreground border-t border-border pt-3">
            Next billing date: {new Date(user.stripe_current_period_end).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        )}

        {/* Portal button */}
        {user?.stripe_customer_id && status !== "canceled" && (
          <Button onClick={handlePortal} disabled={portalLoading} variant="outline" className="w-full gap-2">
            <ExternalLink className="w-4 h-4" />
            {portalLoading ? "Opening portal…" : "Manage plan, payment method & invoices"}
          </Button>
        )}
      </div>

      {/* Per-customer usage */}
      <BillingUsageSection leaseSiteCap={tier.lease_site_cap} />

      {/* Danger zone */}
      <DeleteAccountSection />
    </div>
  );
}