// TalonFit® Site Exhibit — a to-scale PDF drawing auto-drafted after each
// TalonFit run. Draws (north-up, true scale): property boundary, setback /
// buildable envelope, equipment compound, fall zone, tower location, proposed
// access easement, scale bar, north arrow, legend and the verdict banner.
import * as turf from "@turf/turf";
import { jsPDF } from "jspdf";

const FT_PER_DEG_LAT = 364320;

const VERDICT_COLOR = {
  "FITS": [5, 122, 85],
  "CONDITIONAL": [180, 121, 9],
  "DOES NOT FIT": [185, 28, 28],
};

function ringsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function drawPoly(doc, pts, { stroke, fill, dash = null, width = 1, fillOpacity = 0.12 }) {
  if (!pts || pts.length < 3) return;
  const segs = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  if (fill) {
    doc.setGState(new doc.GState({ opacity: fillOpacity }));
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.lines(segs, pts[0][0], pts[0][1], [1, 1], "F", true);
    doc.setGState(new doc.GState({ opacity: 1 }));
  }
  if (stroke) {
    doc.setDrawColor(stroke[0], stroke[1], stroke[2]);
    doc.setLineWidth(width);
    doc.setLineDashPattern(dash || [], 0);
    doc.lines(segs, pts[0][0], pts[0][1], [1, 1], "S", true);
    doc.setLineDashPattern([], 0);
  }
}

