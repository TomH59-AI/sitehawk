// TalonFit® Site Exhibit — shared geometry projection + to-scale PDF drafting.
// All coordinates are projected to local feet (east/north) around the tower base
// so the drawing and the 3D scene are true to scale.
import { jsPDF } from "jspdf";
import * as turf from "@turf/turf";

const LAT_FT = 364567.2; // ft per degree latitude
const FT_TO_KM = 0.0003048;

export const VERDICT_META = {
  FITS: { label: "FITS", rgb: [22, 163, 74] },
  CONDITIONAL: { label: "CONDITIONAL", rgb: [217, 119, 6] },
  DOES_NOT_FIT: { label: "DOES NOT FIT", rgb: [220, 38, 38] },
};

export function toLocalFt(lngLat, origin) {
  const lonFt = Math.cos((origin[1] * Math.PI) / 180) * 365221.4;
  return [(lngLat[0] - origin[0]) * lonFt, (lngLat[1] - origin[1]) * LAT_FT];
}

function geomRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

export function ringsToLocalFt(geometry, origin) {
  return geomRings(geometry).map((ring) => ring.map((c) => toLocalFt(c, origin)));
}

// Buildable envelope = parcel inward-buffered by the governing setback.
export function computeEnvelope(parcelGeometry, setbackFt) {
  try {
    const f = { type: "Feature", properties: {}, geometry: parcelGeometry };
    const buffered = turf.buffer(f, -(setbackFt || 25) * FT_TO_KM, { units: "kilometers" });
    return buffered?.geometry || null;
  } catch {
    return null;
  }
}

// Schematic access easement: shortest corridor from the tower to the parcel line.
export function computeAccessEasement(parcelGeometry, towerLngLat) {
  try {
    const f = { type: "Feature", properties: {}, geometry: parcelGeometry };
    const lines = turf.polygonToLine(f);
    let best = null, bestD = Infinity;
    turf.flattenEach(lines, (line) => {
      const np = turf.nearestPointOnLine(line, turf.point(towerLngLat), { units: "kilometers" });
      if (np?.properties?.dist < bestD) { bestD = np.properties.dist; best = np.geometry.coordinates; }
    });
    return best ? { from: towerLngLat, to: best } : null;
  } catch {
    return null;
  }
}

function drawRing(doc, pts, style) {
  if (pts.length < 3) return;
  const segs = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  doc.lines(segs, pts[0][0], pts[0][1], [1, 1], style, true);
}

function niceScaleBarFt(ftPerPt) {
  const candidates = [10, 20, 25, 50, 100, 150, 200, 300, 400, 500, 800, 1000, 2000];
  for (const L of candidates) {
    const pts = L / ftPerPt;
    if (pts >= 60 && pts <= 150) return L;
  }
  return candidates[candidates.length - 1];
}

