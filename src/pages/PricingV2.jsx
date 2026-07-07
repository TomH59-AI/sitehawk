/**
 * PricingV2 — SiteHawk pricing page.
 * Three tiers: HawkSite Solo ($299), HawkVision Pro ($599), Hawk Enterprise (custom).
 */
import { useState } from "react";
import { CheckCircle2, ArrowRight, Zap, Building2, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIERS } from "@/lib/billingConfig";
import { hawkBillingCheckout } from "@/functions/hawkBillingCheckout";
import HawkCommandContactForm from "@/components/billing/HawkCommandContactForm";
import HawkIcon from "@/components/HawkIcon";
import { Link } from "react-router-dom";

const PLANS = [
  {
    key: "hawk_site",
    emoji: "🦅",
    name: "HawkSite Solo",
    tagline: "The independent specialist's engine.",
    highlight: false,
    badge: null,
    ctaLabel: "Start Solo Plan",
    description: "Everything you need to find the site, hit the owner, and manage your pipeline. Pays for itself the first time you skip a manual zoning hunt.",
    features: [
      "15 SCIPs per month (Site Acquisition Intelligence Reports)",
      "Basic HawkLease — track up to 5 active lease sites",
      "Hawk Infrastructure Vision Maps (Viewshed, FEMA, Zoning overlays)",
      "SCIP CRM Pipeline — track your 14-stage deals seamlessly",
      "Postcard Mailer Outreach — integrated Lob automation",
    ],
    missing: [
      "Hawk Law toolkit not included",
    ],
  },
  {
    key: "hawk_vision",
    emoji: "🚀",
    name: "HawkVision Pro",
    tagline: "The heavy-hitting dealmaker's toolkit.",
    highlight: true,
    badge: "Most Popular",
    ctaLabel: "Upgrade to Pro",
    description: "For the specialist handling volume and negotiating paper. Bring an AI telecom attorney to the table and cut your redlining time in half.",
    features: [
      "30 SCIPs per month",
      "Unlimited Hawk Law Sessions — clause-by-clause triage, redlining & risk briefs",
      "Full HawkLease — track up to 25 lease sites",
      "AI Site Renders — show the landowner exactly what the tower will look like",
      "Carrier Overlay Records in Comp Library",
      "Includes all HawkSite Solo features",
    ],
    missing: [],
  },
];

