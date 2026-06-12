/**
 * trackerImport.js — Hawk Tracker CSV/XLSX import engine (spec v1).
 * Pure functions only: file parsing, header auto-mapping, value normalization,
 * per-row validation, dedup, and milestone backfill planning. The wizard UI in
 * components/tracker/import consumes these.
 */
import * as XLSX from "xlsx";
import { MILESTONES } from "@/lib/hawkTracker";

export const MAX_ROWS = 500;

// ── §2 target fields (mapping dropdown) ──
export const TARGET_FIELDS = [
  { key: "site_name", label: "Site Name *" },
  { key: "carrier_site_number", label: "Carrier Site Number" },
  { key: "carrier", label: "Carrier" },
  { key: "market", label: "Market" },
  { key: "state", label: "State" },
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "current_status", label: "Current Status" },
  { key: "target_on_air", label: "Target On-Air Date" },
  { key: "blocked_reason", label: "Blocked Reason" },
  { key: "notes", label: "Notes" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
];

// ── §3 header alias table ──
const ALIASES = {
  site_name: ["site name", "site", "name", "project name", "search ring name", "ring name", "candidate name", "location name"],
  carrier_site_number: ["site number", "site no", "site id", "fa number", "fa", "fa location", "usid", "ploc", "pslc", "fuze id", "atoll id", "sc number", "project number", "project id", "job number"],
  carrier: ["carrier", "customer", "client", "operator"],
  market: ["market", "region", "cluster", "program", "deployment"],
  state: ["state", "st"],
  jurisdiction: ["jurisdiction", "county", "city", "municipality", "township", "ahj"],
  current_status: ["status", "current status", "phase", "stage", "milestone", "site status", "progress"],
  target_on_air: ["on air", "on-air date", "target on air", "oa date", "launch date", "forecast", "target date", "complete date"],
  blocked_reason: ["blocked", "blocker", "issue", "hold", "hold reason", "risk", "comments on hold"],
  notes: ["notes", "comments", "remarks", "update", "weekly update", "action items"],
  latitude: ["lat", "latitude", "y"],
  longitude: ["lon", "lng", "long", "longitude", "x"],
};

const normHeader = (h) => String(h || "").toLowerCase().replace(/[#._\-]/g, " ").replace(/\s+/g, " ").trim();

// Auto-map headers → { colIndex: { field, confidence } }. One column per field
// (first claim wins); exact alias hit = high, contains hit = low.
export function autoMapHeaders(headers) {
  const mapping = {};
  const claimed = new Set();
  // Pass 1 — exact alias matches.
  headers.forEach((h, i) => {
    const n = normHeader(h);
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (claimed.has(field)) continue;
      if (aliases.some((a) => normHeader(a) === n)) {
        mapping[i] = { field, confidence: "high" };
        claimed.add(field);
        break;
      }
    }
  });
  // Pass 2 — partial/contains matches on still-unmapped columns.
  headers.forEach((h, i) => {
    if (mapping[i]) return;
    const n = normHeader(h);
    if (n.length < 2) return;
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (claimed.has(field)) continue;
      if (aliases.some((a) => {
        const na = normHeader(a);
        return na.length >= 3 && n.length >= 3 && (n.includes(na) || na.includes(n));
      })) {
        mapping[i] = { field, confidence: "low" };
        claimed.add(field);
        break;
      }
    }
  });
  return mapping;
}

// ── §4.1 status → milestone key. First match wins, most-specific first. ──
const STATUS_RULES = [
  [["ntp"], "ntp_issued"],
  [["bp issued", "permit issued", "bp received", "permit in hand"], "bp_issued"],
  [["bp submitted", "permit submitted", "bp pending", "permitting"], "bp_submitted"],
  [["cd approved", "cds approved", "construction drawings"], "cd_approved"],
  [["survey"], "survey_complete"],
  [["zoning approved", "zoning complete", "zd approved", "entitled"], "zoning_approved"],
  [["zoning", "zd submitted", "hearing"], "zoning_submitted"],
  [["nepa", "shpo", "thpo", "106", "regulatory", "environmental"], "regulatory_complete"],
  [["lease executed", "lease signed", "fully executed", "lease complete"], "lease_executed"],
  [["lease", "leasing", "in negotiation", "legal review"], "lease_negotiation"],
  [["loi executed", "loi signed"], "loi_executed"],
  [["loi"], "loi_issued"],
  [["landlord", "ll contact", "owner contact", "outreach"], "landlord_contacted"],
  [["scip approved", "candidate approved", "a-cand approved", "site approved"], "scip_approved"],
  [["scip", "candidate submitted", "package submitted", "saq submitted"], "scip_submitted"],
  [["site visit", "sv complete", "field visit", "drive"], "site_visits_complete"],
  [["candidates", "cands identified"], "candidates_identified"],
  [["exhaust", "dead", "no candidate", "ring closed"], "ring_exhausted"],
  [["sarf", "ring received", "ring issued", "new ring", "assigned"], "search_ring_received"],
];

