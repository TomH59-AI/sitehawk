/**
 * Photo3DUpgradeModal — paywall for Photorealistic 3D Tiles (HawkVision+ only)
 */
import { useState } from "react";
import { Box, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hawkBillingCheckout } from "@/functions/hawkBillingCheckout";
import { TIERS } from "@/lib/billingConfig";

export default function Photo3DUpgradeModal({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  if (!open) return null;

  const handleUpgrade = async () => {
    if (window.self !== window.top) {
      alert("Checkout must be opened from the published app, not inside an iframe.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await hawkBillingCheckout({
        priceId: TIERS.hawk_vision.priceId,
        tierKey: "hawk_vision",
      });
      if (res?.data?.url) window.location.href = res.data.url;
      else setErr("Could not start checkout. Try again.");
    } catch (e) {
      setErr(e.message || "Checkout failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 space-y-4 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Box className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-foreground">Photorealistic 3D Visualization</h2>
            <p className="text-xs text-muted-foreground">Powered by Google Map Tiles API + CesiumJS</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Show landlords and zoning boards <strong className="text-foreground">exactly what your tower will look like</strong> on their property using Google's photorealistic 3D mapping. Win more site approvals with cinematic visualizations and exportable hero shots.
        </p>

        <ul className="text-sm space-y-1 text-muted-foreground">
          {["Google Photorealistic 3D Tiles", "Parametric tower + compound model", "Landscape buffer visualization", "Export: PNG hero shot + video clip"].map(f => (
            <li key={f} className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              {f}
            </li>
          ))}
        </ul>

        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3 text-sm text-indigo-300 font-medium">
          Required: HawkVision tier ($399/mo)
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <div className="flex gap-3">
          <Button className="flex-1 bg-indigo-600 hover:bg-indigo-500" onClick={handleUpgrade} disabled={loading}>
            {loading ? "Redirecting…" : "Upgrade to HawkVision →"}
          </Button>
          <Button variant="outline" onClick={onClose}>Maybe Later</Button>
        </div>
      </div>
    </div>
  );
}