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
const TEMPLATE_URL = "https://media.base44.com/files/public/69dd277f9504047a559d5834/d44409d24_NEWSCIP_7312026.xlsx";

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

// Uses the builder-uploaded workbook as the single master template, preserving
// its eight sheets, formatting, print areas, and clickable next/back hyperlinks.
export async function renderBookWorkbook(input: BookInput) {
  const template = await fetch(TEMPLATE_URL);
  if (!template.ok) throw new Error(`SCIP template unavailable (${template.status})`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await template.arrayBuffer());
  wb.creator = "SiteHawk — SkyWave LLC";
  wb.modified = new Date();

  const property = wb.getWorksheet("Property Data");
  if (!property) throw new Error("Uploaded SCIP template is missing the Property Data sheet");
  property.pageSetup = { ...property.pageSetup, paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  property.pageMargins = { left: 0.35, right: 0.35, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 };

  const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const labelCells = new Map<string, any[]>();
  property.eachRow((row: any) => row.eachCell((cell: any) => {
    if (typeof cell.value !== "string") return;
    const key = normalize(cell.value);
    if (!key) return;
    labelCells.set(key, [...(labelCells.get(key) || []), cell]);
  }));

  for (const section of input.sections || []) {
    for (const item of section.rows || []) {
      const queue = labelCells.get(normalize(item.label));
      const label = queue?.shift();
      if (!label) continue;
      const target = property.getCell(label.row, label.col + 1);
      target.value = item.value == null ? "" : String(item.value);
      target.alignment = { ...target.alignment, wrapText: true, vertical: "top" };
    }
  }

  const embedded: string[] = [];
  const missing: string[] = [];
  const addImage = async (ws: any, label: string, url: string | null | undefined, rowSpan = 14) => {
    if (!url || !/^https?:\/\//i.test(url)) { missing.push(label); return; }
    let labelCell: any = null;
    ws.eachRow((row: any) => row.eachCell((cell: any) => {
      if (!labelCell && normalize(cell.value) === normalize(label)) labelCell = cell;
    }));
    if (!labelCell) { missing.push(label); return; }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      const extension = contentType.includes("jpeg") || /\.jpe?g($|\?)/i.test(url) ? "jpeg" : "png";
      const imageId = wb.addImage({ buffer: new Uint8Array(await response.arrayBuffer()), extension });
      const startRow = labelCell.row + 1;
      const startCol = Math.max(1, labelCell.col);
      ws.getCell(startRow, startCol).value = null;
      ws.addImage(imageId, { tl: { col: startCol - 1, row: startRow - 1 }, br: { col: 7, row: startRow + rowSpan - 1 }, editAs: "oneCell" });
      embedded.push(label);
    } catch (_error) {
      missing.push(label);
    }
  };

  await addImage(property, "SARF MAP", input.sarfUrl, 22);
  const sheetNames = ["Aerial Topo Map", "FEMA Zoning Map", "FLU Wetlands Map", "Airport Cell Towers Map", "Parcel Wind Map", "2D Viewshed Map", "Fiber Optics Map"];
  for (let index = 0; index < sheetNames.length; index += 1) {
    const ws = wb.getWorksheet(sheetNames[index]);
    if (!ws) throw new Error(`Uploaded SCIP template is missing the ${sheetNames[index]} sheet`);
    ws.pageSetup = { ...ws.pageSetup, paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    ws.pageMargins = { left: 0.35, right: 0.35, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 };
    const slots = input.mapPages?.[index]?.slots || [];
    for (const slot of slots) await addImage(ws, slot.label, slot.url, 14);
  }

  const out = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { bytes: new Uint8Array(out), embedded, missing };
}