export function normalizeStatus(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return { key: "search_ring_received", recognized: true, empty: true };
  for (const [keywords, key] of STATUS_RULES) {
    if (keywords.some((k) => t.includes(k))) return { key, recognized: true };
  }
  return { key: "search_ring_received", recognized: false };
}

// ── §4.2 carrier ──
export function normalizeCarrier(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return "";
  if (/verizon|vzw/.test(t)) return "Verizon";
  if (/at&t|att\b|^att$/.test(t.replace(/\s/g, ""))) return "AT&T";
  if (/t-?mobile|tmo\b|tmus/.test(t)) return "T-Mobile";
  if (/dish|echostar/.test(t)) return "DISH";
  return String(text).trim();
}

// ── §4.3 dates — MM/DD/YYYY, M/D/YY, YYYY-MM-DD, Excel serial, Date object ──
export function parseImportDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000 && value < 60000) {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let yr = +m[3];
    if (yr < 100) yr += yr < 70 ? 2000 : 1900;
    const d = new Date(Date.UTC(yr, +m[1] - 1, +m[2]));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

// ── §6 state normalization ──
const STATE_NAMES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
  "puerto rico": "PR", guam: "GU",
};
const STATE_CODES = new Set([...Object.values(STATE_NAMES), "DC", "PR", "GU", "VI", "AS", "MP"]);

export function normalizeState(text) {
  const t = String(text || "").trim();
  if (!t) return { code: "", valid: true };
  const up = t.toUpperCase();
  if (up.length === 2 && STATE_CODES.has(up)) return { code: up, valid: true };
  const byName = STATE_NAMES[t.toLowerCase()];
  if (byName) return { code: byName, valid: true };
  return { code: "", valid: false };
}

// ── §4.4 blocked detection (mapped status/blocker columns only) ──
const BLOCK_WORDS = ["hold", "blocked", "on hold", "stop work", "paused"];
export function detectBlocked(...cells) {
  for (const c of cells) {
    const t = String(c || "").toLowerCase();
    if (t && BLOCK_WORDS.some((w) => t.includes(w))) return String(c).trim();
  }
  return null;
}

// ── File parsing — one path for .csv and .xlsx via SheetJS. Active sheet only. ──
export async function parseImportFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: true });
  const headers = (rows[0] || []).map((h) => String(h ?? "").trim());
  return {
    headers,
    rows: rows.slice(1, 1 + MAX_ROWS),
    sheetName,
    truncated: rows.length - 1 > MAX_ROWS,
    multiSheet: wb.SheetNames.length > 1,
  };
}

