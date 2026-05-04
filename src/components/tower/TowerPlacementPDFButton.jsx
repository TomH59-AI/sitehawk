import { useState } from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TOWER_LABELS = { self_support: "Self-Support Tower (SST)", monopole: "Monopole", guyed: "Guyed Tower" };

function fmtFt(v) { return v != null ? `${Math.round(v)} ft` : "—"; }
function fmtAc(v) { return v != null ? `${v.toFixed(2)} ac` : "—"; }

async function svgToPngDataUrl(svgElement, scale = 2) {
  const xml = new XMLSerializer().serializeToString(svgElement);
  const svg64 = btoa(unescape(encodeURIComponent(xml)));
  const url = `data:image/svg+xml;base64,${svg64}`;
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  const w = svgElement.viewBox.baseVal.width || svgElement.clientWidth || 700;
  const h = svgElement.viewBox.baseVal.height || svgElement.clientHeight || 500;
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export default function TowerPlacementPDFButton({ analysis, parcel, svgRef }) {
  const [generating, setGenerating] = useState(false);

  if (!analysis?.ok) return null;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      const preparedBy = me?.full_name || me?.email || "SiteHawk User";
      const reportRef = `SH-${(parcel.parcel_id || "PARCEL").toString().slice(0, 12)}-${new Date().getFullYear()}`;

      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 50;
      let y = margin;

      doc.setFillColor(26, 58, 42);
      doc.rect(0, 0, pageW, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(26, 58, 42);
      doc.text("SiteHawk Vision", margin, y + 16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(74, 106, 90);
      doc.text("Telecom Site Acquisition & Engineering Analysis", margin, y + 30);
      doc.setFontSize(8);
      doc.setTextColor(85, 85, 85);
      const todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      doc.text(`Document Date: ${todayStr}`, pageW - margin, y + 16, { align: "right" });
      doc.text(`Reference: ${reportRef}`, pageW - margin, y + 28, { align: "right" });
      doc.text(`Prepared By: ${preparedBy}`, pageW - margin, y + 40, { align: "right" });
      doc.setDrawColor(26, 58, 42);
      doc.setLineWidth(1.5);
      doc.line(margin, y + 50, pageW - margin, y + 50);
      y += 70;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(26, 58, 42);
      doc.text("Tower Placement Analysis & Site Plan", margin, y);
      y += 18;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("Professional Site Assessment — Fall Zone, Setback & Compliance Study", margin, y);
      y += 24;

      y = drawSectionHeader(doc, "1. Site Identification", y, margin, pageW);
      const siteRows = [
        ["Site Name", parcel.site_name || "—"],
        ["Site Owner", parcel.owner_name || "—"],
        ["Parcel Address", parcel.parcel_address || "—"],
        ["Parcel ID", parcel.parcel_id || "—"],
        ["Owner Mailing Address", parcel.owner_mailing_address || "—"],
        ["GPS Coordinates (Parcel Ref.)", `${parcel.latitude?.toFixed(6)}°N, ${parcel.longitude?.toFixed(6)}°W`],
        ["Parcel Size", parcel.parcel_size_acres ? `${parcel.parcel_size_acres} ac (${Math.round(parcel.parcel_size_acres * 43560).toLocaleString()} sf)` : "—"],
        ["Parcel Dimensions (approx.)", `${Math.round(analysis.parcelDims.widthFt)} ft (E-W) × ${Math.round(analysis.parcelDims.depthFt)} ft (N-S)`],
        ["Zoning Classification", parcel.zoning_classification || "—"],
        ["FEMA Risk", `${parcel.fema_risk_factor || "N/A"}${parcel.fema_sfha ? " · SFHA" : ""}${parcel.fema_risk_level ? ` · ${parcel.fema_risk_level}` : ""}`],
        ["Wetlands (NWI)", parcel.wetlands_present === true ? `Present · ${parcel.wetland_proximity || ""}` : parcel.wetlands_present === false ? "None detected" : "Unknown"],
        ["Wind Speed (ASCE 7-22)", parcel.wind_speed_mph ? `${parcel.wind_speed_mph} mph${parcel.wind_mri ? ` · ${parcel.wind_mri}` : ""}` : "—"],
        ["Proposed Tower Type", `${analysis.towerHeightFt} ft ${TOWER_LABELS[analysis.towerType] || analysis.towerType}`],
        ["Compound Lease Area", `${analysis.compoundSizeFt} ft × ${analysis.compoundSizeFt} ft (${(analysis.compoundSizeFt ** 2).toLocaleString()} sf) — centered on tower base`],
      ];
      y = drawTable(doc, siteRows, y, margin, pageW);

      if (y > pageH - 200) { doc.addPage(); y = margin; }
      y = drawSectionHeader(doc, "2. Setback & Fall Zone Calculations", y, margin, pageW);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      const intro = `The applicable standard for a ${analysis.towerHeightFt}-ft ${TOWER_LABELS[analysis.towerType]} is a fall zone setback equal to ${(analysis.fallZonePct * 100).toFixed(0)}% of the tower height (${analysis.setbackFt} ft) measured from the tower centerline to each property line. Verify against local zoning ordinance for jurisdiction-specific requirements.`;
      const introLines = doc.splitTextToSize(intro, pageW - 2 * margin);
      doc.text(introLines, margin, y);
      y += introLines.length * 11 + 8;

      const setbackRows = [
        ["Tower Height", `${analysis.towerHeightFt} ft above grade`],
        ["Fall Zone / Setback Required", `${analysis.setbackFt} ft (${(analysis.fallZonePct * 100).toFixed(0)}% of height) from each property line`],
        ["Valid Tower Zone — E-W", `${Math.round(analysis.validZone.zone.widthFt)} ft (parcel width minus 2× setback)`],
        ["Valid Tower Zone — N-S", `${Math.round(analysis.validZone.zone.depthFt)} ft (parcel depth minus 2× setback)`],
      ];
      y = drawTable(doc, setbackRows, y, margin, pageW);

      if (svgRef?.current) {
        if (y > pageH - 350) { doc.addPage(); y = margin; }
        y = drawSectionHeader(doc, "3. Recommended Tower Placement — Site Plan", y, margin, pageW);
        try {
          const dataUrl = await svgToPngDataUrl(svgRef.current, 2);
          const imgW = pageW - 2 * margin;
          const svgVB = svgRef.current.viewBox.baseVal;
          const aspect = svgVB.height / svgVB.width;
          const imgH = imgW * aspect;
          if (y + imgH > pageH - margin) { doc.addPage(); y = margin; }
          doc.addImage(dataUrl, "PNG", margin, y, imgW, imgH);
          y += imgH + 12;
        } catch (e) {
          doc.setFontSize(9);
          doc.setTextColor(150, 0, 0);
          doc.text("Site plan diagram unavailable.", margin, y);
          y += 14;
        }
      }

      if (y > pageH - 200) { doc.addPage(); y = margin; }
      y = drawSectionHeader(doc, "4. Recommended Placement — Coordinates & Clearances", y, margin, pageW);
      const coordRows = [
        ["Tower Base Latitude", `${analysis.placement.lat.toFixed(6)}° N (±5 m field-survey required)`],
        ["Tower Base Longitude", `${Math.abs(analysis.placement.lon).toFixed(6)}° W (±5 m field-survey required)`],
        ["Datum", "WGS84 / NAD83"],
        ["Quadrant", analysis.placement.cornerLabel],
        ["AGL Tower Height", `${analysis.towerHeightFt} ft (above finished grade)`],
        ["Distance to N Property Line", `${Math.round(analysis.distances.north_ft)} ft — ${analysis.compliance.north ? "MEETS ✓" : "FAILS ✗"} ${analysis.setbackFt} ft fall zone`],
        ["Distance to S Property Line", `${Math.round(analysis.distances.south_ft)} ft — ${analysis.compliance.south ? "MEETS ✓" : "FAILS ✗"} ${analysis.setbackFt} ft fall zone`],
        ["Distance to E Property Line", `${Math.round(analysis.distances.east_ft)} ft — ${analysis.compliance.east ? "MEETS ✓" : "FAILS ✗"} ${analysis.setbackFt} ft fall zone`],
        ["Distance to W Property Line", `${Math.round(analysis.distances.west_ft)} ft — ${analysis.compliance.west ? "MEETS ✓" : "FAILS ✗"} ${analysis.setbackFt} ft fall zone`],
        ["Compound N Edge → N Property Line", fmtFt(analysis.compoundEdges.north_ft)],
        ["Compound S Edge → S Property Line", fmtFt(analysis.compoundEdges.south_ft)],
        ["Compound E Edge → E Property Line", fmtFt(analysis.compoundEdges.east_ft)],
        ["Compound W Edge → W Property Line", fmtFt(analysis.compoundEdges.west_ft)],
        ["Access Easement", `12 ft × ${Math.round(analysis.accessEasement.lengthFt)} ft (${Math.round(analysis.accessEasement.areaSf)} sf) from ${analysis.accessPreference} property line`],
      ];
      y = drawTable(doc, coordRows, y, margin, pageW);

      if (y > pageH - 150) { doc.addPage(); y = margin; }
      y = drawSectionHeader(doc, "5. Encumbrance Summary", y, margin, pageW);
      const encRows = [
        ["Total Parcel Area", `${fmtAc(analysis.areas.totalAcres)} (${Math.round((analysis.areas.totalAcres || 0) * 43560).toLocaleString()} sf)`],
        ["Compound Lease Area", `${fmtAc(analysis.areas.compoundAcres)} (${(analysis.compoundSizeFt ** 2).toLocaleString()} sf)`],
        ["Access Easement Area", `${Math.round(analysis.accessEasement.areaSf)} sf (${analysis.accessEasement.widthFt} ft × ${Math.round(analysis.accessEasement.lengthFt)} ft)`],
        ["Owner Retained Area", `${fmtAc(analysis.areas.ownerRetainedAcres)} — ${analysis.areas.ownerRetainedPct.toFixed(1)}% of total parcel unencumbered`],
      ];
      y = drawTable(doc, encRows, y, margin, pageW);

      if (y > pageH - 200) { doc.addPage(); y = margin; }
      y = drawSectionHeader(doc, "6. Permit Pathway & Engineering Notes", y, margin, pageW);
      const permitItems = [
        "Submit zoning application (CUP / SUP / Administrative Permit per local ordinance)",
        analysis.towerHeightFt >= 200 ? "FAA Form 7460-1 + FCC ASR registration required (≥ 200 ft)" : analysis.towerHeightFt >= 120 ? "FAA Form 7460-1 Notice of Proposed Construction required (≥ 120 ft)" : "Verify FAA filing requirements based on proximity to airports",
        "RF propagation justification / search-ring documentation",
        "Collocation certification: new tower must accommodate minimum 2 additional carriers",
        "Structural drawings stamped by licensed PE in jurisdiction",
        "Geotechnical / soil boring report for foundation design",
        ...(parcel.fema_sfha ? ["FEMA SFHA: full FIRM panel review and CLOMA/CLOMR may be required"] : []),
        ...(parcel.wetlands_present === true ? ["USFWS NWI wetlands flagged — field delineation and Section 404 permit assessment required"] : []),
        "Landscape plan: 6-ft chain-link fence with 3-strand barbed wire, Type B (or local equivalent) buffer",
        "Title search / survey confirming no encumbrances within setback zones",
      ];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      permitItems.forEach((item) => {
        const lines = doc.splitTextToSize(`• ${item}`, pageW - 2 * margin - 10);
        if (y + lines.length * 11 > pageH - margin - 30) { doc.addPage(); y = margin; }
        doc.text(lines, margin + 8, y);
        y += lines.length * 11 + 3;
      });

      if (analysis.warnings.length > 0) {
        if (y > pageH - 100) { doc.addPage(); y = margin; }
        y += 6;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(180, 80, 0);
        doc.text("⚠ Engineering & Site-Specific Notes", margin, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        analysis.warnings.forEach((w) => {
          const lines = doc.splitTextToSize(`• ${w}`, pageW - 2 * margin - 10);
          if (y + lines.length * 11 > pageH - margin - 30) { doc.addPage(); y = margin; }
          doc.text(lines, margin + 8, y);
          y += lines.length * 11 + 3;
        });
      }

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        const disc = "This analysis is a desktop study based on parcel data and the specifications provided. Final tower placement, fall zone, and permitting requirements must be verified by a licensed Professional Engineer and confirmed by field survey. SiteHawk Vision is not a substitute for licensed engineering or legal review.";
        const dlines = doc.splitTextToSize(disc, pageW - 2 * margin);
        doc.text(dlines, margin, pageH - 30);
        doc.text(`Page ${i} of ${pageCount} · ${reportRef}`, pageW - margin, pageH - 12, { align: "right" });
      }

      doc.save(`Tower_Placement_${(parcel.site_name || "Parcel").replace(/[^a-z0-9]/gi, "_")}_${reportRef}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button onClick={handleGenerate} disabled={generating} className="gap-2">
      <Download className="w-4 h-4" />
      {generating ? "Generating PDF..." : "Download Tower Placement PDF"}
    </Button>
  );
}

function drawSectionHeader(doc, title, y, margin, pageW) {
  doc.setFillColor(26, 58, 42);
  doc.rect(margin, y - 2, 4, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(26, 58, 42);
  doc.text(title, margin + 10, y + 9);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(margin, y + 16, pageW - margin, y + 16);
  return y + 26;
}

function drawTable(doc, rows, y, margin, pageW) {
  const labelW = 200;
  const valueW = pageW - 2 * margin - labelW;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  rows.forEach((row, idx) => {
    const [label, value] = row;
    const lines = doc.splitTextToSize(value || "—", valueW - 8);
    const rowH = Math.max(16, lines.length * 11 + 4);
    if (y + rowH > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 50;
    }
    if (idx % 2 === 0) {
      doc.setFillColor(248, 248, 245);
      doc.rect(margin, y - 2, pageW - 2 * margin, rowH, "F");
    }
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin + 4, y + 9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 20, 20);
    doc.text(lines, margin + labelW + 4, y + 9);
    y += rowH;
  });
  return y + 8;
}