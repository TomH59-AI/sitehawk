import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Check, Zap, Star, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { stripeCheckout } from "@/functions/stripeCheckout";
import BrandFooter from "../components/BrandFooter";

const tiers = [
  {
    id: "hawk_site",
    name: "Hawk Site",
    price: "$249",
    period: "/month",
    description: "Entry-level plan for individual site acquisition specialists.",
    Icon: Zap,
    iconColor: "text-primary",
    iconBg: "bg-primary/10 border-primary/20",
    features: [
      "7-day free trial — no charge today",
      "15 Search Rings per month",
      "Each ring includes Targets A, B & C",
      "Satellite map view",
      "Scored & ranked candidate parcels",
      "SiteHawk AI Consultant",
    ],
    excludes: [
      "No PDF / CSV exports",
      "No mailer",
      "No skip trace",
    ],
    cta: "Start Free Trial — $249/mo after",
    highlight: false,
    badge: "7-Day Free Trial",
  },
  {
    id: "hawkeyes",
    name: "Hawkeyes",
    price: "$599",
    period: "/month",
    description: "The team plan for small site acquisition firms.",
    Icon: Star,
    iconColor: "text-accent",
    iconBg: "bg-accent/10 border-accent/20",
    features: [
      "7-day free trial — no charge today",
      "40 Search Rings per month",
      "Each ring includes Targets A, B & C",
      "3 team seats",
      "PDF & CSV exports",
      "Full S.A.I.R. Generation",
      "Zoning & Regulatory Library",
      "Built-in CRM (Deal Pipeline)",
      "SiteHawk AI Consultant",
    ],
    excludes: [
      "No mailer",
      "No skip trace",
    ],
    cta: "Start Free Trial — $599/mo after",
    highlight: true,
    badge: "Most Popular",
  },
  {
    id: "hawkeye_apex",
    name: "Hawkeye Apex",
    price: "Contact us",
    period: "",
    description: "Enterprise-scale deployment for serious acquisition teams.",
    Icon: Crown,
    iconColor: "text-yellow-400",
    iconBg: "bg-yellow-400/10 border-yellow-400/20",
    features: [
      "Unlimited Search Rings",
      "Unlimited team seats",
      "PDF & CSV exports",
      "One-click mailer included",
      "Skip trace included",
      "Full S.A.I.R. Generation",
      "Dedicated account team",
    ],
    excludes: [],
    cta: "Contact Sales",
    highlight: false,
    badge: "Enterprise",
    contactOnly: true,
  },
];

export default function Pricing() {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);

  useEffect(() => {
    async function load() {
      const urlParams = new URLSearchParams(window.location.search);

      if (urlParams.get("checkout") === "success") {
        const plan = urlParams.get("plan") || "hawkeye_20";
        await stripeCheckout({ action: "complete_checkout", plan });
        window.history.replaceState({}, "", window.location.pathname);
        toast({
          title: "Welcome to SiteHawk! 🦅",
          description: "Your hawk vision is now active. Start scanning!",
        });
      }

      const me = await base44.auth.me();
      setUser(me);
      setLoading(false);
    }
    load();
  }, []);

  const handleCheckout = async (plan, contactOnly = false) => {
    if (contactOnly) {
      window.location.href = "mailto:support@site-hawk-pro.com?subject=Hawkeye%20Apex%20Inquiry";
      return;
    }
    if (window.self !== window.top) {
      alert("Checkout is only available from the published app. Please open the app directly.");
      return;
    }
    setCheckoutLoading(plan);
    try {
      const res = await stripeCheckout({ action: "checkout", plan });
      const { url, error } = res.data;
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      toast({ title: "Checkout Error", description: err.message || "Could not start checkout.", variant: "destructive" });
      setCheckoutLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const currentTier = user?.tier || "blind";

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">📡</span>
        <h1 className="font-heading font-bold text-3xl text-foreground">SiteHawk Prices</h1>
      </div>

      {/* Tier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {tiers.map((tier) => {
          const isCurrent = currentTier === tier.id;
          const TierIcon = tier.Icon;
          return (
            <div
              key={tier.id}
              className={`rounded-2xl border p-6 flex flex-col relative transition-all duration-300 ${
                tier.highlight
                  ? "border-accent bg-card shadow-2xl shadow-accent/10 scale-[1.02]"
                  : tier.contactOnly
                  ? "border-yellow-400/30 bg-card shadow-xl shadow-yellow-400/5"
                  : "border-border bg-card"
              }`}
            >
              {tier.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold font-heading whitespace-nowrap ${
                  tier.highlight ? "bg-accent text-accent-foreground" :
                  tier.id === "hawkeye_apex" ? "bg-yellow-400 text-black" :
                  "bg-primary text-primary-foreground"
                }`}>
                  {tier.badge}
                </div>
              )}

              <div className="mb-6">
                <div className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-4 ${tier.iconBg}`}>
                  <TierIcon className={`w-6 h-6 ${tier.iconColor}`} />
                </div>
                <h3 className="font-heading font-bold text-xl text-foreground leading-tight">{tier.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tier.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-heading font-bold text-4xl text-foreground">{tier.price}</span>
                  {tier.period && <span className="text-muted-foreground text-sm">{tier.period}</span>}
                </div>
                {tier.contactOnly && (
                  <p className="text-xs text-yellow-400 font-semibold mt-1">Call or email HawkSite customer service for a quote</p>
                )}
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${
                      tier.highlight ? "text-accent" :
                      tier.id === "hawkeye_apex" ? "text-yellow-400" :
                      "text-primary"
                    }`} />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
                {tier.excludes?.map((ex) => (
                  <li key={ex} className="flex items-start gap-2 text-sm opacity-40">
                    <span className="w-4 h-4 mt-0.5 shrink-0 text-center text-xs">✕</span>
                    <span className="text-muted-foreground">{ex}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full font-heading font-semibold ${
                  tier.highlight ? "bg-accent hover:bg-accent/90 text-accent-foreground" :
                  tier.id === "hawkeye_license" ? "bg-yellow-500 hover:bg-yellow-600 text-white" : ""
                } ${isCurrent ? "opacity-50 cursor-not-allowed" : ""}`}
                variant={tier.highlight || tier.id === "hawkeye_license" ? "default" : "default"}
                disabled={isCurrent || (checkoutLoading === tier.id && !tier.contactOnly)}
                onClick={() => handleCheckout(tier.id, tier.contactOnly)}
              >
                {isCurrent ? "Current Plan" : checkoutLoading === tier.id && !tier.contactOnly ? "Redirecting..." : tier.cta}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Branded footer */}
      <BrandFooter />
    </div>
  );
}