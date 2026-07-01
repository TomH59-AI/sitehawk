/**
 * followUpTrackerSync — sync FollowUpTracker rows to a Google Sheet.
 * Actions:
 *   "init"   — create/find the sheet and write the header row. Returns { spreadsheetId, spreadsheetUrl }.
 *   "push"   — append or update one row in the sheet.
 *   "pushAll" — write all rows for the current user.
 *   "getSheetId" — return stored spreadsheetId from AppSetting, or null.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_TITLE = "Follow-Up Tracker";
const HEADERS = [
  "Last Updated", "PM", "Site Name", "Jurisdiction", "Search Ring Center",
  "Contact Name", "Email", "Phone", "Parcel Address", "Mailing Address",
  "APN", "Zoning", "FEMA Zone", "Acreage", "Status",
  "Mailers Sent", "Last Mailer Date", "Notes", "Record ID"
];

function rowFromRecord(r) {
  return [
    new Date().toLocaleDateString("en-US"),
    r.pm || "",
    r.site_name || "",
    r.jurisdiction || "",
    r.search_ring_center || "",
    r.contact_name || "",
    r.email || "",
    r.phone || "",
    r.parcel_address || "",
    r.mailing_address || "",
    r.apn || "",
    r.zoning || "",
    r.fema_zone || "",
    r.acreage != null ? String(r.acreage) : "",
    r.status || "New Lead",
    r.mailers_sent != null ? String(r.mailers_sent) : "0",
    r.last_mailer_date || "",
    r.notes || "",
    r.id || "",
  ];
}

async function getOrCreateSpreadsheet(accessToken, existingId) {
  // Try existing
  if (existingId) {
    const check = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${existingId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (check.ok) return existingId;
  }

  // Create new spreadsheet
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title: "SiteHawk — Master Follow-Up Sites" },
      sheets: [{ properties: { title: SHEET_TITLE } }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheet create error: ${JSON.stringify(data)}`);
  return data.spreadsheetId;
}

async function ensureHeaders(accessToken, spreadsheetId) {
  const range = `'${SHEET_TITLE}'!A1:S1`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const existing = data?.values?.[0];
  if (existing && existing[0] === HEADERS[0]) return; // already set

  // Write headers
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [HEADERS] }),
    }
  );
}

async function appendRows(accessToken, spreadsheetId, rows) {
  const range = `'${SHEET_TITLE}'!A:S`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: rows }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Append error: ${JSON.stringify(data)}`);
  return data;
}

async function replaceAllRows(accessToken, spreadsheetId, rows) {
  // Clear data rows (keep header)
  const clearRange = `'${SHEET_TITLE}'!A2:S`;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!rows.length) return;
  const range = `'${SHEET_TITLE}'!A2:S`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: rows }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Write error: ${JSON.stringify(data)}`);
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { action, record, spreadsheetId: clientSheetId } = await req.json();

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    if (!accessToken) return Response.json({ error: "Google Sheets not connected" }, { status: 400 });

    // Load stored spreadsheet ID from AppSetting (keyed per user)
    const settingKey = `followup_tracker_sheet_${user.email?.replace(/[^a-z0-9]/gi, "_")}`;
    let storedSheetId = null;
    try {
      const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: settingKey });
      storedSheetId = settings?.[0]?.value || null;
    } catch { /* first time */ }

    const effectiveSheetId = clientSheetId || storedSheetId || null;

    if (action === "getSheetId") {
      return Response.json({ spreadsheetId: storedSheetId });
    }

    if (action === "init") {
      const sheetId = await getOrCreateSpreadsheet(accessToken, effectiveSheetId);
      await ensureHeaders(accessToken, sheetId);
      // Persist the sheet ID
      if (sheetId !== storedSheetId) {
        const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: settingKey });
        if (existing?.length) {
          await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value: sheetId });
        } else {
          await base44.asServiceRole.entities.AppSetting.create({ key: settingKey, value: sheetId });
        }
      }
      return Response.json({ spreadsheetId: sheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}` });
    }

    if (!effectiveSheetId) {
      return Response.json({ error: "No spreadsheet linked — run init first." }, { status: 400 });
    }
    await ensureHeaders(accessToken, effectiveSheetId);

    if (action === "push" && record) {
      const row = rowFromRecord(record);
      await appendRows(accessToken, effectiveSheetId, [row]);
      return Response.json({ ok: true });
    }

    if (action === "pushAll") {
      const records = await base44.asServiceRole.entities.FollowUpTracker.filter({ created_by: user.email });
      const rows = records.map(rowFromRecord);
      await replaceAllRows(accessToken, effectiveSheetId, rows);
      return Response.json({ ok: true, count: rows.length });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[followUpTrackerSync]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});