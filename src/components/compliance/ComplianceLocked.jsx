import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { stripeCheckout } from "@/functions/stripeCheckout";
import { Shield, Check, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HC } from "./complianceConst";

const FEATURES = [
  "NEPA Categorical Exclusion pre-screening (47 CFR 1.1307)",
  "SHPO state historic review tracking",
  "THPO tribal consultation workflow",
  "30-day FCC NPA shot clock on every submission",
  "Form 620 / 621 packet generator",
  "Full audit trail for every site",
];

// Marketing landing shown when the org has no active Hawk Compliance subscription.
export default function ComplianceLocked() {
  const [loading, setLoading] = useState(false);
  const inIframe = typeof window !== "undefined" && window.self !== window.top;

  async function unlock() {
    if (inIframe) {
      alert("Checkout only works from the published app. Open the published app in a new tab to subscribe.");
      return;
    }
    setLoading(true);
    try {
      const res = await stripeCheckout({ action: "compliance_checkout" });
      if (res.data?.url) window.location.href = res.data.url;
      else { alert(res.data?.error || "Could not start checkout."); setLoading(false); }
    } catch (e) {
      alert(e.message || "Checkout failed."); setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="p-8 text-white text-center" style={{ background: `linear-gradient(135deg, ${HC.green}, ${HC.greenDark})` }}>
          <Shield className="w-12 h-12 mx-auto mb-3" />
          <h1 className="text-3xl font-heading font-bold">Hawk Compliance</h1>
          <p className="opacity-90 mt-2">Section 106 / NEPA regulatory clearance — a live cockpit, not a form.</p>
        </div>
        <div className="p-8 bg-card">
          <ul className="space-y-3 mb-8">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <Check className="w-5 h-5 shrink-0" style={{ color: HC.green }} />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="text-center">
            <Button onClick={unlock} disabled={loading} size="lg" className="text-white" style={{ background: HC.green }}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
              Unlock Hawk Compliance — $99/mo
            </Button>
            {inIframe && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-3">
                <AlertTriangle className="w-3.5 h-3.5" /> Checkout works only from the published app.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}