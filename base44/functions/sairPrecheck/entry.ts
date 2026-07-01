/**
 * sairPrecheck — S.A.I.R. Data Richness Gate.
 *
 * Checks Regrid parcel-schema field coverage for a specific county using
 * Regrid's publicly published Coverage Report (Google Sheets CSV).
 * No Regrid API credits consumed — this is a free public sheet.
 *
 * Coverage report: https://docs.google.com/spreadsheets/d/1rvRYv6_ppZlwbmyi2kbzemot6FOEm2EEPdHPyENTQPE
 * Query format: SELECT * WHERE A='<STATE>' AND B='<COUNTY>'
 *
 * Input:  { state, county, threshold? (default 70) }
 * Output: { found, proceed, richness_score, low_fields, message, pcts }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Fields we care about for tower-siting parcel quality (fieldname_pct columns in coverage report)
const SCORED_FIELDS = ["owner", "address", "ll_gisacre", "zoning", "lat", "lon"];
const SHEET_ID = "1rvRYv6_ppZlwbmyi2kbzemot6FOEm2EEPdHPyENTQPE";
const GID = "1284673582";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { state, county, threshold = 70 } = await req.json();
    if (!state || !county) {
      return Response.json({ error: "state and county required" }, { status: 400 });
    }

    const stateCode = state.trim().toUpperCase();
    // Regrid county names in the sheet use title case (e.g. "Hillsborough")
    const countyName = county.trim().replace(/\bcounty\b/i, "").trim();
    const tq = encodeURIComponent(`SELECT * WHERE A='${stateCode}' AND B='${countyName}'`);
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}&tq=${tq}`;

    console.log(`[sairPrecheck] Fetching Regrid coverage for ${countyName}, ${stateCode}`);

    const res = await fetch(csvUrl, { headers: { "Accept": "text/csv" } });
    if (!res.ok) {
      console.error("[sairPrecheck] Coverage sheet fetch failed:", res.status);
      return Response.json({
        found: false, proceed: true, richness_score: null,
        message: `Coverage report unavailable (HTTP ${res.status}) — proceed with caution.`,
        low_fields: [], pcts: {},
      });
    }

    const csv = await res.text();
    const lines = csv.trim().split("\n").map((l) => l.trim());
    if (lines.length < 2) {
      return Response.json({
        found: false, proceed: true, richness_score: null,
        message: `${countyName} County, ${stateCode} not found in Regrid coverage report. Data may still be available — proceed normally.`,
        low_fields: [], pcts: {},
      });
    }

    // Parse CSV header + first data row
    const parseCSVRow = (line) => {
      const vals = [];
      let cur = "", inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === "," && !inQ) { vals.push(cur); cur = ""; continue; }
        cur += ch;
      }
      vals.push(cur);
      return vals;
    };

    const headers = parseCSVRow(lines[0]);
    const row = parseCSVRow(lines[1]);
    if (!row || row.length < 3) {
      return Response.json({
        found: false, proceed: true, richness_score: null,
        message: `${countyName} County, ${stateCode} not found in Regrid coverage report.`,
        low_fields: [], pcts: {},
      });
    }

    // Build a map of fieldname → pct value from the _pct columns
    const pcts = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (h.endsWith("_pct")) {
        const fieldName = h.slice(0, -4);
        const val = parseFloat(row[i]);
        if (!isNaN(val)) pcts[fieldName] = Math.round(val);
      }
    }

    // Score the key fields we care about
    const scored = SCORED_FIELDS.map((f) => ({ field: f, pct: pcts[f] ?? null })).filter((x) => x.pct != null);
    let richness_score = null;
    let low_fields = [];

    if (scored.length > 0) {
      richness_score = Math.round(scored.reduce((s, x) => s + x.pct, 0) / scored.length);
      low_fields = scored.filter((x) => x.pct < threshold).map((x) => `${x.field} (${x.pct}%)`);
    } else {
      richness_score = 75; // county found but no _pct columns matched — assume OK
    }

    const proceed = richness_score >= threshold;
    const message = proceed
      ? `${countyName} County, ${stateCode} — Regrid coverage ${richness_score}% ✓ Safe to proceed.`
      : `${countyName} County, ${stateCode} — Regrid coverage ${richness_score}% (below ${threshold}% threshold). Some parcel fields may be sparse.`;

    return Response.json({ found: true, proceed, richness_score, low_fields, message, pcts });
  } catch (err) {
    console.error("[sairPrecheck] error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});