// ── §5/§6 build the import plan from parsed rows + the user's mapping ──
// mapping: { colIndex: fieldKey }, notesCols: [colIndex] appended to notes.
export function buildImportPlan({ headers, rows, mapping, notesCols = [], existingSites = [], updateExisting = false }) {
  const colFor = {};
  Object.entries(mapping).forEach(([i, field]) => { if (field) colFor[field] = Number(i); });

  const existingByKey = new Map();
  for (const s of existingSites) {
    if (s.carrier_site_number) existingByKey.set(`csn:${String(s.carrier_site_number).toLowerCase().trim()}`, s);
    existingByKey.set(`name:${String(s.site_name || "").toLowerCase().trim()}`, s);
  }
  const fileKeys = new Set();
  const headerNorm = headers.map(normHeader).join("|");

  const creates = [], updates = [], skipped = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based incl. header
    const cell = (field) => (colFor[field] != null ? row[colFor[field]] : "");
    const str = (field) => String(cell(field) ?? "").trim();

    // Empty rows / header repeats → skip silently.
    if (row.every((c) => String(c ?? "").trim() === "")) return;
    if (row.map(normHeader).join("|") === headerNorm) return;

    const warnings = [];
    const siteName = str("site_name");
    if (!siteName) {
      skipped.push({ rowNum, reason: "Missing site name", raw: row });
      return;
    }

    // Status normalization (§4.1).
    const rawStatus = str("current_status");
    const st = normalizeStatus(rawStatus);
    let extraNotes = "";
    if (!st.recognized) {
      warnings.push(`Status "${rawStatus}" not recognized — defaulted to Search Ring Received`);
      extraNotes += `[Imported status: "${rawStatus}"]`;
    }

    // Coordinates (§6).
    let latitude = null, longitude = null;
    const latRaw = str("latitude"), lonRaw = str("longitude");
    if (latRaw || lonRaw) {
      const la = Number(latRaw), lo = Number(lonRaw);
      if (Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180) {
        latitude = la; longitude = lo;
      } else {
        warnings.push("Invalid coordinates — dropped");
      }
    }

    // State (§6).
    const stRes = normalizeState(str("state"));
    if (!stRes.valid) warnings.push(`State "${str("state")}" not recognized — left blank`);

    // Date (§4.3).
    const dateRaw = cell("target_on_air");
    const targetOnAir = parseImportDate(dateRaw);
    if (dateRaw !== "" && dateRaw != null && !targetOnAir) warnings.push(`Date "${dateRaw}" unparseable — left blank`);

    // Blocked (§4.4) — mapped status/blocker columns only.
    const blockedText = detectBlocked(rawStatus, str("blocked_reason"));

    // Notes + appended unmapped columns.
    const noteParts = [str("notes"), extraNotes].filter(Boolean);
    for (const ci of notesCols) {
      const v = String(row[ci] ?? "").trim();
      if (v) noteParts.push(`${headers[ci]}: ${v}`);
    }

    const data = {
      site_name: siteName,
      carrier_site_number: str("carrier_site_number"),
      carrier: normalizeCarrier(str("carrier")),
      market: str("market"),
      state: stRes.code,
      jurisdiction: str("jurisdiction"),
      current_status: st.key,
      target_on_air: targetOnAir,
      is_blocked: !!blockedText,
      blocked_reason: blockedText || "",
      notes: noteParts.join("\n"),
      latitude, longitude,
    };

    // Dedup (§5): carrier_site_number first, else site_name.
    const key = data.carrier_site_number
      ? `csn:${data.carrier_site_number.toLowerCase().trim()}`
      : `name:${siteName.toLowerCase().trim()}`;
    if (fileKeys.has(key)) {
      skipped.push({ rowNum, reason: "Duplicate within file (kept first occurrence)", raw: row, data });
      return;
    }
    fileKeys.add(key);

    const existing = existingByKey.get(key);
    if (existing) {
      if (updateExisting) {
        updates.push({ rowNum, data, warnings, existing });
      } else {
        skipped.push({ rowNum, reason: `Duplicate of existing site "${existing.site_name}"`, raw: row, data });
      }
      return;
    }

    creates.push({ rowNum, data, warnings });
  });

  const warningCount = [...creates, ...updates].filter((r) => r.warnings.length).length;
  return { creates, updates, skipped, warningCount };
}

// ── §7 milestone backfill — honest progress without invented history ──
export function buildBackfillRows(siteId, statusKey) {
  if (statusKey === "ring_exhausted") {
    return MILESTONES.map((m) => {
      let status = "na";
      if (m.key === "search_ring_received" || m.key === "candidates_identified") status = "complete";
      if (m.key === "ring_exhausted") status = "in_progress";
      return {
        tracker_site_id: siteId, milestone: m.key, status, backfilled: true,
        notes: status === "complete" ? "Backfilled on import" : "",
      };
    });
  }
  const idx = MILESTONES.findIndex((m) => m.key === statusKey);
  return MILESTONES.map((m, i) => {
    if (i < idx) return { tracker_site_id: siteId, milestone: m.key, status: "complete", backfilled: true, notes: "Backfilled on import" };
    if (i === idx) return { tracker_site_id: siteId, milestone: m.key, status: "in_progress", backfilled: true, notes: "" };
    return { tracker_site_id: siteId, milestone: m.key, status: "pending", backfilled: false, notes: "" };
  });
}

// ── §8 download skipped/warning rows as CSV ──
export function downloadRowsCsv(entries, filename = "hawk-tracker-import-issues.csv") {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["Row", "Issue", "Site Name", "Detail"].join(",")];
  for (const e of entries) {
    lines.push([e.rowNum, esc(e.reason || (e.warnings || []).join("; ")), esc(e.data?.site_name || ""), esc((e.raw || []).join(" | "))].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}