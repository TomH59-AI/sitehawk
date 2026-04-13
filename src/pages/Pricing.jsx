import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Check, Zap, Building, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const tiers = [
  {
    id: "free",
    name: "Free Trial",
    price: "$0",
    period: "",
    description: "Try SiteHawk with 1 free search",
    icon: Radio,
    features: [
      "1 search total",
      "Top 5 candidate parcels",
      "Full parcel data",
      "Map visualization",
    ],
    cta: "Current Plan",
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: "$29",
    priceYearly: "$290",
    period: "/month",
    description: "For active site acquisition professionals",
    icon: Zap,
    features: [
      "50 searches per month",
      "Top 5 candidate parcels",
      "'Need More?' — 3 additional candidates",
      "Full parcel & owner contact data",
      "Map visualization",
      "Search history & analytics",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
    popular: true,
  },
];

export default function Pricing() {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState("monthly");

  useEffect(() => {
    async function load() {
      const me = await base44.auth.me();
      setUser(me);
      setLoading(false);
    }
    load();
  }, []);

  const handleUpgrade = async (tierId) => {
    if (tierId === "enterprise") {
      toast({ title: "Contact Sales", description: "Please reach out to our sales team for Enterprise pricing." });
      return;
    }
    await base44.auth.updateMe({ tier: tierId });
    setUser({ ...user, tier: tierId });
    toast({ title: "Plan updated!", description: `You are now on the ${tierId} plan.` });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const currentTier = user?.tier || "free";

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground">Choose Your Plan</h1>
        <p className="text-muted-foreground text-sm mt-2">
          Scale your cell tower prospecting with the right plan
        </p>
        <div className="mt-4 inline-flex items-center rounded-lg border border-border bg-secondary p-1 gap-1">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${billingCycle === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${billingCycle === "yearly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Yearly <span className="text-xs text-emerald-400 font-semibold">Save $58</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {tiers.map((tier) => {
          const isCurrent = currentTier === tier.id;
          const displayPrice = tier.priceMonthly
            ? billingCycle === "yearly" ? tier.priceYearly : tier.priceMonthly
            : tier.price;
          const displayPeriod = tier.priceMonthly
            ? billingCycle === "yearly" ? "/year" : "/month"
            : "";
          return (
            <div
              key={tier.id}
              className={`rounded-xl border p-6 flex flex-col relative transition-all duration-300 ${
                tier.popular
                  ? "border-primary bg-card shadow-lg shadow-primary/5"
                  : "border-border bg-card"
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold font-heading">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${
                  tier.popular ? "bg-primary/10" : "bg-secondary"
                }`}>
                  <tier.icon className={`w-5 h-5 ${tier.popular ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <h3 className="font-heading font-bold text-xl text-foreground">{tier.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{tier.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-heading font-bold text-3xl text-foreground">{displayPrice}</span>
                  <span className="text-muted-foreground text-sm">{displayPeriod}</span>
                </div>
              </div>

              <ul className="space-y-3 flex-1 mb-6">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full font-heading font-semibold ${isCurrent ? "opacity-50 cursor-not-allowed" : ""}`}
                variant={tier.popular ? "default" : "outline"}
                disabled={isCurrent}
                onClick={() => handleUpgrade(tier.id)}
              >
                {isCurrent ? "Current Plan" : tier.cta}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}