const DISCLAIMER = "Concept sketch only — not a boundary survey or stamped engineering drawing. Zoning values are reproduced from the cited SiteHawk source and must be verified with the governing jurisdiction before reliance.";

function cleanFileName(value) {
  return String(value || "site").trim().replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "site";
}

function labelize(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function reportRows(node, path = [], rows = []) {
  if (!node || typeof node !== "object") return rows;
  if (Object.prototype.hasOwnProperty.call(node, "value")) {
    rows.push({
      label: path.map(labelize).join(" — "),
      value: node.value || "No data available",
      source: node.source || "SCIP zoning report",
      confidence: node.confidence || "",
    });
    return rows;
  }
  Object.entries(node).forEach(([key, value]) => reportRows(value, [...path, key], rows));
  return rows;
}

function zoningRows(record, zoningData) {
  if (!zoningData || !Object.keys(zoningData).length) {
    const rows = reportRows(record?.zoning_report || {});
    return rows.length ? rows : [{ label: "Zoning Data", value: "No data available", source: "SCIP zoning report", confidence: "" }];
  }
  const registry = zoningData.registry || {};
  const source = registry.section_ref
    ? `SiteHawk ordinance library · ${registry.section_ref}`
    : "Section 2 zoning result";
  return [
    ["Jurisdiction", zoningData.jurisdiction],
    ["Zoning District", zoningData.district],
    ["Maximum Tower Height", zoningData.max_height],
    ["Setback / Separation", zoningData.setback || zoningData.residential_separation],
    ["Fall Zone", zoningData.fall_zone],
    ["PE Relief", zoningData.pe_letter || zoningData.pe_self_certification],
    ["Permit Type", zoningData.permit_type],
    ["Ordinance Section", registry.section_ref],
  ].map(([label, value]) => ({ label, value: value || "No data available", source, confidence: "" }));
}

async function svgPng(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "1044");
  clone.setAttribute("height", "620");
  clone.classList.add("ls-noanim");
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 2088;
    canvas.height = 1240;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function addFooter(pdf, pageWidth, pageHeight) {
  pdf.setDrawColor(210, 220, 230);
  pdf.line(36, pageHeight - 44, pageWidth - 36, pageHeight - 44);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(90, 105, 120);
  pdf.text(pdf.splitTextToSize(DISCLAIMER, pageWidth - 72), 36, pageHeight - 31);
}

export async function downloadLiveSketchPdf({ svg, record, zoningData, heightFt, sourceNote, preparedBy }) {
  if (!svg) throw new Error("The site sketch is not available.");
  const [{ default: jsPDF }, drawing] = await Promise.all([import("jspdf"), svgPng(svg)]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const target = record?.parcel_targets?.[record?.active_target_index || 0] || {};
  const lat = Number(target.latitude ?? record?.latitude);
  const lng = Number(target.longitude ?? record?.longitude);

  pdf.setTextColor(15, 42, 67);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("SiteHawk Live Site Sketch", 36, 34);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${record?.site_name || "Tower Site"} · ${target.label || "Target A"}`, 36, 51);
  pdf.addImage(drawing, "PNG", 36, 66, pageWidth - 72, 428);

  const details = [
    `Tower height: ${heightFt} ft AGL`,
    Number.isFinite(lat) && Number.isFinite(lng) ? `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}` : "Coordinates: No data available",
    `Prepared by: ${preparedBy?.full_name || "Current SiteHawk subscriber"}${preparedBy?.email ? ` · ${preparedBy.email}` : ""}${preparedBy?.phone ? ` · ${preparedBy.phone}` : ""}`,
  ];
  pdf.setFontSize(9);
  pdf.setTextColor(35, 50, 65);
  pdf.text(details, 36, 512);
  pdf.setFontSize(7.5);
  pdf.setTextColor(90, 105, 120);
  pdf.text(pdf.splitTextToSize(sourceNote || "No parcel geometry source note available.", pageWidth - 72), 36, 554);
  addFooter(pdf, pageWidth, pageHeight);

  pdf.addPage("letter", "landscape");
  pdf.setTextColor(15, 42, 67);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Zoning Data Used for Review", 36, 38);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(90, 105, 120);
  pdf.text("Values below are reproduced exactly as returned; missing values are not estimated.", 36, 54);

  let y = 76;
  for (const row of zoningRows(record, zoningData)) {
    const valueLines = pdf.splitTextToSize(String(row.value), pageWidth - 240);
    const sourceText = `Source: ${row.source}${row.confidence ? ` · Confidence: ${row.confidence}` : ""}`;
    const rowHeight = Math.max(42, valueLines.length * 11 + 25);
    if (y + rowHeight > pageHeight - 58) {
      addFooter(pdf, pageWidth, pageHeight);
      pdf.addPage("letter", "landscape");
      y = 40;
    }
    pdf.setDrawColor(220, 228, 236);
    pdf.roundedRect(36, y, pageWidth - 72, rowHeight - 6, 4, 4);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(15, 42, 67);
    pdf.text(row.label, 48, y + 16);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(35, 50, 65);
    pdf.text(valueLines, 198, y + 16);
    pdf.setFontSize(7.5);
    pdf.setTextColor(90, 105, 120);
    pdf.text(sourceText, 198, y + rowHeight - 14);
    y += rowHeight;
  }
  addFooter(pdf, pageWidth, pageHeight);
  pdf.save(`SiteHawk_Live_SiteSketch_${cleanFileName(record?.site_name)}.pdf`);
}