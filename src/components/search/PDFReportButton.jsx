import { useState } from "react";
import { Download } from "lucide-react";
import { jsPDF } from "jspdf";

function scoreColor(score) {
  if (score >= 70) return [22, 163, 74];
  if (score >= 40) return [217, 119, 6];
  return [220, 38, 38];
}

function drawScoreBar(doc, x, y, score, color, width = 80) {
  doc.setFillColor(226, 232, 240);
  doc.roundedRect(x, y, width, 4, 2, 2, "F");
  doc.setFillColor(...color);
  doc.roundedRect(x, y, (width * score) / 100, 4, 2, 2, "F");
}

export default function PDFReportButton({ results, extraResults, ordinance, searchCenter, mapImageGetterRef }) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = 612, H = 792;
    const NAVY = [15, 40, 80];
    const LIGHT = [241, 245, 249];
    const BORDER = [203, 213, 225];
    const TEXT = [15, 23, 42];
    const MUTED = [100, 116, 139];
    const margin = 40;
    let y = 0;

    // ── HEADER ──
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 72, "F");
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("SiteHawk", margin + 48, 32);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(180, 200, 230);
    doc.text('"When you need the AI Vision"™', margin, 46);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 180, 220);
    doc.text("A SkyWave AI Product  |  Site Acquisition Intelligence Report", margin, 60);

    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    doc.setTextColor(180, 200, 230);
    doc.setFontSize(8);
    doc.text(`Generated: ${dateStr}`, W - margin, 46, { align: "right" });

    y = 90;

    // ── SCAN SUMMARY ──
    doc.setFillColor(...LIGHT);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(margin, y, W - margin * 2, 56, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text("SCAN SUMMARY", margin + 12, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT);
    const lat = searchCenter?.lat?.toFixed(6) || "—";
    const lon = searchCenter?.lon?.toFixed(6) || "—";
    const jurisdiction = ordinance?.jurisdiction || "N/A";
    const state = ordinance?.state || "";
    const cols = [
      ["Center Coordinates", `${lat}, ${lon}`],
      ["Search Radius", "0.5 miles"],
      ["Jurisdiction", `${jurisdiction}${state ? `, ${state}` : ""}`],
      ["Candidates Found", String((results?.length || 0) + (extraResults?.length || 0))],
    ];
    cols.forEach(([label, val], i) => {
      const cx = margin + 12 + Math.floor(i / 2) * 260;
      const cy = y + 30 + (i % 2) * 14;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MUTED);
      doc.text(label + ":", cx, cy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT);
      doc.text(val, cx + 110, cy);
    });
    y += 70;

    // ── ORDINANCE CARD ──
    if (ordinance) {
      doc.setFillColor(...NAVY);
      doc.roundedRect(margin, y, W - margin * 2, 16, 3, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text("LOCAL ZONING ORDINANCE", margin + 10, y + 11);
      y += 18;

      doc.setFillColor(...LIGHT);
      doc.setDrawColor(...BORDER);
      const ordFields = Object.entries(ordinance).filter(([, v]) => v !== null && v !== undefined && v !== "");
      const ordHeight = Math.ceil(ordFields.length / 2) * 16 + 14;
      doc.roundedRect(margin, y, W - margin * 2, ordHeight, 0, 0, "FD");
      doc.setFontSize(8);
      ordFields.forEach(([k, v], i) => {
        const cx = margin + 10 + Math.floor(i / 2) === margin + 10 ? margin + 10 : margin + 270;
        // two columns
        const colX = i % 2 === 0 ? margin + 10 : margin + 270;
        const rowY = y + 12 + Math.floor(i / 2) * 16;
        const key = k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...MUTED);
        doc.text(key + ":", colX, rowY);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...TEXT);
        const valStr = String(v).substring(0, 45);
        doc.text(valStr, colX + 100, rowY);
      });
      y += ordHeight + 10;
    }

    // ── MAP IMAGE ──
    const mapImageFn = mapImageGetterRef?.current;
    if (mapImageFn) {
      try {
        const imgData = mapImageFn();
        if (imgData) {
          const mapH = 200;
          doc.setFillColor(...NAVY);
          doc.roundedRect(margin, y, W - margin * 2, 16, 3, 3, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(255, 255, 255);
          doc.text("SATELLITE MAP — SEARCH AREA", margin + 10, y + 11);
          y += 18;
          doc.addImage(imgData, "PNG", margin, y, W - margin * 2, mapH);
          y += mapH + 12;
        }
      } catch (e) {
        // skip map if unavailable
      }
    }

    // ── CANDIDATES ──
    const allCandidates = [...(results || []), ...(extraResults || [])];
    if (allCandidates.length > 0) {
      doc.setFillColor(...NAVY);
      doc.roundedRect(margin, y, W - margin * 2, 16, 3, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text("CANDIDATE PARCELS", margin + 10, y + 11);
      y += 22;

      allCandidates.forEach((r, idx) => {
        const cardH = r.match_reason ? 138 : 118;
        if (y + cardH > H - 60) {
          doc.addPage();
          y = margin;
        }
        const score = r.match_score || 0;
        const sc = scoreColor(score);

        // Card background
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(...BORDER);
        doc.roundedRect(margin, y, W - margin * 2, cardH, 4, 4, "FD");

        // Rank badge
        doc.setFillColor(...sc);
        doc.roundedRect(margin + 8, y + 8, 36, 36, 4, 4, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text("CAND.", margin + 14, y + 20);
        doc.setFontSize(16);
        doc.text(String(idx + 1), margin + 18, y + 36);

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...TEXT);
        doc.text(r.site_name || `Candidate ${idx + 1}`, margin + 54, y + 20);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(r.parcel_address || "Address pending", margin + 54, y + 32);

        // Score badge
        const scoreLabel = score >= 70 ? "Excellent" : score >= 40 ? "Good" : "Fair";
        doc.setFillColor(...sc);
        doc.roundedRect(W - margin - 70, y + 8, 62, 20, 3, 3, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(`${score}% ${scoreLabel}`, W - margin - 66, y + 21);

        // Score bar
        drawScoreBar(doc, W - margin - 70, y + 32, score, sc, 62);

        // Fields grid
        const fields = [
          ["Owner", r.owner_name],
          ["Parcel ID", r.parcel_id],
          ["Size", r.parcel_size_acres ? `${r.parcel_size_acres} acres` : null],
          ["Zoning", r.zoning_classification],
          ["Coordinates", `${r.latitude?.toFixed(5)}, ${r.longitude?.toFixed(5)}`],
          ["FEMA Risk", r.fema_risk_factor],
          ["Phone", r.phone],
          ["Email", r.email],
        ];

        doc.setFontSize(7.5);
        const fieldStartY = y + 52;
        fields.forEach(([label, val], fi) => {
          const col = fi % 2;
          const row = Math.floor(fi / 2);
          const fx = margin + 10 + col * 255;
          const fy = fieldStartY + row * 13;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...MUTED);
          doc.text(label + ":", fx, fy);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...TEXT);
          doc.text(String(val || "N/A").substring(0, 36), fx + 52, fy);
        });

        // Mailing address
        if (r.owner_mailing_address) {
          const maY = fieldStartY + Math.ceil(fields.length / 2) * 13;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...MUTED);
          doc.setFontSize(7.5);
          doc.text("Mailing Addr:", margin + 10, maY);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...TEXT);
          doc.text(r.owner_mailing_address.substring(0, 70), margin + 68, maY);
        }

        // Match reason
        if (r.match_reason) {
          const mrY = y + cardH - 20;
          doc.setFillColor(239, 246, 255);
          doc.setDrawColor(191, 219, 254);
          doc.roundedRect(margin + 6, mrY - 8, W - margin * 2 - 12, 22, 3, 3, "FD");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(37, 99, 235);
          doc.text("Why this parcel:", margin + 12, mrY + 4);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...TEXT);
          const reason = r.match_reason.substring(0, 90);
          doc.text(reason, margin + 80, mrY + 4);
        }

        y += cardH + 10;
      });
    }

    // ── FOOTER on last page ──
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFillColor(...NAVY);
      doc.rect(0, H - 36, W, 36, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(160, 185, 220);
      doc.text(
        "This report was generated by SiteHawk — A SkyWave AI Product  |  © 2026 SkyWave LLC. All rights reserved. Patent Pending. Proprietary and confidential.",
        W / 2,
        H - 20,
        { align: "center" }
      );
      doc.text(`Page ${p} of ${pageCount}`, W - margin, H - 20, { align: "right" });
    }

    // ── SAVE ──
    const fileJurisdiction = ordinance?.jurisdiction || "Unknown";
    const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    doc.save(`SiteHawk_Scan_${fileJurisdiction.replace(/\s+/g, "_")}_${dateTag}.pdf`);
    setGenerating(false);
  };

  return (
    <button
      onClick={handleGenerate}
      disabled={generating}
      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0f2850] hover:bg-[#0f2850]/90 text-white font-heading font-semibold text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <Download className="w-4 h-4" />
      {generating ? "Generating PDF..." : "Download PDF Report"}
    </button>
  );
}