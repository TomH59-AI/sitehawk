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

import { isDemoCampaignOver } from "@/lib/demoCampaign";

export const TESTER_EMAILS = [
  "hodges.thomas@gmail.com",
  "tomhodges@onairs.org",
  // ── PYRAMID NS — PAID FULL-APEX ACCESS ($1,200/mo each, started 2026-07-10) ──
  "jcuttone@pyramidns.com",
  "rhanson@pyramidns.com",
  "jsuriano@pyramidns.com",
  "cfazio@pyramidns.com",
];

export const TESTER_TIER = "hawk_command";

export function isTester(user) {
  if (!user?.email) return false;
  return TESTER_EMAILS.includes(user.email.toLowerCase());
}

// Returns the tier string to use for gating logic.
// Testers always get the top-tier ("hawkeye_apex").
// Demo-role users get FULL access during their window — the shutdown is
// handled by the campaign cutoff / trial clock in Layout, not by gates.
export function getEffectiveTier(user) {
  if (isTester(user)) return TESTER_TIER;
  if (user?.role === "demo") return TESTER_TIER;
  // ── CAMPAIGN WINDOW: EVERYONE gets full access until the cutoff ──
  // Anyone who signs up from the normal site rides free until the campaign
  // ends (see src/lib/demoCampaign.js), then reverts to their real tier.
  if (!isDemoCampaignOver()) return TESTER_TIER;
  return user?.tier || "free";
}

// True if user should bypass all limits / paywalls.
export function hasUnlimitedAccess(user) {
  return isTester(user) || user?.role === "admin" || user?.role === "demo" || !isDemoCampaignOver();
}