// Shared NEW SCIP 8.1.2026 workbook renderer.
// Renders the eight-page SCIP as an ExcelJS workbook from the generic
// { sections, mapPages } shape (the same shape the frontend scipBookData
// builders emit). Used by:
//   - generateScipWorkbook  (downloadable .xlsx)
//   - scipBookSheet         (uploaded to Drive + converted to a Google Sheet,
//                            so map images arrive embedded — no IMAGE() fetch
//                            approval prompt)
import ExcelJS from "npm:exceljs@4.4.0";

const NAVY = "FF0F2A43";
const BLUE = "FF1D6FB8";
const DARK_TEXT = "FF1A1A1A";
const FONT = "Calibri";
const COL_A_WIDTH = 33.42578125;
const COL_B_WIDTH = 56.7109375;
const IMAGE_ROW_PT = 400;

export interface BookSection { title: string; rows: Array<{ label: string; value?: string | null }>; }
export interface BookMapSlot { label: string; url?: string | null; caption?: string; }
export interface BookMapPage { title: string; slots: BookMapSlot[]; }
export interface BookInput {
  title?: string;
  sections: BookSection[];
  sarfUrl?: string | null;   // inserted as the SARF MAP after the SEARCH RING section
  mapPages: BookMapPage[];
}

function headerCell(ws: any, r: number, text: string, isTitle: boolean, mergeB: boolean) {
  if (mergeB) ws.mergeCells(`A${r}:B${r}`);
  const cell = ws.getCell(`A${r}`);
  cell.value = text;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isTitle ? NAVY : BLUE } };
  cell.font = { name: FONT, size: isTitle ? 13 : 11, bold: true, color: { argb: "FFFFFFFF" } };
  cell.alignment = { horizontal: isTitle ? "center" : "left", vertical: "middle", indent: 1 };
  ws.getRow(r).height = isTitle ? 30 : 18;
}

function captionCell(ws: any, r: number, text: string) {
  const cell = ws.getCell(`A${r}`);
  cell.value = text;
  cell.font = { name: FONT, size: 9, italic: true, color: { argb: "FF667788" } };
  cell.alignment = { wrapText: true, vertical: "top" };
}

// Renders the full 8-page workbook; fetches and embeds every available map.
export async function renderBookWorkbook(input: BookInput) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SiteHawk — SkyWave LLC";
  wb.created = new Date();
  const thin = { style: "thin" as const, color: { argb: "FFDDDDDD" } };
  const imageJobs: Array<{ ws: any; row: number; key: string; url: string | null }> = [];

  // ── Tab 1: Property Data (SCIP) ───────────────────────────────────────────
  const ws1 = wb.addWorksheet("1 · Property Data (SCIP)", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws1.getColumn("A").width = COL_A_WIDTH;
  ws1.getColumn("B").width = COL_B_WIDTH;
  let r = 1;
  headerCell(ws1, r, input.title || "SITE CANDIDATE INFORMATION PACKAGE", true, true);
  for (const s of input.sections || []) {
    r += 1;
    headerCell(ws1, r, s.title, false, true);
    for (const row of s.rows || []) {
      r += 1;
      const aCell = ws1.getCell(`A${r}`), bCell = ws1.getCell(`B${r}`);
      aCell.value = `  ${row.label}`;
      aCell.font = { name: FONT, size: 10, bold: true, color: { argb: DARK_TEXT } };
      aCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      aCell.border = { left: thin, right: thin, top: thin, bottom: thin };
      bCell.value = row.value != null ? String(row.value) : "";
      bCell.font = { name: FONT, size: 10, color: { argb: DARK_TEXT } };
      bCell.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
      bCell.border = { left: thin, right: thin, top: thin, bottom: thin };
    }
    if (String(s.title).toUpperCase().startsWith("SEARCH RING")) {
      r += 1;
      headerCell(ws1, r, "SARF MAP", false, true);
      r += 1;
      ws1.getRow(r).height = IMAGE_ROW_PT;
      imageJobs.push({ ws: ws1, row: r, key: "sarf", url: input.sarfUrl || null });
      r += 1;
      captionCell(ws1, r, "Auto-populated by the SiteHawk pipeline");
    }
  }

  // ── Tabs 2–8: paired map exhibits ────────────────────────────────────────
  (input.mapPages || []).forEach((p, i) => {
    const clean = String(p.title || `Page ${i + 2}`).replace(/\s+/g, " ").replace(/[\[\]:*?/\\]/g, "").trim();
    const ws = wb.addWorksheet(`${i + 2} · ${clean.slice(0, 26)}`, {
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.getColumn("A").width = COL_A_WIDTH + COL_B_WIDTH;
    let mr = 1;
    headerCell(ws, mr, clean, true, false);
    for (const slot of p.slots || []) {
      mr += 1;
      headerCell(ws, mr, slot.label, false, false);
      mr += 1;
      ws.getRow(mr).height = IMAGE_ROW_PT;
      imageJobs.push({ ws, row: mr, key: slot.label, url: slot.url || null });
      mr += 1;
      captionCell(ws, mr, slot.caption || "");
    }
  });

  // ── Embed every available image at its slot ──────────────────────────────
  const embedded: string[] = [];
  const missing: string[] = [];
  const markPending = (ws: any, row: number, key: string) => {
    const cell = ws.getCell(`A${row}`);
    cell.value = `[ INSERT ${String(key).toUpperCase()} IMAGE HERE ] — not yet generated by the pipeline`;
    cell.font = { name: FONT, size: 10, italic: true, color: { argb: "FF888888" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  };
  const jobs = imageJobs.map(async ({ ws, row, key, url }) => {
    if (!url || !/^https?:\/\//.test(url)) { missing.push(key); markPending(ws, row, key); return; }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ext = /\.jpe?g($|\?)/i.test(url) ? "jpeg" : "png";
      const imgId = wb.addImage({ buffer: buf, extension: ext });
      const height = 520; // ≈400pt row
      const width = Math.round(height * (4 / 3));
      ws.addImage(imgId, { tl: { col: 0.05, row: row - 0.98 }, ext: { width, height }, editAs: "oneCell" });
      embedded.push(key);
    } catch (_e) {
      missing.push(key);
      markPending(ws, row, key);
    }
  });
  await Promise.allSettled(jobs);

  const out = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { bytes: new Uint8Array(out), embedded, missing };
}