export function downloadTalonFitExhibit({
  parcelGeometry = null, envelopeGeometry = null, compoundGeometry = null,
  fallZoneGeometry = null, towerLngLat, setbackFt = 0,
  verdict = "CONDITIONAL", meta = {},
}) {
  // ---- derived geometry ----
  let envelope = envelopeGeometry;
  if (!envelope && parcelGeometry && setbackFt > 0) {
    try {
      envelope = turf.buffer({ type: "Feature", properties: {}, geometry: parcelGeometry },
        -setbackFt * 0.0003048, { units: "kilometers" })?.geometry || null;
    } catch { envelope = null; }
  }
  // Proposed access easement — from the compound toward the nearest boundary point.
  let easementEnd = null;
  if (parcelGeometry && towerLngLat) {
    try {
      const lines = turf.polygonToLine({ type: "Feature", properties: {}, geometry: parcelGeometry });
      let bestKm = Infinity;
      turf.flattenEach(lines, (l) => {
        const np = turf.nearestPointOnLine(l, turf.point(towerLngLat), { units: "kilometers" });
        if (np.properties.dist < bestKm) { bestKm = np.properties.dist; easementEnd = np.geometry.coordinates; }
      });
    } catch { easementEnd = null; }
  }

  // ---- local-feet projection (north-up, true scale) ----
  const coords = [];
  for (const g of [parcelGeometry, envelope, fallZoneGeometry, compoundGeometry]) {
    for (const r of ringsOf(g)) coords.push(...r);
  }
  if (towerLngLat) coords.push(towerLngLat);
  if (easementEnd) coords.push(easementEnd);
  if (!coords.length) return;
  const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  const toFt = ([lon, lat]) => [(lon - lon0) * FT_PER_DEG_LAT * cosLat, (lat - lat0) * FT_PER_DEG_LAT];
  const ftAll = coords.map(toFt);
  const xs = ftAll.map((p) => p[0]), ys = ftAll.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

  // ---- page (letter landscape, points) ----
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = 792, M = 28;
  const box = { x: M, y: 110, w: 516, h: 428 };
  const pad = 26;
  const scale = Math.min((box.w - pad * 2) / spanX, (box.h - pad * 2) / spanY);
  const toPt = (lngLat) => {
    const [fx, fy] = toFt(lngLat);
    return [box.x + box.w / 2 + (fx - cx) * scale, box.y + box.h / 2 - (fy - cy) * scale];
  };
  const ptsOf = (g) => ringsOf(g).map((r) => r.map(toPt));

  // ---- header ----
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(15, 23, 42);
  doc.text("TALONFIT® SITE EXHIBIT", M, 46);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90, 100, 115);
  doc.text(String(meta.siteLabel || "Tower Site").slice(0, 90), M, 60);
  doc.text(`Drafted ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC${meta.runId ? `  ·  TalonFit Run ${String(meta.runId).slice(0, 8).toUpperCase()}` : ""}`, W - M, 46, { align: "right" });
  doc.text("Automated to-scale preliminary drawing", W - M, 60, { align: "right" });

  // ---- verdict banner ----
  const vc = VERDICT_COLOR[verdict] || VERDICT_COLOR.CONDITIONAL;
  doc.setFillColor(vc[0], vc[1], vc[2]);
  doc.rect(M, 72, W - 2 * M, 24, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
  doc.text(`TALONFIT VERDICT: ${verdict}`, W / 2, 88, { align: "center" });

  // ---- drawing frame ----
  doc.setDrawColor(30, 41, 59); doc.setLineWidth(1);
  doc.rect(box.x, box.y, box.w, box.h, "S");

  // ---- layers (back to front) ----
  for (const pts of ptsOf(parcelGeometry)) drawPoly(doc, pts, { stroke: [30, 41, 59], fill: [148, 163, 184], width: 1.8, fillOpacity: 0.08 });
  for (const pts of ptsOf(envelope)) drawPoly(doc, pts, { stroke: [5, 150, 105], fill: [5, 150, 105], dash: [4, 3], width: 1.1, fillOpacity: 0.10 });
  for (const pts of ptsOf(fallZoneGeometry)) drawPoly(doc, pts, { stroke: [220, 38, 38], fill: [220, 38, 38], dash: [3, 3], width: 1.1, fillOpacity: 0.07 });

  // access easement — 20 ft corridor, two dashed parallels
  if (easementEnd && towerLngLat) {
    const a = toPt(towerLngLat), b = toPt(easementEnd);
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len > 6) {
      const ux = dx / len, uy = dy / len;
      const startOff = Math.min((Math.max(meta.compoundW || 0, meta.compoundD || 0) / 2) * scale, len * 0.6);
      const sx = a[0] + ux * startOff, sy = a[1] + uy * startOff;
      const off = 10 * scale, px = -uy, py = ux;
      doc.setDrawColor(120, 85, 40); doc.setLineWidth(1); doc.setLineDashPattern([5, 3], 0);
      doc.line(sx + px * off, sy + py * off, b[0] + px * off, b[1] + py * off);
      doc.line(sx - px * off, sy - py * off, b[0] - px * off, b[1] - py * off);
      doc.setLineDashPattern([], 0);
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(120, 85, 40);
      doc.text("PROPOSED 20 FT ACCESS ESM'T", (sx + b[0]) / 2, (sy + b[1]) / 2 - 4 - off,
        { align: "center", angle: -Math.atan2(dy, dx) * 180 / Math.PI });
    }
  }

  for (const pts of ptsOf(compoundGeometry)) drawPoly(doc, pts, { stroke: [234, 88, 12], fill: [234, 88, 12], width: 1.3, fillOpacity: 0.3 });

  // tower point
  if (towerLngLat) {
    const [tx, ty] = toPt(towerLngLat);
    doc.setFillColor(8, 145, 178); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.8);
    doc.circle(tx, ty, 3.4, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(8, 145, 178);
    doc.text("TOWER", tx, ty - 6, { align: "center" });
  }

  // ---- north arrow (inside frame, top-right) ----
  const nx = box.x + box.w - 22, ny = box.y + 26;
  doc.setFillColor(30, 41, 59); doc.setDrawColor(30, 41, 59); doc.setLineWidth(1);
  doc.triangle(nx, ny - 12, nx - 5, ny + 3, nx + 5, ny + 3, "F");
  doc.line(nx, ny + 3, nx, ny + 11);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(30, 41, 59);
  doc.text("N", nx, ny + 21, { align: "center" });

  // ---- scale bar (inside frame, bottom-left) ----
  const nice = [2000, 1000, 500, 400, 300, 200, 150, 100, 50, 25, 20, 10].find((n) => n * scale <= 140) || 10;
  const barLen = nice * scale;
  const bx = box.x + 14, by = box.y + box.h - 16;
  doc.setDrawColor(30, 41, 59); doc.setLineWidth(1.2);
  doc.line(bx, by, bx + barLen, by);
  doc.line(bx, by - 3, bx, by + 3);
  doc.line(bx + barLen / 2, by - 2, bx + barLen / 2, by + 2);
  doc.line(bx + barLen, by - 3, bx + barLen, by + 3);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(30, 41, 59);
  doc.text("0", bx, by - 5, { align: "center" });
  doc.text(`${nice} FT`, bx + barLen, by - 5, { align: "center" });
  doc.text(`SCALE: 1 IN = ${Math.round(72 / scale)} FT`, bx + barLen + 14, by + 2);

  // ---- right panel: site data + legend ----
  const px0 = box.x + box.w + 14;
  let yy = box.y + 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
  doc.text("SITE DATA", px0, yy); yy += 12;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(60, 70, 85);
  const rows = [
    ["APN", meta.apn], ["Jurisdiction", meta.jurisdiction], ["Owner", meta.owner],
    ["Tower height", meta.heightFt ? `${Math.round(meta.heightFt)} FT` : null],
    ["Fall-zone radius", meta.fallRadiusFt ? `${Math.round(meta.fallRadiusFt)} FT` : null],
    ["Compound", meta.compoundW && meta.compoundD ? `${Math.round(meta.compoundW)} x ${Math.round(meta.compoundD)} FT` : null],
    ["Setback applied", meta.setbackFt ? `${Math.round(meta.setbackFt)} FT` : null],
    ["Tower coords", towerLngLat ? `${towerLngLat[1].toFixed(6)}, ${towerLngLat[0].toFixed(6)}` : null],
  ].filter(([, v]) => v != null && v !== "");
  for (const [k, v] of rows) {
    const lines = doc.splitTextToSize(`${k}:  ${v}`, W - M - px0);
    doc.text(lines, px0, yy); yy += lines.length * 9.5;
  }

  yy += 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
  doc.text("LEGEND", px0, yy); yy += 11;
  const legend = [
    { label: "Property boundary", stroke: [30, 41, 59], dash: null },
    { label: "Setback / buildable envelope", stroke: [5, 150, 105], dash: [4, 3] },
    { label: "Fall zone", stroke: [220, 38, 38], dash: [3, 3] },
    { label: "Equipment compound", stroke: [234, 88, 12], dash: null, fill: [234, 88, 12] },
    { label: "Access easement (proposed)", stroke: [120, 85, 40], dash: [5, 3] },
    { label: "Tower location", dot: [8, 145, 178] },
  ];
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  for (const item of legend) {
    if (item.dot) {
      doc.setFillColor(item.dot[0], item.dot[1], item.dot[2]);
      doc.circle(px0 + 11, yy - 2, 2.6, "F");
    } else {
      if (item.fill) {
        doc.setGState(new doc.GState({ opacity: 0.3 }));
        doc.setFillColor(item.fill[0], item.fill[1], item.fill[2]);
        doc.rect(px0, yy - 6, 22, 8, "F");
        doc.setGState(new doc.GState({ opacity: 1 }));
      }
      doc.setDrawColor(item.stroke[0], item.stroke[1], item.stroke[2]);
      doc.setLineWidth(1.4);
      doc.setLineDashPattern(item.dash || [], 0);
      doc.line(px0, yy - 2, px0 + 22, yy - 2);
      doc.setLineDashPattern([], 0);
    }
    doc.setTextColor(60, 70, 85);
    doc.text(item.label, px0 + 28, yy);
    yy += 13;
  }

  // ---- footer ----
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(110, 120, 135);
  doc.text(doc.splitTextToSize(
    "PRELIMINARY AUTOMATED EXHIBIT — NOT A SURVEY. Boundary, setbacks, fall zone, compound and easement are drawn to scale from available GIS data. Verify all dimensions with a licensed surveyor and the local governing jurisdiction before submission.",
    W - 2 * M), M, box.y + box.h + 14);
  doc.setFont("helvetica", "bold"); doc.setTextColor(8, 145, 178);
  doc.text("Powered by SiteHawk TalonFit® proprietary feasibility engine — Patent Pending.", M, box.y + box.h + 34);

  const base = String(meta.apn || meta.siteLabel || "site").replace(/[^a-z0-9-]/gi, "_").slice(0, 40);
  doc.save(`TalonFit-Site-Exhibit-${base}.pdf`);
}