// hawkTracker.js — Hawk Tracker constants. 18 gates and an exit.
// MILESTONES is DISPLAY ORDER ONLY — never an enforced sequence. Each milestone
// row carries its own independent status so out-of-order markets don't fight
// the tool.

export const TRACKER_GREEN = "#628C83";

export const MILESTONES = [
  { key: "search_ring_received", label: "Search Ring Received" },
  { key: "candidates_identified", label: "Candidates Identified" },
  { key: "site_visits_complete", label: "Site Visits Complete" },
  { key: "scip_submitted", label: "SCIP Submitted" },
  { key: "scip_approved", label: "SCIP Approved (A-Candidate)" },
  { key: "landlord_contacted", label: "Landlord Contacted" },
  { key: "loi_issued", label: "LOI Issued" },
  { key: "loi_executed", label: "LOI Executed" },
  { key: "lease_negotiation", label: "Lease Negotiation" },
  { key: "lease_executed", label: "Lease Executed" },
  { key: "regulatory_complete", label: "Regulatory Complete (NEPA / §106)" },
  { key: "zoning_submitted", label: "Zoning Submitted" },
  { key: "zoning_approved", label: "Zoning Approved" },
  { key: "survey_complete", label: "Survey Complete (1A)" },
  { key: "cd_approved", label: "CDs Approved" },
  { key: "bp_submitted", label: "BP Submitted" },
  { key: "bp_issued", label: "BP Issued" },
  { key: "ntp_issued", label: "NTP Issued" },
  { key: "ring_exhausted", label: "Ring Exhausted → DEADZONE" },
];

export const MILESTONE_LABELS = Object.fromEntries(MILESTONES.map((m) => [m.key, m.label]));

export const STATUS_META = {
  pending: { label: "Pending", badge: "bg-slate-100 text-slate-600 border-slate-300" },
  in_progress: { label: "In Progress", badge: "bg-blue-50 text-blue-700 border-blue-300" },
  complete: { label: "Complete", badge: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  blocked: { label: "Blocked", badge: "bg-red-50 text-red-700 border-red-300" },
  na: { label: "N/A", badge: "bg-slate-50 text-slate-400 border-slate-200" },
};

export const STATUS_ORDER = ["pending", "in_progress", "complete", "blocked", "na"];