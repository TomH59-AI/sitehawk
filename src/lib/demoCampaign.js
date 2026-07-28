// ============================================================
// DEMO CAMPAIGN WINDOW — hard cutoff for all demo accounts
// ============================================================
// Every demo-role user gets FULL, unrestricted access until this
// moment, then the app locks and shows Tom's number for pricing.
//
// 👉 FOR THE NEXT CAMPAIGN: update the date below (or set to null
//    to fall back to the per-user 3-day clock).
// ============================================================

export const DEMO_CAMPAIGN_ENDS_AT = "2026-07-31T12:00:00-04:00"; // OPEN ROUND — everyone rides free until Fri July 31 at 12:00 noon ET

export const DEMO_CAMPAIGN_ENDS_LABEL = "Friday July 31 at noon";

export function isDemoCampaignOver() {
  if (!DEMO_CAMPAIGN_ENDS_AT) return false;
  return Date.now() > new Date(DEMO_CAMPAIGN_ENDS_AT).getTime();
}