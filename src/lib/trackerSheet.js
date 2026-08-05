// Shared store for the in-app Site Candidate Tracker grid. Rows live in the
// browser only — nothing is exported or uploaded from here.
export const TRACKER_COLUMNS = [
  "Site Name", "Owner's Name", "Parcel Address", "Parcel ID", "Parcel Size (acres)",
  "Zoning Classification", "Jurisdiction", "Latitude", "Longitude",
  "FEMA Risk Factor Letter", "Phone", "Email Address", "Owner's Mailing Address",
];

const STORE_KEY = "hawk_tracker_sheet_rows";
export const TRACKER_SHEET_EVENT = "hawk-tracker-sheet-updated";

export const blankTrackerRow = () => TRACKER_COLUMNS.map(() => "");

export function loadTrackerRows() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch { /* ignore */ }
  return [blankTrackerRow(), blankTrackerRow(), blankTrackerRow()];
}

export function saveTrackerRows(rows) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(rows)); } catch { /* ignore */ }
}

// Append a row, reusing a leading blank row if the grid is still untouched.
export function appendTrackerRow(values) {
  const row = blankTrackerRow().map((_, i) => values[i] ?? "");
  const rows = loadTrackerRows();
  const firstBlank = rows.findIndex((r) => r.every((c) => !String(c).trim()));
  if (firstBlank >= 0) rows[firstBlank] = row;
  else rows.push(row);
  saveTrackerRows(rows);
  window.dispatchEvent(new Event(TRACKER_SHEET_EVENT));
  return rows;
}