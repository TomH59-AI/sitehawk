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
    unlimited: false,
  },
  hawk_site: {
    key: "hawk_site",
    label: "HawkSite",
    priceId: "price_1Tkq5CIE4fOP88RJDsmMYlp2",
    productId: "prod_UkKkQIHnEVoQvI",
    monthly_usd: 149,
    scip_quota: 15,
    lease_site_cap: 5,
    hawk_law: false,
    carrier_overlay: false,
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
    unlimited: false,
  },
  hawk_vision: {
    key: "hawk_vision",
    label: "HawkVision",
    priceId: "price_1Tkq5CIE4fOP88RJBjebsjqG",
    productId: "prod_UkKkM39EXD8N88",
    monthly_usd: 399,
    scip_quota: 30,
    lease_site_cap: 25,
    hawk_law: false,
    carrier_overlay: true,
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
    unlimited: true,
  },
};

// Map Stripe product IDs → tier keys
export const PRODUCT_TO_TIER = {
  "prod_UkKkQIHnEVoQvI": "hawk_site",
  "prod_UkKk8vUKlxsTAT": "hawk_site_law",
  "prod_UkKkM39EXD8N88": "hawk_vision",
  "prod_UkKkhTUH5fUsTo": "hawk_vision_law",
};

// Map Stripe price IDs → tier keys
export const PRICE_TO_TIER = {
  "price_1Tkq5CIE4fOP88RJDsmMYlp2": "hawk_site",
  "price_1Tkq5CIE4fOP88RJPztKWgzB": "hawk_site_law",
  "price_1Tkq5CIE4fOP88RJBjebsjqG": "hawk_vision",
  "price_1Tkq5CIE4fOP88RJGiKdRi82": "hawk_vision_law",
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
};

export function getTier(tierKey) {
  return TIERS[tierKey] || TIERS.free;
}

export function isAdmin(email) {
  return email === ADMIN_EMAIL;
}