// Shared config + helpers for the ADMIN-ONLY SiteHawk Subscriber CRM.
// Pure data/logic — no network. Separate layer from ScipCRM and legacy CRM.

export const TIERS = ["Trial", "Hawk Vision", "Hawk Site", "Hawk Enterprise", "Canceled", "Unknown"];

export const CHURN_RISK = { low: "Low", medium: "Medium", high: "High", unknown: "Unknown" };

export const ACTIVITY_LABEL = {
  signup: "Signed up",
  login: "Logged in",
  subscription_change: "Subscription changed",
  payment_event: "Payment event",
  email_sent: "Email sent",
  email_opened: "Email opened",
  email_clicked: "Email clicked",
  support_note: "Support note",
  admin_note: "Admin note",
  hawkbot_draft: "HawkBot draft",
  follow_up_completed: "Follow-up completed",
  demo_call: "Demo call",
  cancellation: "Cancellation",
  winback: "Winback",
  system: "System",
};

export const TASK_TYPES = [
  { key: "welcome_call", label: "Welcome call" },
  { key: "first_scip_checkin", label: "Check in after first SCIP" },
  { key: "inactivity_followup", label: "Follow up after inactivity" },
  { key: "testimonial_ask", label: "Ask for testimonial" },
  { key: "upgrade_conversation", label: "Upgrade conversation" },
  { key: "renewal_reminder", label: "Renewal reminder" },
  { key: "failed_payment_followup", label: "Failed-payment follow-up" },
  { key: "winback", label: "Winback sequence" },
  { key: "other", label: "Other" },
];
export const TASK_TYPE_LABEL = Object.fromEntries(TASK_TYPES.map((t) => [t.key, t.label]));

export const CAMPAIGN_TYPES = [
  { key: "product_update", label: "Product update" },
  { key: "special", label: "Special / promo" },
  { key: "onboarding", label: "Onboarding" },
  { key: "winback", label: "Winback" },
  { key: "announcement", label: "New feature announcement" },
  { key: "upgrade_nudge", label: "Upgrade nudge" },
];
export const CAMPAIGN_TYPE_LABEL = Object.fromEntries(CAMPAIGN_TYPES.map((c) => [c.key, c.label]));

// Segment definitions. Each predicate runs over a SubscriberCRMContact.
const days = (d) => (d ? (Date.now() - new Date(d).getTime()) / 86400000 : Infinity);

export const SEGMENTS = [
  { key: "all", label: "All subscribers", test: () => true },
  { key: "active", label: "Active", test: (c) => c.subscription_status === "active" || c.subscription_status === "trialing" },
  { key: "inactive", label: "Inactive (14d+)", test: (c) => days(c.last_active_at) > 14 },
  { key: "trial", label: "Trial", test: (c) => c.subscription_tier === "Trial" || c.subscription_status === "trialing" },
  { key: "churn_risk_high", label: "High churn risk", test: (c) => c.churn_risk === "high" },
  { key: "no_scip", label: "No SCIP created yet", test: (c) => !(c.total_scips_created > 0) },
  { key: "scip_not_exported", label: "Created SCIP, not exported", test: (c) => (c.total_scips_created > 0) && !(c.total_scips_exported > 0) },
  { key: "postcard_users", label: "Postcard mailer users", test: (c) => (c.total_mailers_sent > 0) || (c.tags || []).includes("postcard_user") },
  { key: "fiber_users", label: "Utility / fiber map users", test: (c) => (c.tags || []).includes("fiber_user") || (c.tags || []).includes("utility_user") },
  { key: "enterprise_prospects", label: "Enterprise prospects", test: (c) => (c.tags || []).includes("enterprise_prospect") },
  { key: "canceled", label: "Canceled", test: (c) => c.subscription_tier === "Canceled" || c.subscription_status === "canceled" },
  { key: "tier_hawk_vision", label: "Tier: Hawk Vision", test: (c) => c.subscription_tier === "Hawk Vision" },
  { key: "tier_hawk_site", label: "Tier: Hawk Site", test: (c) => c.subscription_tier === "Hawk Site" },
  { key: "tier_hawk_enterprise", label: "Tier: Hawk Enterprise", test: (c) => c.subscription_tier === "Hawk Enterprise" },
];
export const SEGMENT_LABEL = Object.fromEntries(SEGMENTS.map((s) => [s.key, s.label]));

export function inSegment(contact, key) {
  const seg = SEGMENTS.find((s) => s.key === key);
  return seg ? seg.test(contact) : true;
}

// Only contacts allowed to receive MARKETING email.
export function canReceiveMarketing(c) {
  if (!c.email) return false;
  if (c.unsubscribed_at) return false;
  if (!c.marketing_opt_in) return false;
  if (c.email_bounce_status === "hard_bounce" || c.email_bounce_status === "complaint") return false;
  return true;
}

// Lightweight client-side health/churn estimate (display + sorting).
export function estimateHealth(c) {
  let score = 50;
  const inactiveDays = days(c.last_active_at);
  if (inactiveDays <= 3) score += 25; else if (inactiveDays <= 14) score += 5; else if (inactiveDays > 30) score -= 25; else score -= 10;
  if (c.total_scips_created > 0) score += 10;
  if (c.total_scips_exported > 0) score += 10;
  if (c.total_mailers_sent > 0) score += 10;
  if (c.subscription_status === "past_due") score -= 20;
  if (c.subscription_status === "canceled" || c.subscription_tier === "Canceled") score -= 30;
  score = Math.max(0, Math.min(100, score));
  const risk = score >= 66 ? "low" : score >= 40 ? "medium" : "high";
  return { score, risk };
}

// HawkBot-style next-action suggestions, derived from contact state.
export function suggestNextActions(c) {
  const out = [];
  const inactiveDays = days(c.last_active_at);
  if ((c.total_scips_created || 0) >= 3 && (c.subscription_tier === "Trial" || c.subscription_tier === "Hawk Vision")) {
    out.push(`Created ${c.total_scips_created} SCIPs — ask if they want Hawk Site.`);
  }
  if (inactiveDays > 14 && inactiveDays < 1e6) {
    out.push(`No login for ${Math.round(inactiveDays)} days — send a check-in.`);
  }
  if ((c.total_mailers_sent || 0) > 0) {
    out.push("Sent mailers — follow up about landlord response.");
  }
  if ((c.total_scips_created || 0) > 0 && !(c.total_scips_exported > 0)) {
    out.push("Created a SCIP but never exported — offer help finishing it.");
  }
  if (c.subscription_status === "past_due") {
    out.push("Payment past due — failed-payment follow-up.");
  }
  if ((c.subscription_tier === "Canceled" || c.subscription_status === "canceled")) {
    out.push("Canceled — start a winback sequence.");
  }
  if (!(c.total_scips_created > 0) && inactiveDays > 3) {
    out.push("No SCIP created yet — send onboarding nudge.");
  }
  return out;
}