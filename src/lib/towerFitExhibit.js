/**
 * Tower Fit Exhibit — pure geometry engine (STANDALONE, no APIs).
 * Units: feet. Coordinate system: x = east, y = north (y-up).
 *
 * Verdict criteria:
 *  - FITS: compound entirely inside the setback envelope AND fall zone stays on parcel.
 *  - CONDITIONAL: compound clears setbacks, but fall zone spills past a boundary.
 *  - DOES NOT FIT: compound can't clear the setbacks (envelope too small / none).
 */

export const DEFAULT_CONFIG = {
  siteName: "Proposed Tower Site",
  preparedFor: "",
  jurisdiction: "",
  date: new Date().toISOString().slice(0, 10),
  shape: "rectangle", // rectangle | polygon
  widthFt: 400,
  depthFt: 350,
  polygonText: "", // "x,y" per line (feet)
  tower: { heightFt: 199, type: "Monopole", location: "center", customX: "", customY: "" },
  compound: { widthFt: 100, depthFt: 100 },
  setbacks: { front: 50, rear: 50, left: 25, right: 25 }, // front=N, rear=S, left=W, right=E
  fallZone: { rule: "100", customFt: "" }, // 100 | 110 | custom
  easement: { enabled: false, widthFt: 30, from: "south" },
  notes: "",
};