// data: { verdict, parcel, envelope, compound, fallZone, towerLngLat,
//         towerHeightFt, fallRadiusFt, meta:{address, apn, jurisdiction, compoundW, compoundD, source} }
export function generateSiteExhibitPdf(data) {
  const { verdict, parcel, envelope, compound, fallZone, towerLngLat, towerHeightFt, fallRadiusFt, meta = {} } = data;
  const origin = towerLngLat;
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792
  const v = VERDICT_META[verdict] || VERDICT_META.CONDITIONAL;

  /* ---- header ---- */
  doc.setFillColor(10, 28, 46);
  doc.rect(0, 0, 612, 78, "F");
  doc.setTextColor(56, 189, 248);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("SITEHAWK", 40, 24);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("TalonFit® Site Exhibit", 40, 48);
  doc.setFontSize(8);
  doc.setTextColor(148, 197, 255);
  doc.text("To-scale preliminary siting drawing — auto-drafted from the TalonFit run", 40, 64);
  // verdict pill
  doc.setFillColor(...v.rgb);
  const pillW = doc.getTextWidth(v.label) * (12 / doc.getFontSize()) + 36;
  doc.roundedRect(572 - pillW, 26, pillW, 26, 13, 13, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(v.label, 572 - pillW / 2, 43, { align: "center" });

  /* ---- meta ---- */
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const metaLine1 = `${meta.address || "—"}   ·   APN ${meta.apn || "—"}   ·   ${meta.jurisdiction || "Jurisdiction unverified"}`;
  const metaLine2 = `Tower ${Math.round(towerHeightFt)} ft AGL   ·   Compound ${Math.round(meta.compoundW || 0)}×${Math.round(meta.compoundD || 0)} ft   ·   Fall zone ${Math.round(fallRadiusFt)} ft   ·   ${meta.source || "TalonFit"}   ·   ${new Date().toISOString().slice(0, 10)}`;
  doc.text(metaLine1, 40, 98);
  doc.setTextColor(100, 116, 139);
  doc.text(metaLine2, 40, 112);

  /* ---- drawing area ---- */
  const DX = 40, DY = 128, DW = 532, DH = 460;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(1);
  doc.rect(DX, DY, DW, DH, "S");

  // project everything + bbox (parcel + fall zone drive the extent)
  const parcelRings = ringsToLocalFt(parcel, origin);
  const envRings = envelope ? ringsToLocalFt(envelope, origin) : [];
  const compRings = compound ? ringsToLocalFt(compound, origin) : [];
  const fzRings = fallZone ? ringsToLocalFt(fallZone, origin) : [];
  const easement = computeAccessEasement(parcel, towerLngLat);
  const all = [...parcelRings.flat(), ...fzRings.flat(), [0, 0]];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of all) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const bw = Math.max(maxX - minX, 50), bh = Math.max(maxY - minY, 50);
  const scale = Math.min((DW * 0.84) / bw, (DH * 0.84) / bh); // pt per ft
  const bcx = (minX + maxX) / 2, bcy = (minY + maxY) / 2;
  const cx = DX + DW / 2, cy = DY + DH / 2;
  const P = ([x, y]) => [cx + (x - bcx) * scale, cy - (y - bcy) * scale]; // north up

  // fall zone — light amber fill + dashed ring
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(1);
  doc.setLineDashPattern([4, 3], 0);
  fzRings.forEach((r) => drawRing(doc, r.map(P), "FD"));
  doc.setLineDashPattern([], 0);

  // buildable envelope — dashed green
  doc.setDrawColor(22, 163, 74);
  doc.setLineWidth(1.2);
  doc.setLineDashPattern([5, 3], 0);
  envRings.forEach((r) => drawRing(doc, r.map(P), "S"));
  doc.setLineDashPattern([], 0);

  // access easement — thick gray dashed corridor
  if (easement) {
    const a = P(toLocalFt(easement.from, origin));
    const b = P(toLocalFt(easement.to, origin));
    doc.setDrawColor(107, 114, 128);
    doc.setLineWidth(5);
    doc.setLineDashPattern([7, 5], 0);
    doc.line(a[0], a[1], b[0], b[1]);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(6.5);
    doc.setTextColor(75, 85, 99);
    doc.text("PROPOSED 20' ACCESS EASEMENT", (a[0] + b[0]) / 2 + 4, (a[1] + b[1]) / 2 - 4);
  }

  // compound — blue fill + solid stroke
  doc.setFillColor(219, 234, 254);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1.2);
  compRings.forEach((r) => drawRing(doc, r.map(P), "FD"));

  // parcel boundary — solid dark
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.8);
  parcelRings.forEach((r) => drawRing(doc, r.map(P), "S"));

  // tower point
  const T = P([0, 0]);
  doc.setFillColor(220, 38, 38);
  doc.circle(T[0], T[1], 4, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1);
  doc.line(T[0] - 2.5, T[1], T[0] + 2.5, T[1]);
  doc.line(T[0], T[1] - 2.5, T[0], T[1] + 2.5);
  doc.setFontSize(7);
  doc.setTextColor(185, 28, 28);
  doc.setFont("helvetica", "bold");
  doc.text(`TOWER — ${Math.round(towerHeightFt)} FT`, T[0] + 8, T[1] - 6);

  // north arrow (top-right of drawing)
  const nx = DX + DW - 30, ny = DY + 40;
  doc.setFillColor(15, 23, 42);
  doc.triangle(nx, ny - 18, nx - 7, ny + 4, nx + 7, ny + 4, "F");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("N", nx, ny + 16, { align: "center" });

  // scale bar (bottom-left of drawing)
  const ftPerPt = 1 / scale;
  const barFt = niceScaleBarFt(ftPerPt);
  const barPts = barFt * scale;
  const sx = DX + 16, sy = DY + DH - 20;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(2);
  doc.line(sx, sy, sx + barPts, sy);
  doc.setLineWidth(1);
  doc.line(sx, sy - 4, sx, sy + 4);
  doc.line(sx + barPts, sy - 4, sx + barPts, sy + 4);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(`0`, sx, sy - 7);
  doc.text(`${barFt} FT`, sx + barPts, sy - 7, { align: "right" });
  doc.text(`SCALE: 1" = ${Math.round(72 * ftPerPt)} FT`, sx, sy + 14);

  /* ---- legend ---- */
  let ly = DY + DH + 22;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("LEGEND", 40, ly);
  doc.setFont("helvetica", "normal");
  const items = [
    { label: "Property boundary", stroke: [15, 23, 42], fill: null, dash: false },
    { label: "Buildable envelope (setback)", stroke: [22, 163, 74], fill: null, dash: true },
    { label: "Equipment compound", stroke: [37, 99, 235], fill: [219, 234, 254], dash: false },
    { label: `Fall zone (${Math.round(fallRadiusFt)} ft)`, stroke: [217, 119, 6], fill: [254, 243, 199], dash: true },
    { label: "Access easement", stroke: [107, 114, 128], fill: null, dash: true },
    { label: "Tower location", stroke: [220, 38, 38], fill: [220, 38, 38], dash: false },
  ];
  let lx = 40;
  ly += 14;
  items.forEach((it, i) => {
    if (i === 3) { ly += 16; lx = 40; }
    if (it.fill) { doc.setFillColor(...it.fill); doc.rect(lx, ly - 7, 16, 9, "F"); }
    doc.setDrawColor(...it.stroke);
    doc.setLineWidth(1.5);
    if (it.dash) doc.setLineDashPattern([3, 2], 0);
    doc.rect(lx, ly - 7, 16, 9, "S");
    doc.setLineDashPattern([], 0);
    doc.setTextColor(51, 65, 85);
    doc.text(it.label, lx + 22, ly);
    lx += 22 + doc.getTextWidth(it.label) + 24;
  });

  /* ---- footer ---- */
  doc.setFontSize(6.5);
  doc.setTextColor(120, 130, 145);
  doc.text(
    "Preliminary automated siting exhibit — NOT a survey, zoning determination, or construction drawing. Boundary, setback, compound, fall-zone and easement geometry are drawn to scale from available data.",
    40, 752, { maxWidth: 532 }
  );
  doc.text("Verify all dimensions with a licensed surveyor and the local governing authority. Powered by SiteHawk TalonFit® — Patent Pending.", 40, 768, { maxWidth: 532 });

  const base = String(meta.apn || meta.address || "site").replace(/[^a-z0-9-]/gi, "_").slice(0, 40);
  doc.save(`TalonFit-Site-Exhibit-${base}.pdf`);
}