/**
 * useBilling — React hook that provides tier-aware feature gating for SiteHawk.
 * Call once at the top of any gated component.
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { TIERS, isAdmin, GATE_UPGRADE } from "@/lib/billingConfig";
import { getEffectiveTier } from "@/lib/testAccess";

let cachedUser = null;
let cacheTs = 0;
const CACHE_TTL = 60_000; // 1 minute

async function getUser() {
  const now = Date.now();
  if (cachedUser && now - cacheTs < CACHE_TTL) return cachedUser;
  try {
    cachedUser = await base44.auth.me();
    cacheTs = now;
    return cachedUser;
  } catch {
    return null;
  }
}

export function invalidateBillingCache() {
  cachedUser = null;
  cacheTs = 0;
}

export function useBilling() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUser().then(u => { setUser(u); setLoading(false); });
  }, []);

  // Tester/comped emails resolve to the unlimited tier; everyone else uses their real tier.
  const tierKey = user ? getEffectiveTier(user) : "free";
  const tier = TIERS[tierKey] || TIERS.free;
  const admin = user ? isAdmin(user.email) : false;

  // Feature checks — admin bypasses everything
  const canScip = admin || tier.unlimited || (tier.scip_quota > 0);
  const canCreateLeaseSite = admin || tier.unlimited || (tier.lease_site_cap > 0);
  const canHawkLaw = admin || tier.hawk_law;
  const canCarrierOverlay = admin || tier.carrier_overlay;

  // Quota helpers — call these to check live usage
  const checkScipQuota = async (currentMonthCount) => {
    if (admin || tier.unlimited) return { allowed: true };
    if (currentMonthCount >= tier.scip_quota) {
      return {
        allowed: false,
        gate: "scip_quota",
        upgradeTo: GATE_UPGRADE.scip_quota[tierKey] || "hawk_vision",
        message: `You've used all ${tier.scip_quota} SCIPs this month.`,
      };
    }
    return { allowed: true };
  };

  const checkLeaseSiteCap = async (currentSiteCount) => {
    if (admin || tier.unlimited) return { allowed: true };
    if (currentSiteCount >= tier.lease_site_cap) {
      return {
        allowed: false,
        gate: "lease_site",
        upgradeTo: GATE_UPGRADE.lease_site[tierKey] || "hawk_vision",
        message: `You've reached the ${tier.lease_site_cap} lease site limit for ${tier.label}.`,
      };
    }
    return { allowed: true };
  };

  const checkHawkLaw = (isFreeTriageAttempt = false) => {
    if (admin || tier.hawk_law) return { allowed: true };
    // Free triage preview — one lifetime per account
    if (isFreeTriageAttempt && user && !user.hawk_law_free_triage_used) {
      return { allowed: true, isFreePreview: true };
    }
    if (isFreeTriageAttempt && user?.hawk_law_free_triage_used) {
      return {
        allowed: false,
        gate: "hawk_law",
        upgradeTo: GATE_UPGRADE.hawk_law[tierKey] || "hawk_site_law",
        message: "You've used your free Hawk Law triage preview. Upgrade to unlock full access.",
      };
    }
    return {
      allowed: false,
      gate: "hawk_law",
      upgradeTo: GATE_UPGRADE.hawk_law[tierKey] || "hawk_site_law",
      message: "Hawk Law requires an upgrade.",
    };
  };

  const checkCarrierOverlay = () => {
    if (admin || tier.carrier_overlay) return { allowed: true };
    return {
      allowed: false,
      gate: "carrier_overlay",
      upgradeTo: GATE_UPGRADE.carrier_overlay[tierKey] || "hawk_vision",
      message: "Carrier overlay records require HawkVision or higher.",
    };
  };

  return {
    user,
    loading,
    tierKey,
    tier,
    admin,
    canScip,
    canCreateLeaseSite,
    canHawkLaw,
    canCarrierOverlay,
    checkScipQuota,
    checkLeaseSiteCap,
    checkHawkLaw,
    checkCarrierOverlay,
  };
}