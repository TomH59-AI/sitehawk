import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Check, EyeOff } from "lucide-react";
import HawkIcon from "../components/HawkIcon";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrcHhlb3V2aWt6Z3NhdXJrb2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI5MzcxNDgsImV4cCI6MjA1ODUxMzE0OH0.GMm2u8HJeCv8vboySM8CNgIAdbCS27-wrCnMmlRzFCY";
const SUPABASE_CHECKOUT_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/stripe-checkout";

const tiers = [
  {
    id: "blind",
    name: "Blind Vision",
    price: "$0",
    period: "",
    description: "See the interface. No scanning until you upgrade.",
    emoji: "🙈",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    features: [
      "Full dashboard access",
      "View the SiteHawk interface",
      "Explore pricing & features",
      "0 scans included",
    ],
    cta: "Free Forever",
    highlight: false,
    badge: null,
  },
  {
    id: "monthly",
    name: "20/20 Hawk AI Vision",
    price: "$49",
    period: "/month",
    description: "Perfect sight. Full access, monthly billing.",
    emoji: "🦅",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    features: [
      "1 free trial scan on signup",
      "50 searches per month",
      "SiteHawk AI chatbot",
      "MapBox satellite maps",
      "Scored candidate results",
      "Need More? (3 extra candidates)",
      "Full owner contact data",
      "Priority support",
    ],
    cta: "Start Scanning",
    highlight: false,
    badge: "Most Popular",
  },
  {
    id: "annual",
    name: "20/4 Hawk AI Vision",
    price: "$429",
    period: "/year",
    description: "Get 12 months for the price of ~8.75 — hawk-level savings.",
    emoji: "🏆",
    iconBg: "bg-accent/10",
    iconColor: "text-accent",
    features: [
      "Everything in 20/20 Vision",
      "Save $159 vs monthly",
      "2 bonus months free",
      "50 searches per month",
      "SiteHawk AI chatbot",
      "MapBox satellite maps",
      "Scored candidate results",
      "Need More? (3 extra candidates)",
    ],
    cta: "Go Annual & Save",
    highlight: true,
    badge: "Best Value",
  },
];

export default function Pricing() {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);

  useEffect(() => {
    async function load() {
      const me = await base44.auth.me();
      setUser(me);
      setLoading(false);

      // Handle return from Stripe checkout
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("checkout") === "success") {
        toast({
          title: "Welcome to SiteHawk! 🦅",
          description: "Your hawk vision is now active. Start scanning!",
        });
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    load();
  }, []);

  const handleCheckout = async (plan) => {
    setCheckoutLoading(plan);
    const res = await fetch(SUPABASE_CHECKOUT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ plan, action: "checkout" }),
    });
    const data = await res.json();
    setCheckoutLoading(null);
    if (data.url) {
      window.location.href = data.url;
    } else {
      toast({ title: "Error", description: data.error || "Could not start checkout.", variant: "destructive" });
    }
  };

  const handleSignupFree = async () => {
    await base44.auth.updateMe({ tier: "blind" });
    setUser({ ...user, tier: "blind" });
    toast({ title: "Welcome to SiteHawk!", description: "You're on the Blind Vision free plan. Upgrade anytime to start scanning." });
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
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">SiteHawk — When you need the AI vision</p>
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-foreground">
          Choose Your Vision
        </h1>
        <p className="text-muted-foreground text-sm mt-3 max-w-md mx-auto">
          From zero to hawk-level clarity — upgrade when you're ready to start prospecting.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {tiers.map((tier) => {
          const isCurrent = currentTier === tier.id;
          return (
            <div
              key={tier.id}
              className={`rounded-2xl border p-6 flex flex-col relative transition-all duration-300 ${
                tier.highlight
                  ? "border-accent bg-card shadow-xl shadow-accent/10 scale-[1.02]"
                  : "border-border bg-card"
              }`}
            >
              {tier.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold font-heading ${
                  tier.highlight
                    ? "bg-accent text-accent-foreground"
                    : "bg-primary text-primary-foreground"
                }`}>
                  {tier.badge}
                </div>
              )}

              <div className="mb-6">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 overflow-hidden">
                  {tier.id === "blind" ? <span className="text-2xl">{tier.emoji}</span> : <HawkIcon size={48} />}
                </div>
                <h3 className="font-heading font-bold text-lg text-foreground leading-tight">{tier.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{tier.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-heading font-bold text-4xl text-foreground">{tier.price}</span>
                  <span className="text-muted-foreground text-sm">{tier.period}</span>
                </div>
                {tier.id === "annual" && (
                  <p className="text-xs text-accent font-semibold mt-1">~$35.75/mo — save $159/yr</p>
                )}
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${tier.highlight ? "text-accent" : "text-primary"}`} />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
                {tier.id === "blind" && (
                  <li className="flex items-start gap-2 text-sm">
                    <EyeOff className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground/60 line-through">Scanning disabled</span>
                  </li>
                )}
              </ul>

              <Button
                className={`w-full font-heading font-semibold ${
                  tier.highlight ? "bg-accent hover:bg-accent/90 text-accent-foreground" : ""
                } ${isCurrent ? "opacity-50 cursor-not-allowed" : ""}`}
                variant={tier.highlight ? "default" : tier.id === "blind" ? "outline" : "default"}
                disabled={isCurrent || checkoutLoading === tier.id}
                onClick={() => {
                  if (tier.id === "blind") handleSignupFree();
                  else if (tier.id === "monthly") handleCheckout("monthly");
                  else if (tier.id === "annual") handleCheckout("annual");
                }}
              >
                {isCurrent ? "Current Plan" : checkoutLoading === tier.id ? "Redirecting..." : tier.cta}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground/50 tracking-widest uppercase mt-4">
        Powered by SkyWave AI
      </p>
    </div>
  );
}