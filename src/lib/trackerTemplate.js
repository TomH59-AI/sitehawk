/**
 * trackerTemplate.js — which spreadsheet layout the tracker is working in.
 *
 * A browser can't write into a file sitting on someone's computer, so "append to
 * their file" works like this: we remember the column layout they chose (the
 * SiteHawk tracker, or the headers off their own upload) and re-export every
 * tracker site into that exact layout on demand. Same columns, same order, their
 * file grows by re-downloading it.
 */
import * as XLSX from "xlsx";
import { autoMapHeaders } from "@/lib/trackerImport";
import { MILESTONE_LABELS } from "@/lib/hawkTracker";

const KEY = "hawk_tracker_active_template";

// The SiteHawk candidate-site tracker layout — headers on row 1.
export const HAWK_HEADERS = [
  "Site Name",
  "Owner's Name",
  "Parcel Address",
  "Parcel ID",
  "Parcel Size (acres)",
  "Zoning Classification",
  "Jurisdiction",
  "Latitude",
  "Longitude",
  "FEMA Risk Factor Letter",
  "Phone",
  "Email Address",
  "Owner's Mailing Address",
  "Carrier",
  "Market",
  "Current Status",
  "Target On-Air Date",
];

export const HAWK_TEMPLATE = { kind: "hawk", name: "SiteHawk Tracker", headers: HAWK_HEADERS };

export function getActiveTemplate() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return HAWK_TEMPLATE;
    const t = JSON.parse(raw);
    return Array.isArray(t?.headers) && t.headers.length ? t : HAWK_TEMPLATE;
  } catch {
    return HAWK_TEMPLATE;
  }
}

export function setActiveTemplate(template) {
  localStorage.setItem(KEY, JSON.stringify(template));
}

export function useHawkTemplate() {
  setActiveTemplate(HAWK_TEMPLATE);
}

// Turn a tracker site into the value for one of the template's columns.
// Columns the tracker has no field for stay blank rather than guessing.
function valueFor(site, field) {
  if (!field) return "";
  if (field === "current_status") return MILESTONE_LABELS[site.current_status] || site.current_status || "";
  const v = site[field];
  return v == null ? "" : v;
}

// Re-export every tracker site into the active template's column layout.
export function exportSitesToTemplate(sites, template = getActiveTemplate()) {
  const headers = template.headers;
  const auto = autoMapHeaders(headers); // { colIndex: { field } }
  const rows = sites.map((site) =>
    Object.fromEntries(headers.map((h, i) => [h, valueFor(site, auto[i]?.field)]))
  );
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sites");
  const base = template.kind === "hawk" ? "SiteHawk-Candidate-Site-Tracker" : "My-Tracker";
  XLSX.writeFile(book, `${base}-updated.xlsx`);
  return { count: rows.length, columns: headers.length };
}