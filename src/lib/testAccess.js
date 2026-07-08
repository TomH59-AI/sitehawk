// ============================================================
// TESTER ACCESS — temporary unlimited-access override
// ============================================================
// Accounts listed here get the highest tier ("hawkeye_apex") and
// bypass all paywalls, search limits, and feature gates.
//
// 👉 TO RE-ENABLE PAYWALL: simply empty the TESTER_EMAILS array
//    or remove the email(s) you want billed normally.
//
//    export const TESTER_EMAILS = [];
//
// No other code changes needed — the rest of the app reads
// `getEffectiveTier(user)` and `isTester(user)` from this file.
// ============================================================

export const TESTER_EMAILS = [
  "hodges.thomas@gmail.com",
  // ── PYRAMID NS 30-DAY PAID PILOT (started 2026-07-08, remove ~2026-08-07) ──
  // Call sign: HAWK — Jay Suriano (the boss). Both spellings covered.
  "jsuriano@pyramidns.com",
  "jsuriano@pyramidns.co",
  // Call signs FALCON + OSPREY reserved for Jay's two teammates — add their emails here.
  // ── COREY MILAN 30-DAY PILOT (started 2026-07-08, remove ~2026-08-07) ──
  "cmilan@nbcllc.com",
];

export const TESTER_TIER = "hawk_command";

export function isTester(user) {
  if (!user?.email) return false;
  return TESTER_EMAILS.includes(user.email.toLowerCase());
}

// Returns the tier string to use for gating logic.
// Testers always get the top-tier ("hawkeye_apex").
export function getEffectiveTier(user) {
  if (isTester(user)) return TESTER_TIER;
  return user?.tier || "free";
}

// True if user should bypass all limits / paywalls.
export function hasUnlimitedAccess(user) {
  return isTester(user) || user?.role === "admin";
}