// CSV import/export for the Jurisdiction Resource Registry.
// One CSV row = jurisdiction (+ optional resource + optional contact); repeated
// jurisdiction rows are de-duplicated by (name, state) on import.

import { base44 } from "@/api/base44Client";
import { CSV_COLUMNS } from "./registryConst";

// ---------- parse ----------
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildTemplateCsv() {
  return CSV_COLUMNS.join(",") + "\n";
}

export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- export ----------
export async function exportRegistryCsv() {
  const [jurisdictions, resources, contacts] = await Promise.all([
    base44.entities.JurisdictionRegistry.list("-updated_date", 1000),
    base44.entities.JurisdictionResource.list("-updated_date", 5000),
    base44.entities.JurisdictionContact.list("-updated_date", 5000),
  ]);
  const lines = [CSV_COLUMNS.join(",")];
  for (const j of jurisdictions) {
    const jr = resources.filter((r) => r.jurisdiction_id === j.id);
    const jc = contacts.filter((c) => c.jurisdiction_id === j.id);
    const max = Math.max(jr.length, jc.length, 1);
    for (let i = 0; i < max; i++) {
      const r = jr[i] || {};
      const c = jc[i] || {};
      lines.push([
        j.name, j.state, j.county || "", j.jurisdiction_type || "", j.official_website_url || "",
        r.resource_type || "", r.title || "", r.url || "", r.source_platform || "",
        r.status || "", r.verified_on || "", r.notes || "",
        c.department || "", c.contact_name || "", c.title || "", c.email || "",
        c.phone || "", c.website_url || "", c.notes || "",
      ].map(esc).join(","));
    }
  }
  return lines.join("\n");
}

// ---------- import ----------
export async function importRegistryCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV has no data rows");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (row, name) => {
    const i = header.indexOf(name);
    return i >= 0 ? (row[i] || "").trim() : "";
  };

  const existing = await base44.entities.JurisdictionRegistry.list("-updated_date", 2000);
  const key = (n, s) => `${(n || "").toLowerCase()}|${(s || "").toUpperCase()}`;
  const byKey = new Map(existing.map((j) => [key(j.name, j.state), j]));

  let created = 0, resourcesCreated = 0, contactsCreated = 0, skipped = 0;
  const newResources = [], newContacts = [];

  for (const row of rows.slice(1)) {
    const name = col(row, "jurisdiction_name");
    const state = col(row, "state").toUpperCase();
    if (!name || !state) { skipped++; continue; }

    let jur = byKey.get(key(name, state));
    if (!jur) {
      jur = await base44.entities.JurisdictionRegistry.create({
        name, state,
        county: col(row, "county"),
        jurisdiction_type: col(row, "jurisdiction_type") || "municipality",
        official_website_url: col(row, "official_website_url"),
        active: true,
      });
      byKey.set(key(name, state), jur);
      created++;
    }

    const rType = col(row, "resource_type");
    if (rType) {
      newResources.push({
        jurisdiction_id: jur.id,
        resource_type: rType,
        title: col(row, "resource_title"),
        url: col(row, "resource_url"),
        source_platform: col(row, "source_platform"),
        // Never let an import mark a link verified without a verification date.
        status: col(row, "resource_status") === "verified" && col(row, "verified_on")
          ? "verified"
          : (col(row, "resource_status") || "needs_review"),
        verified_on: col(row, "verified_on") || undefined,
        notes: col(row, "resource_notes"),
        active: true,
      });
      resourcesCreated++;
    }

    const dept = col(row, "department");
    const cName = col(row, "contact_name");
    if (dept || cName) {
      newContacts.push({
        jurisdiction_id: jur.id,
        department: dept || "other",
        contact_name: cName,
        title: col(row, "contact_title"),
        email: col(row, "contact_email"),
        phone: col(row, "contact_phone"),
        website_url: col(row, "contact_website"),
        notes: col(row, "contact_notes"),
        active: true,
      });
      contactsCreated++;
    }
  }

  if (newResources.length) await base44.entities.JurisdictionResource.bulkCreate(newResources);
  if (newContacts.length) await base44.entities.JurisdictionContact.bulkCreate(newContacts);

  return { created, resourcesCreated, contactsCreated, skipped };
}