import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Check, Zap, Star, Crown } from "lucide-react";
import HawkIcon from "../components/HawkIcon";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { stripeCheckout } from "@/functions/stripeCheckout";
import BrandFooter from "../components/BrandFooter";

const tiers = [
  {
    id: "hawk_site",
    name: "Hawk Site",
    price: "$69",
    period: "/month",
    description: "Entry-level plan for individual site acquisition specialists.",
    Icon: Zap,
    iconColor: "text-primary",
    iconBg: "bg-primary/10 border-primary/20",
    features: [
      "1 Target Search per day",
      "1 seat",
      "Satellite map view",
      "Scored & ranked candidate parcels",
      "SiteHawk AI Consultant",
    ],
    excludes: [
      "No PDF / CSV exports",
      "No mailer",
      "No skip trace",
    ],
    cta: "Get Started — $69/mo",
    highlight: false,
    badge: null,
  },
  {
    id: "hawkeyes",
    name: "Hawkeyes",
    price: "$199",
    period: "/month",
    description: "The team plan for small site acquisition firms.",
    Icon: Star,
    iconColor: "text-accent",
    iconBg: "bg-accent/10 border-accent/20",
    features: [
      "5 Target Searches per day",
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
    cta: "Subscribe — $199/mo",
    highlight: true,
    badge: "Most Popular",
  },
  {
    id: "hawkeye_apex",
    name: "Hawkeye Apex",
    price: "Licensed",
    period: "",
    description: "Enterprise-scale deployment for serious acquisition teams.",
    Icon: Crown,
    iconColor: "text-yellow-400",
    iconBg: "bg-yellow-400/10 border-yellow-400/20",
    features: [
      "Unlimited Target Searches per day",
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
    <div className="space-y-12">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-2">
          <HawkIcon size={18} />
          <span className="text-xs uppercase tracking-[0.2em] text-primary font-bold">Powered by Hawkeye AI Intelligence</span>
        </div>
        <h1 className="font-heading font-bold text-4xl md:text-5xl text-foreground leading-tight">
          SiteHawk: The Premier Research Tool<br className="hidden md:block" /> for Wireless Infrastructure.
        </h1>
        <p className="text-muted-foreground text-base mt-3 max-w-xl mx-auto leading-relaxed">
          It's not just data, it's prophecy.
        </p>
      </div>

      {/* S.A.I.R. spotlight */}
      <div className="max-w-4xl mx-auto rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-6 flex flex-col md:flex-row items-center gap-6">
        <div className="shrink-0 w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shadow-lg text-3xl">
          📡
        </div>
        <div className="flex-1 text-center md:text-left">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-1">Included with Hawkeyes & Hawkeye Apex</p>
          <h2 className="font-heading font-bold text-xl text-foreground">S.A.I.R. — Site AI Intelligence Report</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Every scan generates a full <span className="text-cyan-400 font-semibold">Site AI Intelligence Report (S.A.I.R.)</span> — zoning analysis, regulatory context, LDC section references, scored candidates, owner data, airport proximity, and cell tower density. The complete intelligence package for every acquisition decision.
          </p>
          <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
            {["Zoning & LDC References", "Owner Skip Trace", "Airport Proximity", "Cell Tower Density", "PDF Export"].map(f => (
              <span key={f} className="px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-medium">{f}</span>
            ))}
          </div>
        </div>
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
                  <p className="text-xs text-yellow-400 font-semibold mt-1">Contact us for enterprise pricing</p>
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