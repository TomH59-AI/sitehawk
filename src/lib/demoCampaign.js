// ============================================================
// DEMO CAMPAIGN WINDOW — hard cutoff for all demo accounts
// ============================================================
// Every demo-role user gets FULL, unrestricted access until this
// moment, then the app locks and shows Tom's number for pricing.
//
// 👉 FOR THE NEXT CAMPAIGN: update the date below (or set to null
//    to fall back to the per-user 3-day clock).
// ============================================================

export const DEMO_CAMPAIGN_ENDS_AT = "2026-07-19T00:00:00-04:00"; // 3-DAY OPEN TRIAL — everyone rides free through Sat July 18

export const DEMO_CAMPAIGN_ENDS_LABEL = "Saturday July 18";

export function isDemoCampaignOver() {
  if (!DEMO_CAMPAIGN_ENDS_AT) return false;
  return Date.now() > new Date(DEMO_CAMPAIGN_ENDS_AT).getTime();
}