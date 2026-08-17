/**
 * UpgradeModal — shown when a user hits a tier gate.
 * Props:
 *   open: bool
 *   onClose: fn
 *   gate: "scip_quota" | "hawk_law" | "lease_site" | "carrier_overlay"
 *   message: string
 *   upgradeTo: tier key string
 *   currentTier: tier key string
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TIERS } from "@/lib/billingConfig";
import { hawkBillingCheckout } from "@/functions/hawkBillingCheckout";
import { ArrowRight, Zap, Lock, TrendingUp } from "lucide-react";

const GATE_LABELS = {
  scip_quota: { icon: TrendingUp, title: "SCIP Quota Reached" },
  hawk_law: { icon: Lock, title: "Hawk Law Access Required" },
  lease_site: { icon: TrendingUp, title: "Lease Site Limit Reached" },
  carrier_overlay: { icon: Lock, title: "Carrier Overlay Restricted" },
};

const GATE_UNLOCK_TEXT = {
  scip_quota: "More monthly SCIPs",
  hawk_law: "Full Hawk Law toolkit: triage, review, redline, brief, export",
  lease_site: "More lease site capacity",
  carrier_overlay: "Carrier overlay records in Comp Library",
};

export default function UpgradeModal({ open, onClose, gate, message, upgradeTo, currentTier }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const nextTier = TIERS[upgradeTo];
  const curTier = TIERS[currentTier] || TIERS.free;
  const gateInfo = GATE_LABELS[gate] || { icon: Zap, title: "Upgrade Required" };
  const Icon = gateInfo.icon;

  const handleUpgrade = async () => {
    if (!nextTier?.priceId) {
      // HawkCommand — scroll to contact
      onClose();
      navigate("/pricing#hawk-command");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Check iframe
      if (window.self !== window.top) {
        alert("Checkout works only from the published app. Please open the app in a full browser window.");
        setLoading(false);
        return;
      }
      const res = await hawkBillingCheckout({
        price_id: nextTier.priceId,
        success_url: `${window.location.origin}/billing?success=1`,
        cancel_url: window.location.href,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        throw new Error(res.data?.error || "Could not start checkout");
      }
    } catch (err) {
      setError(err.message || "Checkout failed");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-amber-500" />
            {gateInfo.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}

          {/* Current vs Upgrade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-border rounded-xl p-3 bg-secondary/20">
              <div className="text-xs text-muted-foreground mb-1">Current plan</div>
              <div className="font-semibold text-sm text-foreground">{curTier.label || "Free"}</div>
              {curTier.monthly_usd && (
                <div className="text-xs text-muted-foreground">${curTier.monthly_usd}/mo</div>
              )}
            </div>
            {nextTier && (
              <div className="border border-primary/40 rounded-xl p-3 bg-primary/5">
                <div className="text-xs text-primary mb-1">Recommended upgrade</div>
                <div className="font-semibold text-sm text-foreground">{nextTier.label}</div>
                {nextTier.monthly_usd ? (
                  <div className="text-xs text-muted-foreground">${nextTier.monthly_usd}/mo</div>
                ) : (
                  <div className="text-xs text-muted-foreground">Contact for pricing</div>
                )}
              </div>
            )}
          </div>

          {/* What it unlocks */}
          {gate && GATE_UNLOCK_TEXT[gate] && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <span className="font-semibold">Unlocks: </span>{GATE_UNLOCK_TEXT[gate]}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Maybe later</Button>
            <Button onClick={handleUpgrade} disabled={loading} className="flex-1 gap-1">
              {loading ? "Redirecting…" : (nextTier?.priceId ? "Upgrade now" : "Contact sales")}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}