/**
 * PricingV2 — SiteHawk pricing page with Stripe Checkout integration.
 * Replaces /pricing route.
 */
import { useState } from "react";
import { CheckCircle2, ArrowRight, Zap, Building2, Scale, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIERS } from "@/lib/billingConfig";
import { hawkBillingCheckout } from "@/functions/hawkBillingCheckout";
import HawkCommandContactForm from "@/components/billing/HawkCommandContactForm";

const TIER_CARDS = [
  {
    key: "hawk_site",
    highlight: false,
    badge: null,
    features: [
      "15 SCIPs per month",
      "Basic HawkLease (up to 5 lease sites)",
      "Hawk Infrastructure Vision maps",
      "SCIP CRM pipeline",
      "Postcard mailer outreach",
    ],
    missing: ["Hawk Law toolkit", "Carrier overlay records"],
  },
  {
    key: "hawk_site_law",
    highlight: false,
    badge: "Adds Hawk Law",
    features: [
      "Everything in HawkSite",
      "Full Hawk Law: triage, review, redline, risk, brief, export",
      "Unlimited Hawk Law sessions",
    ],
    missing: ["Carrier overlay records"],
  },
  {
    key: "hawk_vision",
    highlight: true,
    badge: "Most Popular",
    features: [
      "30 SCIPs per month",
      "Full HawkLease (up to 25 lease sites)",
      "Carrier overlay records in Comp Library",
      "All HawkSite features",
    ],
    missing: ["Hawk Law toolkit"],
  },
  {
    key: "hawk_vision_law",
    highlight: false,
    badge: "Best Value",
    features: [
      "Everything in HawkVision",
      "Full Hawk Law toolkit",
      "Unlimited Hawk Law sessions",
      "30 SCIPs + 25 lease sites",
    ],
    missing: [],
  },
];

function TierCard({ card, onSelect, loading }) {
  const tier = TIERS[card.key];
  return (
    <div className={`relative rounded-2xl border bg-card p-6 flex flex-col gap-4 transition-all
      ${card.highlight ? "border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/30" : "border-border"}`}>
      {card.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap
            ${card.highlight ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
            {card.badge}
          </span>
        </div>
      )}
      <div>
        <div className="font-heading font-bold text-xl text-foreground">{tier.label}</div>
        <div className="mt-1 flex items-end gap-1">
          <span className="text-3xl font-bold text-foreground">${tier.monthly_usd}</span>
          <span className="text-muted-foreground text-sm mb-1">/month</span>
        </div>
      </div>
      <ul className="space-y-2 flex-1">
        {card.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
        {card.missing.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground/50">
            <span className="w-4 h-4 shrink-0 mt-0.5 text-center">—</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button
        onClick={() => onSelect(tier.priceId)}
        disabled={loading === tier.priceId}
        variant={card.highlight ? "default" : "outline"}
        className="w-full gap-1"
      >
        {loading === tier.priceId ? "Redirecting…" : "Get started"}
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border py-4">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left gap-2">
        <span className="text-sm font-medium text-foreground">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <p className="mt-2 text-sm text-muted-foreground">{a}</p>}
    </div>
  );
}

export default function PricingV2() {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);

  const handleSelect = async (priceId) => {
    if (window.self !== window.top) {
      alert("Checkout works only from the published app. Please open in a full browser window.");
      return;
    }
    setLoading(priceId);
    setError(null);
    const res = await hawkBillingCheckout({
      price_id: priceId,
      success_url: `${window.location.origin}/billing?success=1`,
      cancel_url: window.location.href,
    });
    if (res.data?.url) {
      window.location.href = res.data.url;
    } else {
      setError(res.data?.error || "Could not start checkout.");
      setLoading(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 space-y-16">
      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium">
          <Zap className="w-4 h-4" /> SiteHawk Pricing
        </div>
        <h1 className="font-heading font-bold text-4xl text-foreground">Simple, transparent pricing</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Pick the plan that fits your acquisition volume. Cancel or change anytime.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 pt-4">
        {TIER_CARDS.map(card => (
          <TierCard key={card.key} card={card} onSelect={handleSelect} loading={loading} />
        ))}
      </div>

      {/* Free Hawk Law triage callout */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-6 py-5 flex items-start gap-4">
        <Scale className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-foreground">Try Hawk Law free — one triage per account</div>
          <p className="text-sm text-muted-foreground mt-1">
            Every SiteHawk account gets one complimentary Hawk Law document triage, no credit card required.
            Upgrade to HawkSite + Hawk Law or HawkVision + Hawk Law for unlimited access.
          </p>
        </div>
      </div>

      {/* HawkCommand */}
      <div id="hawk-command" className="bg-card border border-border rounded-2xl p-8 space-y-6">
        <div className="flex items-start gap-4">
          <Building2 className="w-8 h-8 text-primary shrink-0 mt-1" />
          <div>
            <h2 className="font-heading font-bold text-2xl text-foreground">HawkCommand — Enterprise</h2>
            <p className="text-muted-foreground mt-1">
              Unlimited SCIPs, unlimited lease sites, full Hawk Law, dedicated support, and custom enterprise features. 
              Contact us for a quote tailored to your team's volume.
            </p>
          </div>
        </div>
        <HawkCommandContactForm />
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto space-y-0">
        <h2 className="font-heading font-bold text-xl text-foreground mb-4">Frequently asked questions</h2>
        <FAQItem q="Can I cancel anytime?" a="Yes. Cancel through the Stripe billing portal at any time. Your access continues until the end of the current billing period." />
        <FAQItem q="What counts as a SCIP?" a="One SCIP is consumed the first time you run the Zoning & Permitting (generateZoningPermitReport) for a given site location. Re-running the same site does not count again." />
        <FAQItem q="Can I upgrade mid-month?" a="Yes. Stripe prorates the difference. You'll be charged only for the remaining days on your new plan." />
        <FAQItem q="What is the free Hawk Law triage?" a="Every account gets one complimentary document triage to try Hawk Law — no subscription needed. After that, a Hawk Law add-on plan is required." />
        <FAQItem q="Is HawkCommand self-serve?" a="No. HawkCommand is a custom enterprise arrangement. Use the contact form above and we'll reach out within one business day." />
      </div>
    </div>
  );
}