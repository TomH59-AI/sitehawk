import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { jsPDF } from "jspdf";

const LOGO_URL = "https://media.base44.com/images/public/69dd277f9504047a559d5834/7dadc5516_logo-skyhawk.png";

// Brand colors
const NAVY      = [12, 27, 46];
const NAVY2     = [18, 40, 70];
const BLUE      = [37, 99, 235];
const CYAN      = [6, 182, 212];
const WHITE     = [255, 255, 255];
const LIGHT     = [241, 245, 249];
const BORDER    = [203, 213, 225];
const TEXT      = [15, 23, 42];
const MUTED     = [100, 116, 139];
const GREEN     = [22, 163, 74];
const AMBER     = [217, 119, 6];
const RED       = [220, 38, 38];
const TEAL_BG   = [240, 253, 250];
const TEAL_BD   = [20, 184, 166];
const TEAL_TXT  = [15, 118, 110];
const BLUE_BG   = [239, 246, 255];
const BLUE_BD   = [191, 219, 254];

function scoreColor(s) {
  if (s >= 70) return GREEN;
  if (s >= 40) return AMBER;
  return RED;
}

function scoreLabel(s) {
  if (s >= 80) return "PRIME";
  if (s >= 70) return "STRONG";
  if (s >= 55) return "GOOD";
  if (s >= 40) return "FAIR";
  return "POOR";
}

function drawBar(doc, x, y, score, color, w = 80) {
  doc.setFillColor(226, 232, 240);
  doc.roundedRect(x, y, w, 5, 2, 2, "F");
  doc.setFillColor(...color);
  doc.roundedRect(x, y, (w * score) / 100, 5, 2, 2, "F");
}

function drawSectionHeader(doc, y, W, margin, label) {
  doc.setFillColor(...NAVY2);
  doc.roundedRect(margin, y, W - margin * 2, 18, 3, 3, "F");
  // accent bar
  doc.setFillColor(...CYAN);
  doc.roundedRect(margin, y, 4, 18, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...CYAN);
  doc.text(label, margin + 12, y + 12);
  return y + 22;
}

function drawLabel(doc, x, y, label, val, maxLen = 38) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(label + ":", x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT);
  doc.text(String(val || "N/A").substring(0, maxLen), x + 58, y);
}

