import { useState } from "react";
import { Mail, Loader2, X, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { directMailCheckout } from "@/functions/directMailCheckout";

const PLANS = [
  {
    id: "3_letters",
    letters: 3,
    price: "$79",
    label: "Starter",
    desc: "3 personalized letters mailed over 3 weeks",
    badge: null,
  },
  {
    id: "5_letters",
    letters: 5,
    price: "$119",
    label: "Best Results",
    desc: "5 letters with increasing urgency over 5 weeks",
    badge: "Most Popular",
  },
];

export default function DirectMailButton({ candidate, searchId }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("5_letters");
  const [loading, setLoading] = useState(false);

  const hasAddress = !!candidate?.owner_mailing_address;

  const handleCheckout = async () => {
    // Block if inside iframe
    if (window.self !== window.top) {
      alert("Checkout only works from the published app. Please open SiteHawk directly.");
      return;
    }
    setLoading(true);
    const res = await directMailCheckout({
      plan: selected,
      owner_name: candidate.owner_name,
      mailing_address: candidate.owner_mailing_address,
      parcel_address: candidate.parcel_address,
      search_id: searchId,
      candidate_id: candidate.id,
    });
    const data = res.data;
    if (data?.url) {
      window.location.href = data.url;
    } else {
      alert(data?.error || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  if (!hasAddress) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 text-xs font-semibold transition-all"
      >
        <Mail className="w-3.5 h-3.5" />
        Mail the Owner
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-heading font-bold text-foreground text-sm">Direct Mail Campaign</h3>
                <p className="text-xs text-muted-foreground mt-0.5">We'll mail acquisition letters on your behalf</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Recipient */}
            <div className="mx-5 mt-4 rounded-xl bg-secondary border border-border px-4 py-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Mailing To</p>
              <p className="text-sm font-semibold text-foreground">{candidate.owner_name || "Property Owner"}</p>
              <p className="text-xs text-muted-foreground">{candidate.owner_mailing_address}</p>
            </div>

            {/* Plans */}
            <div className="px-5 pt-4 pb-2 space-y-2">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelected(plan.id)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                    selected === plan.id
                      ? "border-violet-500/60 bg-violet-500/10"
                      : "border-border bg-secondary hover:border-violet-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected === plan.id ? "border-violet-400" : "border-muted-foreground"}`}>
                        {selected === plan.id && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">{plan.letters} Letters</span>
                          {plan.badge && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-bold border border-violet-500/30">
                              {plan.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{plan.desc}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-foreground">{plan.price}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* What's included */}
            <div className="mx-5 mb-4 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-primary">What You Get</p>
              {[
                "Professionally written acquisition letter",
                "Personalized with owner & parcel details",
                "SkyWave LLC branded letterhead",
                "First-class USPS delivery",
                "Spaced for maximum response rate",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-5 pb-5">
              <Button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Mail className="w-4 h-4" /> Launch Campaign</>}
              </Button>
              <p className="text-center text-[10px] text-muted-foreground mt-2">Secure checkout via Stripe · Campaigns dispatched within 3 business days</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}