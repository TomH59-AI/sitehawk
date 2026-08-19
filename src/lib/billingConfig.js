/**
 * SiteHawk Billing Configuration
 * Central source of truth for tier definitions, Stripe price IDs, and feature gates.
 */

export const ADMIN_EMAIL = "hodgesthomas@outlook.com";

export const TIERS = {
  free: {
    key: "free",
    label: "Free",
    scip_quota: 0,
    lease_site_cap: 0,
    hawk_law: false,
    carrier_overlay: false,
    propagation_daily_quota: 0,
    unlimited: false,
  },
  hawk_site: {
    key: "hawk_site",
    label: "🦅 HawkSite Solo",
    priceId: "price_1TksEIIE4fOP88RJtkkAJpF3",
    productId: "prod_UkMy9qQRfMCUnw",
    monthly_usd: 299,
    scip_quota: 15,
    lease_site_cap: 5,
    hawk_law: false,
    carrier_overlay: false,
    propagation_daily_quota: 0,
    unlimited: false,
  },
  hawk_site_law: {
    key: "hawk_site_law",
    label: "HawkSite + Hawk Law",
    priceId: "price_1Tkq5CIE4fOP88RJPztKWgzB",
    productId: "prod_UkKk8vUKlxsTAT",
    monthly_usd: 348,
    scip_quota: 15,
    lease_site_cap: 5,
    hawk_law: true,
    carrier_overlay: false,
    propagation_daily_quota: 0,
    unlimited: false,
  },
  hawk_vision: {
    key: "hawk_vision",
    label: "🚀 HawkVision Pro",
    priceId: "price_1TksEIIE4fOP88RJjMUrsvGG",
    productId: "prod_UkMy8Le8CgKc4L",
    monthly_usd: 599,
    scip_quota: 30,
    lease_site_cap: 25,
    hawk_law: true,
    carrier_overlay: true,
    propagation_daily_quota: 10,
    unlimited: false,
  },
  hawk_vision_law: {
    key: "hawk_vision_law",
    label: "HawkVision + Hawk Law",
    priceId: "price_1Tkq5CIE4fOP88RJGiKdRi82",
    productId: "prod_UkKkhTUH5fUsTo",
    monthly_usd: 499,
    scip_quota: 30,
    lease_site_cap: 25,
    hawk_law: true,
    carrier_overlay: true,
    propagation_daily_quota: 25,
    unlimited: false,
  },
  hawk_command: {
    key: "hawk_command",
    label: "HawkCommand",
    priceId: null,
    monthly_usd: null,
    scip_quota: Infinity,
    lease_site_cap: Infinity,
    hawk_law: true,
    carrier_overlay: true,
    propagation_daily_quota: Infinity,
    unlimited: true,
  },
};

// Map Stripe product IDs → tier keys
export const PRODUCT_TO_TIER = {
  "prod_UkMy9qQRfMCUnw": "hawk_site",       // HawkSite Solo $299
  "prod_UkKk8vUKlxsTAT": "hawk_site_law",
  "prod_UkMy8Le8CgKc4L": "hawk_vision",     // HawkVision Pro $599
  "prod_UkKkhTUH5fUsTo": "hawk_vision_law",
  // Legacy product IDs (kept for existing subscribers)
  "prod_UkKkQIHnEVoQvI": "hawk_site",
  "prod_UkKkM39EXD8N88": "hawk_vision",
};

// Map Stripe price IDs → tier keys
export const PRICE_TO_TIER = {
  "price_1TksEIIE4fOP88RJtkkAJpF3": "hawk_site",   // HawkSite Solo $299
  "price_1TksEIIE4fOP88RJjMUrsvGG": "hawk_vision", // HawkVision Pro $599
  "price_1Tkq5CIE4fOP88RJPztKWgzB": "hawk_site_law",
  "price_1Tkq5CIE4fOP88RJGiKdRi82": "hawk_vision_law",
  // Legacy price IDs (kept for existing subscribers)
  "price_1Tkq5CIE4fOP88RJDsmMYlp2": "hawk_site",
  "price_1Tkq5CIE4fOP88RJBjebsjqG": "hawk_vision",
};

// Upgrade path recommendations: when a user hits a gate, suggest this tier
export const UPGRADE_PATH = {
  free: "hawk_site",
  hawk_site: "hawk_vision",
  hawk_site_law: "hawk_vision_law",
  hawk_vision: "hawk_vision_law",
  hawk_vision_law: "hawk_command",
};

// What each gate recommends
export const GATE_UPGRADE = {
  scip_quota: { free: "hawk_site", hawk_site: "hawk_vision", hawk_site_law: "hawk_vision_law", hawk_vision: "hawk_command" },
  hawk_law: { free: "hawk_site_law", hawk_site: "hawk_site_law", hawk_vision: "hawk_vision_law" },
  lease_site: { free: "hawk_site", hawk_site: "hawk_vision", hawk_site_law: "hawk_vision_law" },
  carrier_overlay: { free: "hawk_vision", hawk_site: "hawk_vision", hawk_site_law: "hawk_vision_law" },
  propagation: { free: "hawk_vision", hawk_site: "hawk_vision", hawk_site_law: "hawk_vision_law", hawk_vision: "hawk_command", hawk_vision_law: "hawk_command" },
  photo_3d: { free: "hawk_vision", hawk_site: "hawk_vision", hawk_site_law: "hawk_vision_law" },
};

// Daily Google 3D Tiles session quotas per tier
export const PHOTO_3D_DAILY_QUOTA = {
  free: 0,
  hawk_site: 0,
  hawk_site_law: 0,
  hawk_vision: 10,
  hawk_vision_law: 25,
  hawk_command: Infinity,
};

export function getTier(tierKey) {
  return TIERS[tierKey] || TIERS.free;
}

export function isAdmin(email) {
  return email === ADMIN_EMAIL;
}