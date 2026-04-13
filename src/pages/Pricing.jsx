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
    name: "Blind",
    price: "$0",
    period: "",
    description: "View the dashboard and explore features. No scanning until you upgrade.",
    emoji: "🙈",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    features: [
      "Full dashboard access",
      "View the SiteHawk interface",
      "Explore pricing & features",
    ],
    cta: "Free Forever",
    highlight: false,
    badge: null,
  },
  {
    id: "monthly",
    name: "Hawk 20/20 Vision",
    price: "$49",
    period: "/month",
    description: "Full hawk-eye clarity. Includes 1 free trial scan to get you started.",
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
    name: "Hawk 20-4 AI Vision",
    price: "$490",
    period: "/year",
    description: "Maximum hawk intelligence. 2 free trial scans + annual savings.",
    emoji: "🏆",
    iconBg: "bg-accent/10",
    iconColor: "text-accent",
    features: [
      "2 free trial scans on signup",
      "Everything in Hawk 20/20 Vision",
      "50 searches per month",
      "SiteHawk AI chatbot",
      "MapBox satellite maps",
      "Scored candidate results",
      "Need More? (3 extra candidates)",
      "Priority support",
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
    // trial_scans: monthly gets 1, annual gets 2
    const trialScans = plan === "annual" ? 2 : 1;
    const res = await fetch(SUPABASE_CHECKOUT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ plan, action: "checkout", trial_scans: trialScans }),
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
    toast({ title: "Welcome to SiteHawk!", description: "You're on the Blind plan. Upgrade to Hawk 20/20 Vision to start scanning." });
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
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">SiteHawk — When you need AI Hawk vision</p>
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-foreground">
          Choose Your Vision
        </h1>
        <p className="text-muted-foreground text-sm mt-3 max-w-md mx-auto">
          From zero to hawk-level clarity — upgrade when you're ready to start prospecting.
        </p>
      </div>

      {/* Intelligence Features Spotlight */}
      <div className="max-w-3xl mx-auto space-y-4">
        {/* AI Chatbot */}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 flex flex-col md:flex-row items-center gap-6">
          <div className="shrink-0 w-16 h-16 rounded-2xl bg-[#0C1B2E] border border-primary/30 flex items-center justify-center shadow-lg">
            <HawkIcon size={44} />
          </div>
          <div className="flex-1 text-center md:text-left">
            <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">Included with every paid plan</p>
            <h2 className="font-heading font-bold text-xl text-foreground">SiteHawk AI Consultant</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Every paid subscription unlocks your personal AI site acquisition consultant — powered by SkyWave AI.
              Ask it about zoning requirements, setbacks, permits, which parcel is your best bet, and more.
              It has full context of your scan results and ordinance data the moment your search completes.
            </p>
            <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
              {["Which parcel is best?", "Explain zoning requirements", "What permits do I need?", "Setback requirements?"].map(q => (
                <span key={q} className="px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium">{q}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Airport + Cell Tower Intel */}
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 flex flex-col md:flex-row items-center gap-6">
          <div className="shrink-0 w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center shadow-lg text-3xl">
            ✈️
          </div>
          <div className="flex-1 text-center md:text-left">
            <p className="text-xs uppercase tracking-widest text-accent font-bold mb-1">Paid plans only — AI-powered site intelligence</p>
            <h2 className="font-heading font-bold text-xl text-foreground">Airport Proximity & Cell Tower Analysis</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Every scanned parcel automatically includes the <span className="text-foreground font-semibold">nearest airport</span> (IATA code, name, distance in miles, coordinates)
              and the <span className="text-foreground font-semibold">nearest existing cell towers</span> (carrier, tower type, distance, coordinates) — critical data for FAA compliance
              and RF interference analysis. Included in every PDF report.
            </p>
            <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
              {["✈️ Airport IATA & coordinates", "📡 Carrier & tower type", "📏 Distance in miles", "📄 Included in PDF report"].map(f => (
                <span key={f} className="px-3 py-1 rounded-full border border-accent/30 bg-accent/10 text-accent text-xs font-medium">{f}</span>
              ))}
            </div>
          </div>
        </div>
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
                  <p className="text-xs text-accent font-semibold mt-1">~$40.83/mo — best value for power users</p>
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