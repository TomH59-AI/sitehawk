// scipBookSheet — builds the live Google Sheets SCIP on the NEW SCIP 8.1.2026
// eight-page template. The workbook (with map images EMBEDDED) is rendered
// server-side, uploaded to the connected Google account via Drive, and
// converted to a native Google Sheet — embedded images survive conversion, so
// the exhibits show immediately (no "allow external data" prompt, which blocks
// API-written =IMAGE() formulas). The sheet is set to anyone-with-link view;
// the live URL and the 8.5"x11" letter PDF export link are persisted on the
// ScipRecord (gsheet field).
//
// INPUT (POST JSON): { scip_id, sections, map_pages }
//   sections / map_pages come from the frontend's scipBookData builders so the
//   Sheet, the in-app SCIP Book, and the xlsx workbook share ONE mapping
//   (including Gemini QC overlay values).
// OUTPUT: { ok, gsheet: { spreadsheet_id, url, pdf_url, synced_at } }
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { renderBookWorkbook } from "../../shared/scipBookWorkbook.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { scip_id, sections, map_pages } = await req.json().catch(() => ({}));
    if (!scip_id || !Array.isArray(sections) || !Array.isArray(map_pages)) {
      return Response.json({ error: "scip_id, sections and map_pages required" }, { status: 400 });
    }
    const record = await base44.entities.ScipRecord.get(String(scip_id));
    if (!record) return Response.json({ error: "ScipRecord not found" }, { status: 404 });
    if (
      record.book_qc?.status !== "PASS"
      || record.book_qc?.release_allowed !== true
      || record.book_qc?.print_ready !== true
    ) {
      return Response.json({ error: "OpenRouter QC PASS is required; Google Sheet/PDF release remains locked" }, { status: 409 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    const H = { Authorization: `Bearer ${accessToken}` };

    // Render the 8-page workbook with the map exhibits embedded.
    const { bytes, embedded, missing } = await renderBookWorkbook({
      sections,
      mapPages: map_pages,
      sarfUrl: record.map_image_url || null,
    });

    // Refresh = replace: drop the previously generated sheet so Drive stays clean.
    const prevId = record.gsheet?.spreadsheet_id;
    if (prevId) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(prevId)}`, {
        method: "DELETE", headers: H,
      }).catch(() => {});
    }

    // Upload the xlsx to Drive WITH conversion to a native Google Sheet.
    const name = `${record.site_name || "SCIP"} — SCIP (NEW SCIP 8.1.2026)`;
    const boundary = "b44scipbook";
    const meta = JSON.stringify({ name, mimeType: "application/vnd.google-apps.spreadsheet" });
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const enc = new TextEncoder();
    const headB = enc.encode(head), tailB = enc.encode(tail);
    const body = new Uint8Array(headB.length + bytes.length + tailB.length);
    body.set(headB, 0); body.set(bytes, headB.length); body.set(tailB, headB.length + bytes.length);

    const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
      method: "POST",
      headers: { ...H, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!up.ok) {
      const detail = await up.text().catch(() => "");
      return Response.json({ error: `Drive upload failed (${up.status}): ${detail.slice(0, 300)}` }, { status: 502 });
    }
    const file = await up.json();
    const spreadsheetId = file.id;

    // Live shareable link — anyone with the link can view.
    await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });

    const gsheet = {
      spreadsheet_id: spreadsheetId,
      url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      pdf_url:
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export` +
        `?format=pdf&size=letter&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false`,
      synced_at: new Date().toISOString(),
    };
    await base44.entities.ScipRecord.update(String(scip_id), { gsheet });

    return Response.json({ ok: true, gsheet, images_embedded: embedded, images_missing: missing });
  } catch (error) {
    console.error("scipBookSheet error:", error?.message || error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}