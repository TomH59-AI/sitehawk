// Hawk Compliance — shared constants, trigger labels, shot-clock + NEPA logic.

export const HC = {
  green: "#628C83",      // brand green
  greenDark: "#4d6f67",
  amber: "#FFB800",
  orange: "#F08C2E",
  red: "#d23b3b",
  ok: "#1b9e4b",
};

export const COMPLIANCE_PRICE_ID = "price_1TdJlxIE4fOP88RJBeqKRVgw";

// The 8 NEPA triggers from 47 CFR 1.1307(a) — order + labels + source hint.
export const TRIGGERS = [
  { key: "floodplain", label: "Floodplain", source: "FEMA (Section 4)" },
  { key: "wetlands", label: "Wetlands", source: "NWI (Section 4)" },
  { key: "listedSpeciesHabitat", label: "Listed Species Habitat", source: "USFWS (data source pending)" },
  { key: "historicDistrict", label: "Historic District", source: "NPS (data source pending)" },
  { key: "indianReligiousSite", label: "Indian Religious Site", source: "Manual entry" },
  { key: "residentialArea", label: "Residential Area", source: "Zoning (Section 2)" },
  { key: "hazardousWasteSite", label: "Hazardous Waste Site", source: "EPA (data source pending)" },
  { key: "lightingMigratoryBirdImpact", label: "Lighting / Migratory Bird Impact", source: "Tower height (Section 1)" },
];

export const NEPA_BADGE = {
  "Not Started": { label: "Not Started", bg: "#6b7280" },
  "CatEx Eligible": { label: "🚀 Likely NEPA Categorical Exclusion (47 CFR 1.1307)", bg: HC.ok },
  "EA Required": { label: "EA Required", bg: HC.amber, color: "#1a1a1a" },
  "EIS Required": { label: "EIS Required", bg: HC.red },
  "Complete": { label: "Complete", bg: HC.green },
};

export const SHPO_DET = ["Not Submitted", "Pending Review", "No Historic Properties Affected", "No Adverse Effect", "Adverse Effect", "Insufficient Information"];
export const THPO_STATUS = ["Not Notified", "Notified", "Cleared", "Objection Received", "Extension Requested"];

// Which statuses are "clock running"
export const SHPO_RUNNING = "Pending Review";
export const THPO_RUNNING = "Notified";

export const DISCLAIMER =
  "Hawk Compliance tracks regulatory workflow status and pre-screens against federal datasets. It is not legal advice or an official agency determination. Confirm all clearances with the appropriate SHPO, THPO, and FCC counsel before construction.";

// Whole-number days between a YYYY-MM-DD date and today.
export function daysSince(dateStr) {
  if (!dateStr) return null;
  const start = new Date(dateStr + "T00:00:00");
  if (isNaN(start)) return null;
  const ms = Date.now() - start.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

// 30-day FCC NPA shot clock → color band + label.
export function shotClock(days) {
  if (days == null) return { band: "none", color: "#6b7280", label: "—", pct: 0 };
  const pct = Math.min(100, (days / 30) * 100);
  if (days >= 30) return { band: "expired", color: HC.red, label: "Statutory deadline expired — assume concurrence per FCC NPA", pct: 100 };
  if (days >= 26) return { band: "orange", color: HC.orange, label: "Follow up now", pct };
  if (days >= 21) return { band: "yellow", color: HC.amber, label: "Approaching deadline", pct };
  return { band: "green", color: HC.ok, label: "On Track", pct };
}

// Compute NEPA determination from flags + disturbance + project type.
export function computeDetermination(flags = {}, groundDisturbanceArea, projectType) {
  const anyFlag = TRIGGERS.some((t) => flags[t.key]);
  const disturbance = Number(groundDisturbanceArea) || 0;
  const isCollocation = projectType === "collocation";
  if (!anyFlag && disturbance <= 0 && isCollocation) return "CatEx Eligible";
  if (anyFlag || projectType === "new_tower" || disturbance > 0) return "EA Required";
  return "Not Started";
}

export function triggersFired(flags = {}) {
  return TRIGGERS.filter((t) => flags[t.key]);
}