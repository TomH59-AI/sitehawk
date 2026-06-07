import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { stripeCheckout } from "@/functions/stripeCheckout";
import { useToast } from "@/components/ui/use-toast";
import { getEffectiveTier } from "@/lib/testAccess";
import BrandFooter from "../components/BrandFooter";

const CONTACT_EMAIL = "info@sitehawk.com";

// hawk_site = Hawk Site ($149/mo, 1 trial + 15 SCIPs) | hawkeyes = Hawkeyes ($399/mo, 1 trial + 30 SCIPs)
const PLAN_CARDS = [
  { key: "hawk_site", name: "Hawk Site", price: "$149", period: "/month", scips: "1 trial SCIP + 15 SCIPs per month", cta: "Start Hawk Site", paid: true },
  { key: "hawkeyes", name: "Hawkeyes", price: "$399", period: "/month", scips: "1 free trial + 30 SCIPs per month", cta: "Start Hawkeyes", paid: true, highlight: true },
  { key: "hawkeye_apex", name: "Hawkeye Apex", price: "Contact us", period: "", scips: "Custom quote — call or email HawkSite customer service", cta: "Contact sales", paid: false },
];

export default function PlansSelection() {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshProfile = useCallback(async () => {
    setRefreshing(true);
    try {
      const me = await base44.auth.me();
      setUser(me);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      toast({ title: "Welcome to SiteHawk! 🦅", description: "Your plan is now active." });
    }
    refreshProfile();
  }, [refreshProfile, toast]);

  const handleCheckout = async (plan) => {
    if (plan.key === "hawk_command") {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("SiteHawk HawkCommand")}`;
      return;
    }
    if (window.self !== window.top) {
      alert("Checkout is only available from the published app. Please open the app directly.");
      return;
    }
    setCheckoutPlan(plan.key);
    try {
      const res = await stripeCheckout({ action: "checkout", plan: plan.key });
      const { url, error } = res.data || {};
      if (error) throw new Error(error);
      if (!url) throw new Error("Stripe checkout did not return a redirect URL.");
      window.location.assign(url);
    } catch (err) {
      toast({ title: "Checkout Error", description: err.message || "Could not start checkout.", variant: "destructive" });
      setCheckoutPlan(null);
    }
  };

  const currentTier = user ? getEffectiveTier(user) : null;

  return (
    <div className="space-y-10">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">SiteHawk plans</p>
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-foreground">Choose your SCIP capacity</h1>
        <p className="text-muted-foreground text-sm">Scanning is always free. SCIP generation is what each plan covers.</p>
        {currentTier && (
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="text-muted-foreground/70">Current tier:</span>
            <span className="font-mono text-primary">{currentTier}</span>
            {refreshing && <span className="text-muted-foreground/60">· refreshing…</span>}
          </div>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-3 max-w-5xl mx-auto">
        {PLAN_CARDS.map((plan) => {
          const isCurrent = currentTier === plan.key;
          const isLoading = checkoutPlan === plan.key;
          return (
            <article
              key={plan.key}
              className={`flex flex-col rounded-2xl border p-6 ${plan.highlight ? "border-accent bg-card shadow-2xl shadow-accent/10 scale-[1.02]" : "border-border bg-card"}`}
            >
              <div className="flex-1">
                <h2 className="font-heading font-bold text-xl text-foreground">{plan.name}</h2>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-heading font-bold text-4xl text-foreground">{plan.price}</span>
                  {plan.period && <span className="text-muted-foreground text-sm">{plan.period}</span>}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{plan.scips}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCheckout(plan)}
                disabled={isCurrent || Boolean(checkoutPlan)}
                className={`mt-6 rounded-lg px-4 py-2 text-sm font-heading font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  plan.paid
                    ? plan.highlight
                      ? "bg-accent text-accent-foreground hover:bg-accent/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-primary/40 text-primary hover:bg-primary/10"
                }`}
              >
                {isCurrent ? "Current Plan" : isLoading ? "Opening checkout…" : plan.cta}
              </button>
            </article>
          );
        })}
      </div>

      <BrandFooter />
    </div>
  );
}