function loadImageAsBase64(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const MAPBOX_TOKEN = "pk.eyJ1IjoidGhvZGdlcyIsImEiOiJjbWlxZzBmbmQwMTA4M2txNGY5OXhyOWppIn0.sjlKabo3VGDU-hKE2Br3bQ";

function buildStaticMapUrl(lat, lon, candidates, width = 800, height = 400, zoom = 14) {
  // Build pin overlays for each candidate (up to 5)
  const pins = candidates.slice(0, 5).map((c, i) => {
    const colors = ["22c55e", "00d4ff", "f59e0b", "f43f5e", "a78bfa"];
    return `pin-s-${i + 1}+${colors[i] || "888"}(${c.longitude},${c.latitude})`;
  });
  // Center crosshair
  const center = `pin-s+ef4444(${lon},${lat})`;
  const overlays = [center, ...pins].join(",");
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${overlays}/${lon},${lat},${zoom},0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`;
}

// Generate a small inset map per candidate
function buildCandidateMapUrl(lat, lon, width = 300, height = 160, zoom = 16) {
  const pin = `pin-s+00d4ff(${lon},${lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${pin}/${lon},${lat},${zoom},0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`;
}

export default function PDFReportButton({ results, extraResults, ordinance, searchCenter, mapImageGetterRef, skipTraceResults = {} }) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);

    // Pre-load logo + maps in parallel
    const allCands = [...(results || []), ...(extraResults || [])];
    const overviewMapUrl = searchCenter
      ? buildStaticMapUrl(searchCenter.lat, searchCenter.lon, allCands, 1060, 500, 14)
      : null;

    const [logoData, overviewMapData, ...candidateMapDatas] = await Promise.all([
      loadImageAsBase64(LOGO_URL),
      overviewMapUrl ? loadImageAsBase64(overviewMapUrl) : Promise.resolve(null),
      ...allCands.slice(0, 8).map(c =>
        loadImageAsBase64(buildCandidateMapUrl(c.latitude, c.longitude, 400, 200, 17))
      ),
    ]);

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = 612, H = 792;
    const margin = 40;
    let y = 0;

    // ──────────────────────────────────────────────────────────
    // PAGE 1 — COVER
    // ──────────────────────────────────────────────────────────

    // Full dark background
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, H, "F");

    // Cyan accent stripe top
    doc.setFillColor(...CYAN);
    doc.rect(0, 0, W, 6, "F");

    // Logo
    if (logoData) {
      doc.addImage(logoData, "PNG", W / 2 - 48, 60, 96, 96);
    }

    // Brand name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(36);
    doc.setTextColor(...WHITE);
    doc.text("SiteHawk", W / 2, 190, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...CYAN);
    doc.text("A SkyWave AI Product", W / 2, 207, { align: "center" });

    // Divider
    doc.setDrawColor(...CYAN);
    doc.setLineWidth(0.5);
    doc.line(margin + 60, 222, W - margin - 60, 222);

    // Report title box
    doc.setFillColor(18, 40, 70);
    doc.roundedRect(margin + 40, 238, W - (margin + 40) * 2, 70, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...WHITE);
    doc.text("SITE ACQUISITION INTELLIGENCE", W / 2, 268, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(...CYAN);
    doc.text("SiteHawk-Pro Site Package  ·  Confidential", W / 2, 285, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(150, 180, 220);
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    doc.text(`Generated: ${dateStr}`, W / 2, 300, { align: "center" });

    // Scan summary box on cover
    doc.setFillColor(18, 40, 70);
    doc.roundedRect(margin + 40, 328, W - (margin + 40) * 2, 110, 6, 6, "F");

    // Cyan left accent
    doc.setFillColor(...CYAN);
    doc.roundedRect(margin + 40, 328, 4, 110, 3, 3, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...CYAN);
    doc.text("SCAN PARAMETERS", margin + 54, 348);

    const lat = searchCenter?.lat?.toFixed(6) || "—";
    const lon = searchCenter?.lon?.toFixed(6) || "—";

    const coverFields = [
      ["Center Latitude", lat],
      ["Center Longitude", lon],
      ["Search Radius", "0.5 miles"],
      ["Candidates Identified", String(allCands.length)],
      ["Jurisdiction", ordinance?.jurisdiction || "See report"],
      ["Report Classification", "Proprietary & Confidential"],
    ];

    coverFields.forEach(([k, v], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = margin + 54 + col * 240;
      const cy = 364 + row * 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(k + ":", cx, cy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...WHITE);
      doc.text(String(v), cx + 110, cy);
    });

    // Candidate score preview
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...CYAN);
    doc.text("CANDIDATE SCORE OVERVIEW", margin + 40, 458);

    allCands.slice(0, 5).forEach((c, i) => {
      const bx = margin + 40 + i * ((W - (margin + 40) * 2) / 5);
      const bw = (W - (margin + 40) * 2) / 5 - 4;
      const by = 466;
      const sc = c.match_score || 0;
      const col = scoreColor(sc);
      doc.setFillColor(18, 40, 70);
      doc.roundedRect(bx, by, bw, 46, 4, 4, "F");
      doc.setFillColor(...col);
      doc.roundedRect(bx, by, bw, 4, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...WHITE);
      doc.text(`${sc}`, bx + bw / 2, by + 26, { align: "center" });
      doc.setFontSize(6.5);
      doc.setTextColor(...col);
      doc.text(scoreLabel(sc), bx + bw / 2, by + 36, { align: "center" });
      doc.setFontSize(6);
      doc.setTextColor(150, 180, 220);
      doc.text(`C${i + 1}`, bx + bw / 2, by + 44, { align: "center" });
    });

    // Disclaimer box
    doc.setFillColor(10, 20, 36);
    doc.roundedRect(margin + 40, 530, W - (margin + 40) * 2, 60, 4, 4, "F");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const disclaimer = "This report is generated by SiteHawk, an AI-powered site acquisition platform by SkyWave LLC. All data is provided for informational purposes only. Parcel data sourced from public records and third-party APIs. Verify all information independently before making acquisition decisions. This document is proprietary and confidential.";
    const lines = doc.splitTextToSize(disclaimer, W - (margin + 40) * 2 - 16);
    doc.text(lines, margin + 48, 548);

    // Cover footer
    doc.setFillColor(...CYAN);
    doc.rect(0, H - 6, W, 6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 130, 170);
    doc.text('"When you need the AI Vision"™  ·  site-hawk-pro.com  ·  © 2026 SkyWave LLC. Patent Pending.', W / 2, H - 14, { align: "center" });

    // ──────────────────────────────────────────────────────────
    // PAGE 2+ — REPORT CONTENT
    // ──────────────────────────────────────────────────────────
    doc.addPage();

    const pageHeader = (pageDoc) => {
      pageDoc.setFillColor(...NAVY);
      pageDoc.rect(0, 0, W, 44, "F");
      pageDoc.setFillColor(...CYAN);
      pageDoc.rect(0, 0, W, 3, "F");
      if (logoData) pageDoc.addImage(logoData, "PNG", margin, 8, 28, 28);
      pageDoc.setFont("helvetica", "bold");
      pageDoc.setFontSize(13);
      pageDoc.setTextColor(...WHITE);
      pageDoc.text("SiteHawk", margin + 34, 21);
      pageDoc.setFont("helvetica", "normal");
      pageDoc.setFontSize(7);
      pageDoc.setTextColor(...CYAN);
      pageDoc.text("Site Acquisition Intelligence Report", margin + 34, 33);
      pageDoc.setFont("helvetica", "normal");
      pageDoc.setFontSize(7);
      pageDoc.setTextColor(150, 180, 220);
      pageDoc.text(`${dateStr}  ·  CONFIDENTIAL`, W - margin, 26, { align: "right" });
    };

    pageHeader(doc);
    y = 56;

    // ── SCAN SUMMARY ──
    y = drawSectionHeader(doc, y, W, margin, "SCAN SUMMARY");

    doc.setFillColor(...LIGHT);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(margin, y, W - margin * 2, 54, 3, 3, "FD");

    const summaryFields = [
      ["Center Coordinates", `${lat}, ${lon}`],
      ["Search Radius", "0.5 miles"],
      ["Jurisdiction", `${ordinance?.jurisdiction || "N/A"}${ordinance?.state ? `, ${ordinance.state}` : ""}`],
      ["Total Candidates", String(allCands.length)],
    ];
    summaryFields.forEach(([k, v], i) => {
      const cx = margin + 12 + Math.floor(i / 2) * 260;
      const cy = y + 18 + (i % 2) * 20;
      drawLabel(doc, cx, cy, k, v);
    });
    y += 64;

    // ── ZONING ORDINANCE ──
    if (ordinance) {
      y = drawSectionHeader(doc, y, W, margin, "LOCAL ZONING ORDINANCE");
      const ordFields = Object.entries(ordinance).filter(([, v]) => v !== null && v !== undefined && v !== "");
      const ordH = Math.ceil(ordFields.length / 2) * 18 + 14;
      doc.setFillColor(...LIGHT);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(margin, y, W - margin * 2, ordH, 3, 3, "FD");
      ordFields.forEach(([k, v], i) => {
        const cx = margin + 12 + (i % 2) * 256;
        const cy = y + 14 + Math.floor(i / 2) * 18;
        drawLabel(doc, cx, cy, k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), String(v).substring(0, 38));
      });
      y += ordH + 10;
    }

    // ── OVERVIEW SATELLITE MAP ──
    if (overviewMapData) {
      y = drawSectionHeader(doc, y, W, margin, "SATELLITE MAP — SEARCH AREA OVERVIEW");
      doc.addImage(overviewMapData, "PNG", margin, y, W - margin * 2, 220);
      y += 232;
    }

    // ── CANDIDATE PARCELS ──
    y = drawSectionHeader(doc, y, W, margin, `CANDIDATE PARCELS (${allCands.length} IDENTIFIED)`);

    allCands.forEach((r, idx) => {
      const skipTrace = skipTraceResults?.[r.id];
      const towers = r.cell_towers || [];
      const fiber = r.fiber_providers || [];
      const hasFiber = r.has_fiber;

      // Estimate card height dynamically
      const hasInsetMap = !!candidateMapDatas[idx];
      const baseH = hasInsetMap ? 170 : 160;
      const towerH = towers.length > 0 ? 14 + towers.length * 12 : 0;
      const fiberH = fiber.length > 0 ? 14 + 12 : 0;
      const stH = skipTrace ? 28 : 0;
      const mrH = r.match_reason ? 22 : 0;
      const cardH = baseH + towerH + fiberH + stH + mrH;

      if (y + cardH > H - 50) {
        doc.addPage();
        pageHeader(doc);
        y = 56;
      }

      const sc = scoreColor(r.match_score || 0);

      // Card shell
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(margin, y, W - margin * 2, cardH, 5, 5, "FD");

      // Score accent stripe on left
      doc.setFillColor(...sc);
      doc.roundedRect(margin, y, 5, cardH, 3, 3, "F");

      // Rank badge
      doc.setFillColor(...sc);
      doc.roundedRect(margin + 12, y + 10, 38, 38, 5, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...WHITE);
      doc.text("SITE", margin + 22, y + 22);
      doc.setFontSize(18);
      doc.text(String(idx + 1), margin + 19, y + 38);

      // Site name + address
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...TEXT);
      doc.text((r.site_name || `Candidate ${idx + 1}`).substring(0, 55), margin + 58, y + 22);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text((r.parcel_address || "Address pending").substring(0, 60), margin + 58, y + 34);

      // Parcel ID badge
      if (r.parcel_id) {
        doc.setFillColor(254, 243, 199);
        doc.setDrawColor(251, 191, 36);
        doc.roundedRect(margin + 58, y + 40, 210, 13, 2, 2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(120, 80, 0);
        doc.text("PARCEL ID:", margin + 62, y + 49);
        doc.setFont("courier", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(30, 30, 30);
        doc.text(String(r.parcel_id).substring(0, 28), margin + 105, y + 49);
      }

      // Score badge top-right
      doc.setFillColor(...sc);
      doc.roundedRect(W - margin - 76, y + 8, 68, 24, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...WHITE);
      doc.text(`${r.match_score || 0}%`, W - margin - 58, y + 24);
      doc.setFontSize(6.5);
      doc.text(scoreLabel(r.match_score || 0), W - margin - 16, y + 24, { align: "right" });

      // Score bar
      drawBar(doc, W - margin - 76, y + 36, r.match_score || 0, sc, 68);

      // ── INSET SATELLITE MAP (top-right of card) ──
      const candidateMapData = candidateMapDatas[idx];
      const mapInsetW = 150, mapInsetH = 80;
      if (candidateMapData) {
        doc.addImage(candidateMapData, "PNG", W - margin - mapInsetW - 4, y + 50, mapInsetW, mapInsetH);
        // small label under inset
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(...MUTED);
        doc.text("Satellite View", W - margin - mapInsetW / 2 - 4, y + 50 + mapInsetH + 7, { align: "center" });
      }

      // ── FIELDS GRID ──
      const fy = y + 58;
      const fields = [
        ["Owner Name", r.owner_name],
        ["Parcel Size", r.parcel_size_acres ? `${r.parcel_size_acres} acres` : null],
        ["Zoning", r.zoning_classification],
        ["GPS Coordinates", `${r.latitude?.toFixed(5)}, ${r.longitude?.toFixed(5)}`],
        ["FEMA Zone (NFHL)", r.fema_risk_factor ? `${r.fema_risk_factor}${r.fema_sfha ? " ⚠ SFHA" : ""}${r.fema_zone_description ? " — " + r.fema_zone_description.substring(0, 30) : ""}` : "N/A"],
        ["Power Utility", r.power_utility],
        ["Nearest Airport", r.airport_iata ? `${r.airport_iata} · ${r.airport_name} · ${r.airport_distance_miles?.toFixed(1)} mi` : null],
        ["Airport Coords", r.airport_lat ? `${r.airport_lat?.toFixed(5)}, ${r.airport_lon?.toFixed(5)}` : null],
        ["Owner Mailing Addr", r.owner_mailing_address],
        ["Direct Phone", r.phone],
        ["Direct Email", r.email],
        ["Fiber Available", hasFiber ? "Yes" : (r.fcc_block_geoid ? "No (FCC verified)" : "Unknown")],
        ["TX Line Distance", r.transmission_line_distance_miles != null ? `${r.transmission_line_distance_miles} mi${r.transmission_line_voltage ? ` · ${r.transmission_line_voltage}` : ""}` : null],
        ["Wind Speed (ASCE 7-22)", r.wind_speed_mph ? `${r.wind_speed_mph} mph${r.in_hurricane_prone_region ? " · Hurricane Prone" : ""}${r.in_special_wind_region ? " · Special Wind Region" : ""}` : "N/A"],
        ["Wetlands (NWI)", r.wetlands_present === true
          ? `YES — ${r.wetland_proximity === "on-site" ? "ON SITE" : "Adjacent"} · ${(r.wetland_types || []).join(", ") || "—"}`
          : r.wetlands_present === false ? "None detected" : "Not checked"],
      ];

      doc.setFontSize(7.5);
      fields.forEach(([label, val], fi) => {
        const col = fi % 2;
        const row = Math.floor(fi / 2);
        const fx = margin + 10 + col * 256;
        const frow_y = fy + row * 14;
        drawLabel(doc, fx, frow_y, label, val, 34);
      });

      let curY = fy + Math.ceil(fields.length / 2) * 14 + 4;

      // ── CELL TOWERS ──
      if (towers.length > 0) {
        doc.setFillColor(...BLUE_BG);
        doc.setDrawColor(...BLUE_BD);
        doc.roundedRect(margin + 6, curY, W - margin * 2 - 12, 12 + towers.length * 12, 3, 3, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(37, 99, 235);
        doc.text("NEAREST CELL TOWERS:", margin + 12, curY + 9);
        towers.forEach((t, ti) => {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...TEXT);
          const line = `${t.operator || "Unknown"} (${t.type || "—"}) · ${t.distance_miles?.toFixed(1) || "?"} mi · ${t.lat?.toFixed(5) || "?"}, ${t.lon?.toFixed(5) || "?"}`;
          doc.text(line.substring(0, 95), margin + 12, curY + 9 + (ti + 1) * 11);
        });
        curY += 12 + towers.length * 12 + 4;
      }

      // ── FIBER ──
      if (fiber.length > 0) {
        doc.setFillColor(240, 253, 244);
        doc.setDrawColor(134, 239, 172);
        doc.roundedRect(margin + 6, curY, W - margin * 2 - 12, 22, 3, 3, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(21, 128, 61);
        doc.text("FIBER BROADBAND:", margin + 12, curY + 9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...TEXT);
        const fiberLine = fiber.map(f => `${f.provider_name} · ${f.max_download_speed}/${f.max_upload_speed} Mbps`).join("  |  ");
        doc.text(fiberLine.substring(0, 95), margin + 12, curY + 19);
        curY += 28;
      }

      // ── SKIP TRACE ──
      if (skipTrace) {
        doc.setFillColor(...TEAL_BG);
        doc.setDrawColor(...TEAL_BD);
        doc.roundedRect(margin + 6, curY, W - margin * 2 - 12, 22, 3, 3, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...TEAL_TXT);
        doc.text("SKIP TRACE CONTACT:", margin + 12, curY + 9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...TEXT);
        const stParts = [];
        if (skipTrace.phone) stParts.push(`Phone: ${skipTrace.phone}`);
        if (skipTrace.email) stParts.push(`Email: ${skipTrace.email}`);
        if (skipTrace.registered_agent) stParts.push(`Agent: ${skipTrace.registered_agent}`);
        if (!stParts.length) stParts.push("No direct contact found — manual lookup required");
        doc.text(stParts.join("  |  ").substring(0, 90), margin + 12, curY + 19);
        curY += 28;
      }

      // ── MATCH REASON ──
      if (r.match_reason) {
        doc.setFillColor(...BLUE_BG);
        doc.setDrawColor(...BLUE_BD);
        doc.roundedRect(margin + 6, curY, W - margin * 2 - 12, 18, 3, 3, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(37, 99, 235);
        doc.text("AI SCORING RATIONALE:", margin + 12, curY + 11);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...TEXT);
        doc.text(r.match_reason.substring(0, 80), margin + 120, curY + 11);
        curY += 22;
      }

      y += cardH + 12;
    });

    // ──────────────────────────────────────────────────────────
    // FOOTER on every page
    // ──────────────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFillColor(...NAVY);
      doc.rect(0, H - 32, W, 32, "F");
      doc.setFillColor(...CYAN);
      doc.rect(0, H - 3, W, 3, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 130, 170);
      doc.text(
        'SiteHawk-Pro Site Package  ·  "When you need the AI Vision"™  ·  A SkyWave AI Product  ·  © 2026 SkyWave LLC. All rights reserved. Patent Pending. Proprietary & Confidential.',
        W / 2, H - 18, { align: "center" }
      );
      doc.text(`Page ${p} of ${pageCount}`, W - margin, H - 18, { align: "right" });
    }

    // ── SAVE ──
    const jur = ordinance?.jurisdiction || "Site";
    const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    doc.save(`SiteHawk_Pro_Package_${jur.replace(/\s+/g, "_")}_${dateTag}.pdf`);
    setGenerating(false);
  };

  return (
    <button
      onClick={handleGenerate}
      disabled={generating}
      className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl text-white font-heading font-bold text-sm shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: generating ? "#0f2850" : "linear-gradient(135deg, #0f2850 0%, #1e3a6e 100%)",
        border: "1px solid #2563eb44",
      }}
    >
      <FileText className="w-4 h-4" />
      {generating ? "Generating Site Package..." : "Download SiteHawk-Pro Site Package"}
    </button>
  );
}