function shoelaceArea(v) {
  let a = 0;
  for (let i = 0; i < v.length; i++) {
    const [x1, y1] = v[i];
    const [x2, y2] = v[(i + 1) % v.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function polygonCentroid(v) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < v.length; i++) {
    const [x1, y1] = v[i];
    const [x2, y2] = v[(i + 1) % v.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a) < 1e-9) return [v[0][0], v[0][1]];
  a /= 2;
  return [cx / (6 * a), cy / (6 * a)];
}

export function pointInPolygon([px, py], v) {
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [xi, yi] = v[i];
    const [xj, yj] = v[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function parsePolygonText(text) {
  const pts = [];
  for (const line of (text || "").split(/\n+/)) {
    const m = line.trim().match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (m) pts.push([Number(m[1]), Number(m[2])]);
  }
  return pts.length >= 3 ? pts : null;
}

export function computeExhibit(cfg) {
  const c = cfg;

  // ---- parcel vertices (normalized so bbox min = 0,0) ----
  let vertices, isRect;
  if (c.shape === "polygon") {
    const raw = parsePolygonText(c.polygonText);
    if (raw) {
      const minX = Math.min(...raw.map((p) => p[0]));
      const minY = Math.min(...raw.map((p) => p[1]));
      vertices = raw.map(([x, y]) => [x - minX, y - minY]);
      isRect = false;
    }
  }
  if (!vertices) {
    const w = Math.max(Number(c.widthFt) || 0, 1);
    const d = Math.max(Number(c.depthFt) || 0, 1);
    vertices = [[0, 0], [w, 0], [w, d], [0, d]];
    isRect = true;
  }
  const xs = vertices.map((p) => p[0]);
  const ys = vertices.map((p) => p[1]);
  const bbox = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const areaSf = shoelaceArea(vertices);
  const parcel = {
    vertices, isRect, bbox,
    width: bbox.maxX - bbox.minX,
    depth: bbox.maxY - bbox.minY,
    areaSf,
    acres: areaSf / 43560,
  };

  // ---- setback (buildable) envelope — bbox inset by directional setbacks ----
  const sb = {
    front: Number(c.setbacks.front) || 0,
    rear: Number(c.setbacks.rear) || 0,
    left: Number(c.setbacks.left) || 0,
    right: Number(c.setbacks.right) || 0,
  };
  const env = {
    x1: bbox.minX + sb.left,
    x2: bbox.maxX - sb.right,
    y1: bbox.minY + sb.rear,
    y2: bbox.maxY - sb.front,
  };
  env.valid = env.x2 > env.x1 && env.y2 > env.y1;
  env.areaSf = env.valid ? (env.x2 - env.x1) * (env.y2 - env.y1) : 0;

  // ---- tower placement ----
  const compW = Math.max(Number(c.compound.widthFt) || 100, 1);
  const compD = Math.max(Number(c.compound.depthFt) || 100, 1);
  const heightFt = Math.max(Number(c.tower.heightFt) || 0, 1);
  let tx, ty;
  const loc = c.tower.location || "center";
  const envCx = env.valid ? (env.x1 + env.x2) / 2 : (bbox.minX + bbox.maxX) / 2;
  const envCy = env.valid ? (env.y1 + env.y2) / 2 : (bbox.minY + bbox.maxY) / 2;
  if (loc === "custom" && c.tower.customX !== "" && c.tower.customY !== "") {
    tx = Number(c.tower.customX); ty = Number(c.tower.customY);
  } else if (loc === "center") {
    [tx, ty] = polygonCentroid(vertices);
  } else if (loc === "auto") {
    tx = envCx; ty = envCy;
  } else if (env.valid) {
    tx = envCx; ty = envCy;
    if (loc === "north") ty = env.y2 - compD / 2;
    if (loc === "south") ty = env.y1 + compD / 2;
    if (loc === "east") tx = env.x2 - compW / 2;
    if (loc === "west") tx = env.x1 + compW / 2;
  } else {
    [tx, ty] = polygonCentroid(vertices);
  }

  // ---- compound rect centered on tower ----
  const compound = {
    x1: tx - compW / 2, x2: tx + compW / 2,
    y1: ty - compD / 2, y2: ty + compD / 2,
    w: compW, d: compD,
  };
  const cornersInEnvelope = env.valid &&
    compound.x1 >= env.x1 - 1e-6 && compound.x2 <= env.x2 + 1e-6 &&
    compound.y1 >= env.y1 - 1e-6 && compound.y2 <= env.y2 + 1e-6;
  const cornersInParcel = [
    [compound.x1, compound.y1], [compound.x2, compound.y1],
    [compound.x2, compound.y2], [compound.x1, compound.y2],
  ].every((p) => pointInPolygon(p, vertices) || onBBoxEdge(p, bbox));
  compound.fits = cornersInEnvelope && cornersInParcel;

  // ---- fall zone ----
  let radius;
  if (c.fallZone.rule === "110") radius = 1.1 * heightFt;
  else if (c.fallZone.rule === "custom") radius = Number(c.fallZone.customFt) || heightFt;
  else radius = heightFt;
  let spills = false;
  for (let i = 0; i < 72; i++) {
    const ang = (i * 2 * Math.PI) / 72;
    const p = [tx + radius * Math.cos(ang), ty + radius * Math.sin(ang)];
    if (!pointInPolygon(p, vertices) && !onBBoxEdge(p, bbox)) { spills = true; break; }
  }
  const fallZone = { radius, rule: c.fallZone.rule, spills };

  // ---- access easement ----
  let easement = null;
  if (c.easement?.enabled) {
    const w = Math.max(Number(c.easement.widthFt) || 30, 1);
    const from = c.easement.from || "south";
    const cx = (compound.x1 + compound.x2) / 2;
    const cy = (compound.y1 + compound.y2) / 2;
    if (from === "south" && compound.y1 > bbox.minY)
      easement = { from, w, x1: cx - w / 2, x2: cx + w / 2, y1: bbox.minY, y2: compound.y1 };
    if (from === "north" && compound.y2 < bbox.maxY)
      easement = { from, w, x1: cx - w / 2, x2: cx + w / 2, y1: compound.y2, y2: bbox.maxY };
    if (from === "west" && compound.x1 > bbox.minX)
      easement = { from, w, x1: bbox.minX, x2: compound.x1, y1: cy - w / 2, y2: cy + w / 2 };
    if (from === "east" && compound.x2 < bbox.maxX)
      easement = { from, w, x1: compound.x2, x2: bbox.maxX, y1: cy - w / 2, y2: cy + w / 2 };
  }

  // ---- verdict ----
  let verdict, verdictReason;
  const type = (c.tower.type || "Monopole").toLowerCase();
  if (!env.valid) {
    verdict = "DOES_NOT_FIT";
    verdictReason = "Setbacks leave no buildable envelope on this parcel.";
  } else if (!compound.fits) {
    verdict = "DOES_NOT_FIT";
    verdictReason = `The ${compW}′ × ${compD}′ compound cannot clear the setbacks at this location.`;
  } else if (spills) {
    verdict = "CONDITIONAL";
    verdictReason = `Compound clears setbacks, but the ${Math.round(radius)}′ fall zone extends past the property line. A fall-zone easement — or a jurisdiction that measures fall zone differently — may cure.`;
  } else {
    verdict = "FITS";
    verdictReason = `${heightFt}′ ${type} clears all setbacks; fall zone stays on the parcel.`;
  }

  return {
    parcel,
    envelope: env,
    setbacks: sb,
    tower: { x: tx, y: ty, heightFt, type: c.tower.type || "Monopole", location: loc },
    compound,
    fallZone,
    easement,
    verdict,
    verdictReason,
  };
}

function onBBoxEdge([px, py], bbox) {
  const eps = 0.01;
  return px >= bbox.minX - eps && px <= bbox.maxX + eps &&
    py >= bbox.minY - eps && py <= bbox.maxY + eps &&
    (Math.abs(px - bbox.minX) < eps || Math.abs(px - bbox.maxX) < eps ||
     Math.abs(py - bbox.minY) < eps || Math.abs(py - bbox.maxY) < eps);
}

export const VERDICT_META = {
  FITS: { label: "FITS", color: "#10B981" },
  CONDITIONAL: { label: "CONDITIONAL", color: "#F59E0B" },
  DOES_NOT_FIT: { label: "DOES NOT FIT", color: "#EF4444" },
};

export function wrapText(str, maxChars) {
  const words = String(str || "").split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}