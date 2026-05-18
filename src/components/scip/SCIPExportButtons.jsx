import { useState } from "react";
import { FileText, FileSpreadsheet } from "lucide-react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { SCIP_SECTION_ORDER } from "@/lib/scipFields";

const NAVY = [12, 27, 46];
const CYAN = [6, 182, 212];
const WHITE = [255, 255, 255];
const TEXT = [15, 23, 42];
const MUTED = [100, 116, 139];
const LIGHT_BG = [248, 250, 252];

function exportPDF(scipData, candidate) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = 612, H = 792;
  const margin = 40;
  let y = 40;

  // Header
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, "F");
  doc.setFillColor(...CYAN);
  doc.rect(0, 30, W, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text("SITE CANDIDATE INFORMATION PACKAGE", margin, 20);
  y = 56;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text(candidate?.site_name || "Candidate Site", margin, y);
  y += 18;

  SCIP_SECTION_ORDER.forEach((key) => {
    const section = scipData[key];
    if (!section) return;

    // Section header
    if (y > H - 80) { doc.addPage(); y = 40; }
    doc.setFillColor(...NAVY);
    doc.rect(margin, y, W - margin * 2, 16, "F");
    doc.setFillColor(...CYAN);
    doc.rect(margin, y, 3, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...CYAN);
    doc.text(section.title, margin + 10, y + 11);
    y += 20;

    // Fields
    section.fields.forEach(([label, value]) => {
      if (y > H - 50) { doc.addPage(); y = 40; }
      doc.setFillColor(...LIGHT_BG);
      doc.rect(margin, y, W - margin * 2, 16, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(String(label), margin + 6, y + 11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT);
      const valStr = String(value || "—");
      const lines = doc.splitTextToSize(valStr, 320);
      doc.text(lines.slice(0, 1), margin + 240, y + 11);
      y += 16;
    });
    y += 6;
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(`SiteHawk-Pro SCIP  ·  Confidential  ·  Page ${p} of ${pageCount}`, W / 2, H - 18, { align: "center" });
  }

  const tag = (candidate?.site_name || "Site").replace(/\s+/g, "_");
  doc.save(`SCIP_${tag}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportExcel(scipData, candidate) {
  const rows = [];
  rows.push(["SITE CANDIDATE INFORMATION PACKAGE", ""]);
  rows.push([candidate?.site_name || "Candidate Site", ""]);
  rows.push(["", ""]);

  SCIP_SECTION_ORDER.forEach((key) => {
    const section = scipData[key];
    if (!section) return;
    rows.push([section.title, ""]);
    section.fields.forEach(([label, value]) => {
      rows.push([`  ${label}`, value || ""]);
    });
    rows.push(["", ""]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 42 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidate");

  const tag = (candidate?.site_name || "Site").replace(/\s+/g, "_");
  XLSX.writeFile(wb, `SCIP_${tag}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function SCIPExportButtons({ scipData, candidate }) {
  const [busy, setBusy] = useState(null);

  const handlePDF = async () => {
    setBusy("pdf");
    try { exportPDF(scipData, candidate); } finally { setBusy(null); }
  };
  const handleExcel = async () => {
    setBusy("xlsx");
    try { exportExcel(scipData, candidate); } finally { setBusy(null); }
  };

  return (
    <div className="flex gap-3">
      <button
        onClick={handlePDF}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0C1B2E] hover:bg-[#102544] text-white font-bold text-sm transition-all disabled:opacity-60 shadow-md"
      >
        <FileText className="w-4 h-4" />
        {busy === "pdf" ? "Generating PDF..." : "Print PDF"}
      </button>
      <button
        onClick={handleExcel}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all disabled:opacity-60 shadow-md"
      >
        <FileSpreadsheet className="w-4 h-4" />
        {busy === "xlsx" ? "Generating Excel..." : "Export Excel"}
      </button>
    </div>
  );
}