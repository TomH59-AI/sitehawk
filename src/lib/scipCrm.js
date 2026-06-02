// SCIP CRM shared config — stages, task types, colors. Used by the SCIP CRM
// panel and (later) the SCIP CRM dashboard. Separate from the legacy CRM.

export const SCIP_STAGES = [
  { key: "scip_generated", label: "SCIP Generated" },
  { key: "mailers_drafted", label: "Mailers Drafted" },
  { key: "mailers_sent", label: "Mailers Sent" },
  { key: "call_due", label: "Call Due" },
  { key: "owner_contacted", label: "Owner Contacted" },
  { key: "interested", label: "Interested" },
  { key: "not_interested", label: "Not Interested" },
  { key: "loi_terms", label: "LOI / Terms" },
  { key: "lease_drafting", label: "Lease Drafting" },
  { key: "zoning_package", label: "Zoning Package" },
  { key: "permit_package", label: "Permit Package" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "on_hold", label: "On Hold" },
  { key: "lost", label: "Lost" },
  { key: "exhausted", label: "Exhausted" },
];

export const SCIP_STAGE_LABEL = Object.fromEntries(SCIP_STAGES.map((s) => [s.key, s.label]));

export const TASK_TYPES = [
  { key: "call", label: "Call Owner" },
  { key: "email", label: "Email / Text" },
  { key: "postcard", label: "Postcard" },
  { key: "document", label: "Upload Document" },
  { key: "zoning", label: "Review Zoning" },
  { key: "permit", label: "Permit App" },
  { key: "lease", label: "Lease Draft" },
  { key: "utility", label: "Confirm Utility/Fiber" },
  { key: "submit", label: "Submit Application" },
  { key: "other", label: "Other" },
];

export const TASK_TYPE_LABEL = Object.fromEntries(TASK_TYPES.map((t) => [t.key, t.label]));

export const CONTACT_STATUS = {
  not_contacted: "Not Contacted",
  attempted: "Attempted",
  reached: "Reached",
  interested: "Interested",
  not_interested: "Not Interested",
  do_not_contact: "Do Not Contact",
};