function PlanCard({ plan, onSelect, loading }) {
  const tier = TIERS[plan.key];
  return (
    <div className={`relative rounded-2xl border bg-card flex flex-col transition-all
      ${plan.highlight
        ? "border-primary shadow-xl shadow-primary/15 ring-2 ring-primary/30"
        : "border-border shadow-sm"}`}>
      {plan.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-primary text-primary-foreground whitespace-nowrap shadow">
            {plan.badge}
          </span>
        </div>
      )}

      {/* Header */}
      <div className={`p-6 pb-5 rounded-t-2xl ${plan.highlight ? "bg-primary/5" : ""}`}>
        <div className="text-3xl mb-1">{plan.emoji}</div>
        <h2 className="font-heading font-bold text-xl text-foreground">{plan.name}</h2>
        <p className="text-sm text-muted-foreground mt-0.5 mb-3">{plan.tagline}</p>
        <div className="flex items-end gap-1">
          <span className="text-2xl font-bold text-foreground">Based on Customer Usage</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{plan.description}</p>
      </div>

      {/* Features */}
      <div className="px-6 py-5 flex-1 space-y-2.5">
        {plan.features.map((f, i) => (
          <div key={i} className="flex items-start gap-2.5 text-sm text-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>{f}</span>
          </div>
        ))}
        {plan.missing.map((f, i) => (
          <div key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground/50">
            <X className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{f}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="px-6 pb-6 pt-2">
        <Button
          onClick={() => onSelect(tier.priceId)}
          disabled={loading === tier.priceId}
          variant={plan.highlight ? "default" : "outline"}
          className="w-full gap-1.5 h-11 text-sm font-semibold"
        >
          {loading === tier.priceId ? "Redirecting…" : plan.ctaLabel}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
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
      {open && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{a}</p>}
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
    <div className="max-w-5xl mx-auto py-12 px-4 space-y-16">

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

      {/* Enterprise / Corporate Users block — shown above plan cards */}
      <div id="hawk-command" className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-8 space-y-2 border-b border-border bg-secondary/30">
          <div className="flex items-start gap-4">
            <Building2 className="w-8 h-8 text-primary shrink-0 mt-1" />
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-heading font-bold text-2xl text-foreground">🏢 Hawk Enterprise — Corporate Users</h2>
                <span className="text-xs font-semibold bg-secondary text-muted-foreground px-3 py-1 rounded-full">Custom Pricing</span>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">For vendor agencies and regional firms.</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed pt-1">
            Managing a team of specialists? Get admin-level oversight, compliance tools, and pooled data.
          </p>
        </div>
        <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            "Custom SCIP & Lease Volumes — pooled across your entire team",
            "Team CRM Roll-ups & Analytics",
            "Hawk Compliance — NEPA / Section 106 screening & Form 620/621 generation",
            "B2B Marketing Stack — Apollo.io imports & campaign builder",
            "Dedicated API Access & Support",
          ].map((f, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm text-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>{f}</span>
            </div>
          ))}
        </div>
        <div className="px-8 pb-8">
          <HawkCommandContactForm />
        </div>
      </div>

      {/* 3-Day Free Trial Banner */}
      <Link
        to="/search"
        className="block group rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-to-r from-primary/5 via-primary/10 to-accent/5 hover:border-primary/70 hover:from-primary/10 hover:via-primary/15 hover:to-accent/10 transition-all p-6 text-center"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <HawkIcon size={48} />
            <div className="text-left">
              <div className="inline-flex items-center gap-2 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full px-3 py-1 text-xs font-bold mb-1">
                ✨ No credit card required
              </div>
              <h3 className="font-heading font-bold text-xl text-foreground">Try SiteHawk Free for 3 Days</h3>
              <p className="text-sm text-muted-foreground">2 SCIPs/day · Full AI scanning · Airport + cell tower data included</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-heading font-bold text-sm group-hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
            🦅 Get Started Now <ArrowRight className="w-4 h-4" />
          </div>
          <p className="text-xs text-muted-foreground">Click to go directly to Site Search — no signup wall.</p>
        </div>
      </Link>

      {/* Plan cards — 2 column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 max-w-3xl mx-auto">
        {PLANS.map(plan => (
          <PlanCard key={plan.key} plan={plan} onSelect={handleSelect} loading={loading} />
        ))}
      </div>



      {/* FAQ */}
      <div className="max-w-2xl mx-auto">
        <h2 className="font-heading font-bold text-xl text-foreground mb-4">Frequently asked questions</h2>
        <FAQItem q="Can I cancel anytime?" a="Yes. Cancel through the Stripe billing portal at any time. Your access continues until the end of the current billing period." />
        <FAQItem q="What counts as a SCIP?" a="One SCIP is consumed the first time you run the Zoning & Permitting analysis for a given site location. Re-running the same site does not count again." />
        <FAQItem q="Can I upgrade mid-month?" a="Yes. Stripe prorates the difference. You'll be charged only for the remaining days on your new plan." />
        <FAQItem q="Does HawkVision Pro include Hawk Law?" a="Yes — HawkVision Pro includes unlimited Hawk Law sessions: triage, clause-by-clause review, redlining, risk briefs, and attorney export packets." />
        <FAQItem q="Is HawkVision Pro right for me?" a="If you're negotiating leases, dealing with tower vendors, or running volume — yes. The AI lease attorney alone typically saves hours per deal." />
        <FAQItem q="Is Hawk Enterprise self-serve?" a="No. Hawk Enterprise is a custom arrangement. Use the contact form above and we'll reach out within one business day." />
      </div>

    </div>
  );
}