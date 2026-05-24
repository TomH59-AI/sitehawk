// Sync CRMDeals (tracked parcels) + linked SearchResult zoning data into a Google Sheet.
// Uses the shared googlesheets connector (the app builder's account).
// On first run: creates a new spreadsheet "SiteHawk Permitting Pipeline" and stores its ID
// in AppSetting. Subsequent runs overwrite that sheet's contents.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SHEET_TITLE = "SiteHawk Permitting Pipeline";
const TAB_NAME = "Pipeline";
const SETTING_KEY = "permitting_pipeline_sheet_id";

const HEADERS = [
  "Owner", "Parcel Address", "APN", "Acres", "Zoning Class", "Jurisdiction",
  "Permit Type", "Height Limit", "Setback", "Stage", "Follow-up Date",
  "Phone", "Email", "Match Score", "Lat", "Lon", "Last Synced",
];

function fmt(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function buildRow(deal, sr, ord, now) {
  const permitType = ord?.requires_cup ? "CUP" : ord?.requires_sup ? "SUP" : ord?.permit_type || "";
  return [
    fmt(deal.owner_name),
    fmt(deal.parcel_address || sr?.parcel_address),
    fmt(sr?.parcel_id),
    fmt(sr?.parcel_size_acres),
    fmt(sr?.zoning_classification),
    fmt(sr?.zoning_jurisdiction || ord?.jurisdiction),
    fmt(permitType),
    fmt(ord?.height_limit_ft),
    fmt(ord?.setback_ft),
    fmt(deal.stage),
    fmt(deal.follow_up_date),
    fmt(deal.phone),
    fmt(deal.email),
    fmt(deal.match_score),
    fmt(deal.latitude ?? sr?.latitude),
    fmt(deal.longitude ?? sr?.longitude),
    now,
  ];
}

async function gfetch(url, accessToken, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) {
    throw new Error(`Google API ${r.status}: ${text.slice(0, 400)}`);
  }
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    if (!accessToken) {
      return Response.json({ error: 'Google Sheets not connected' }, { status: 400 });
    }

    // 1. Load tracked parcels (CRMDeals) and enrich with linked SearchResults
    const deals = await base44.entities.CRMDeal.list("-updated_date", 1000);
    const searchResultIds = [...new Set(deals.map(d => d.candidate_id).filter(Boolean))];

    const searchResults = {};
    if (searchResultIds.length) {
      // Pull in batches to avoid huge filter payloads
      const all = await base44.entities.SearchResult.filter({ id: { $in: searchResultIds } }, "-updated_date", searchResultIds.length);
      for (const sr of all) searchResults[sr.id] = sr;
    }

    // 2. Resolve / create the spreadsheet
    let sheetId = null;
    const settings = await base44.entities.AppSetting.filter({ key: SETTING_KEY }, "-updated_date", 1);
    const setting = settings[0];

    if (setting?.value) {
      // Verify it still exists / is accessible
      try {
        await gfetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${setting.value}?fields=spreadsheetId,properties.title`,
          accessToken,
        );
        sheetId = setting.value;
      } catch (e) {
        console.warn(`Stored sheet ${setting.value} not accessible, creating a new one: ${e.message}`);
      }
    }

    if (!sheetId) {
      const created = await gfetch(
        `https://sheets.googleapis.com/v4/spreadsheets`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            properties: { title: SHEET_TITLE },
            sheets: [{ properties: { title: TAB_NAME } }],
          }),
        },
      );
      sheetId = created.spreadsheetId;
      if (setting) {
        await base44.entities.AppSetting.update(setting.id, { value: sheetId });
      } else {
        await base44.entities.AppSetting.create({ key: SETTING_KEY, value: sheetId });
      }
    }

    // 3. Clear existing tab data and write fresh rows
    const now = new Date().toISOString();
    const rows = deals.map(d => buildRow(d, searchResults[d.candidate_id], d.ordinance, now));
    const values = [HEADERS, ...rows];

    await gfetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(TAB_NAME)}:clear`,
      accessToken,
      { method: "POST", body: "{}" },
    );

    await gfetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(TAB_NAME)}!A1?valueInputOption=RAW`,
      accessToken,
      { method: "PUT", body: JSON.stringify({ values }) },
    );

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    console.log(`[syncParcelsToGoogleSheet] user=${user.email} synced ${rows.length} deals → ${sheetUrl}`);

    return Response.json({
      success: true,
      spreadsheet_id: sheetId,
      spreadsheet_url: sheetUrl,
      rows_synced: rows.length,
    });
  } catch (error) {
    console.error('syncParcelsToGoogleSheet error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});