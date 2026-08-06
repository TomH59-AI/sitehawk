/**
 * Live Sketch engine — draws a Talon FT exhibit model freehand, stroke by
 * stroke, on an SVG "drafting paper" stage. Pure vanilla DOM (no React inside):
 * the React wrapper owns buttons/chips/captions and drives this controller.
 *
 * Input models come from @/lib/towerFitExhibit computeExhibit() — the SAME
 * geometry + verdict engine used by the static Tower Fit Exhibit, so nothing
 * here invents dimensions. This module only performs the drawing.
 *
 * mountLiveSketch(svgEl, opts) → controller
 *   opts: {
 *     base,          // computeExhibit model at the full (100%/110%/custom) fall zone
 *     pe,            // computeExhibit model at the engineered (PE) radius, or null
 *     peInfo,        // { available, ruleLabel, accepted, radiusFt } or null
 *     meta,          // { siteName, dateLabel }
 *     onCaption(text), onChip(key), onState({running,done,peOn}), onDone()
 *   }
 *   controller: { start, skip, replay, applyPE, revertPE, setSpeed, setSound,
 *                 chips, destroy }
 */

/* ── SkyWave / SiteHawk palette (matches tower_exhibit + brand) ── */
const C = {
  ink: "#12202F", cyan: "#00D9FF", cyanDk: "#008BA8", amber: "#F59E0B",
  red: "#EF4444", green: "#10B981", dim: "#6B7B8C", navy: "#0F1B2D",
  paper: "#F7FAFC", grid: "#DCE6EF",
};
const HAND = "'Segoe Print','Bradley Hand','Marker Felt','Comic Sans MS',cursive";
const UIF = "Arial,'Helvetica Neue',Helvetica,sans-serif";
const VW = 1044, VH = 620, IN = 26, PAD = 0.07;
const NS = "http://www.w3.org/2000/svg";

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mountLiveSketch(svg, opts) {
  const { base, pe, peInfo, meta } = opts;
  const onCaption = opts.onCaption || (() => {});
  const onChip = opts.onChip || (() => {});
  const onState = opts.onState || (() => {});
  const onDone = opts.onDone || (() => {});

  const R = mulberry32(20260803);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);

  /* ── world→screen from the base model (fall circle included in bounds) ── */
  const P = base.parcel, T = base.tower, FZ = base.fallZone;
  const verts = P.vertices;
  let minx = Math.min(P.bbox.minX, T.x - FZ.radius);
  let maxx = Math.max(P.bbox.maxX, T.x + FZ.radius);
  let miny = Math.min(P.bbox.minY, T.y - FZ.radius);
  let maxy = Math.max(P.bbox.maxY, T.y + FZ.radius);
  let bw = maxx - minx, bh = maxy - miny;
  minx -= bw * PAD; maxx += bw * PAD; miny -= bh * PAD; maxy += bh * PAD;
  bw = maxx - minx; bh = maxy - miny;
  const S = Math.min((VW - 2 * IN) / bw, (VH - 2 * IN) / bh);
  const OX = IN + ((VW - 2 * IN) - bw * S) / 2;
  const OY = IN + ((VH - 2 * IN) - bh * S) / 2;
  const X = (fx) => OX + (fx - minx) * S;
  const Y = (fy) => OY + (maxy - fy) * S;

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(n);
    return n;
  }

  /* ── freehand path builders ── */
  function roughLineD(x1, y1, x2, y2, o = {}) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const over = o.over !== undefined ? o.over : Math.min(5, 2 + R() * 3);
    const sl = o.slop !== undefined ? o.slop : 1.5;
    const ax1 = x1 - ux * over + (R() - 0.5) * 2 * sl, ay1 = y1 - uy * over + (R() - 0.5) * 2 * sl;
    const ax2 = x2 + ux * over + (R() - 0.5) * 2 * sl, ay2 = y2 + uy * over + (R() - 0.5) * 2 * sl;
    const L = Math.hypot(ax2 - ax1, ay2 - ay1);
    const amp = o.amp !== undefined ? o.amp : Math.min(2.3, Math.max(0.7, len * 0.006));
    const f1 = 1.4 + R() * 1.7, f2 = 3.6 + R() * 3.4, p1 = R() * 6.283, p2 = R() * 6.283;
    const n = Math.max(6, Math.round(L / 9));
    let d = "";
    for (let i = 0; i <= n; i++) {
      const t = i / n, e = Math.pow(Math.sin(Math.min(1, Math.max(0, t)) * Math.PI), 0.55);
      const off = e * (amp * Math.sin(t * f1 * 6.283 + p1) + amp * 0.45 * Math.sin(t * f2 * 6.283 + p2) + (R() - 0.5) * 0.7);
      d += (i ? " L" : "M") + (ax1 + (ax2 - ax1) * t + px * off).toFixed(1) + "," + (ay1 + (ay2 - ay1) * t + py * off).toFixed(1);
    }
    return d;
  }
  function roughCircleD(cx, cy, r) {
    const a1 = Math.max(1.1, r * 0.012), f1 = 3 + R() * 2, f2 = 6 + R() * 4, p1 = R() * 6.283, p2 = R() * 6.283;
    const n = Math.max(48, Math.round((2 * Math.PI * r) / 7));
    let d = "";
    const start = -Math.PI / 2 + (R() - 0.5) * 0.1, span = 2 * Math.PI + 0.14;
    for (let i = 0; i <= n; i++) {
      const t = i / n, th = start + span * t;
      const rr = r + a1 * Math.sin(th * f1 + p1) + a1 * 0.5 * Math.sin(th * f2 + p2);
      d += (i ? " L" : "M") + (cx + rr * Math.cos(th)).toFixed(1) + "," + (cy + rr * Math.sin(th)).toFixed(1);
    }
    return d;
  }
  function segsD(segs, jit = 0.6) {
    let d = "";
    for (const [x1, y1, x2, y2] of segs) {
      d += "M" + (x1 + (R() - 0.5) * jit).toFixed(1) + "," + (y1 + (R() - 0.5) * jit).toFixed(1) +
        " L" + (x2 + (R() - 0.5) * jit).toFixed(1) + "," + (y2 + (R() - 0.5) * jit).toFixed(1);
    }
    return d;
  }
  function stroke(d, col, wd, o = {}) {
    return el("path", {
      d, fill: "none", stroke: col, "stroke-width": wd,
      "stroke-linecap": "round", "stroke-linejoin": "round",
      "stroke-opacity": o.op !== undefined ? o.op : 0.95,
    }, o.parent);
  }
  function handLabel(x, y, str, o = {}) {
    const g = el("g", { transform: `translate(${x},${y}) rotate(${o.rot || 0})` });
    const gi = el("g", { class: "ls-lbl" }, g);
    const t = el("text", {
      "font-size": o.size || 13, fill: o.fill || C.ink,
      "text-anchor": o.anchor || "start", "font-weight": o.weight || 600,
    }, gi);
    t.style.fontFamily = HAND;
    t.textContent = str;
    return gi;
  }

  /* ── inject minimal CSS once per svg ── */
  const style = el("style", {});
  style.textContent = `
    .ls-lbl{opacity:0;transform:translateY(7px) rotate(1.2deg);transform-box:fill-box;transform-origin:left center;transition:opacity .38s ease,transform .5s cubic-bezier(.2,.9,.3,1.25)}
    .ls-lbl.on{opacity:1;transform:none}
    .ls-fill{opacity:0;transition:opacity .7s ease}
    .ls-fill.on{opacity:1}
    .ls-stamp{opacity:0;transform:scale(3.1) rotate(4deg);transform-box:fill-box;transform-origin:center}
    .ls-stamp.landed{animation:lsStamp .5s cubic-bezier(.25,1.1,.4,1) forwards}
    @keyframes lsStamp{0%{opacity:0;transform:scale(3.1) rotate(4deg)}62%{opacity:1;transform:scale(.94) rotate(-.6deg)}80%{transform:scale(1.045) rotate(.3deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
    .ls-ghosted{opacity:.22;transition:opacity .5s}
    .ls-dim{opacity:.25;transition:opacity .5s}
    .ls-noanim *{transition:none !important;animation:none !important}
    .ls-noanim .ls-stamp.landed{opacity:1;transform:none}
  `;

  /* ── paper ── */
  const defs = el("defs", {});
  const parcelPathD = "M" + verts.map(([vx, vy]) => `${X(vx).toFixed(1)},${Y(vy).toFixed(1)}`).join(" L") + " Z";
  defs.innerHTML = `
    <pattern id="lsGrid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48,0 H0 V48" fill="none" stroke="${C.grid}" stroke-width="1"/>
    </pattern>
    <pattern id="lsConflict" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="9" height="9" fill="${C.red}" fill-opacity="0.10"/>
      <line x1="0" y1="0" x2="0" y2="9" stroke="${C.red}" stroke-width="2.2"/>
    </pattern>
    <clipPath id="lsOutside" clip-rule="evenodd">
      <path clip-rule="evenodd" d="M0,0 H${VW} V${VH} H0 Z ${parcelPathD}"/>
    </clipPath>`;
  el("rect", { x: 0, y: 0, width: VW, height: VH, fill: C.paper });
  el("rect", { x: 0, y: 0, width: VW, height: VH, fill: "url(#lsGrid)" });

  /* ── fills (revealed later) ── */
  const env = base.envelope;
  const envFill = env.valid ? el("rect", {
    class: "ls-fill", x: X(env.x1), y: Y(env.y2),
    width: (env.x2 - env.x1) * S, height: (env.y2 - env.y1) * S,
    fill: C.green, "fill-opacity": 0.13,
  }) : null;
  const fallFill = el("circle", { class: "ls-fill", cx: X(T.x), cy: Y(T.y), r: FZ.radius * S, fill: C.amber, "fill-opacity": 0.13 });
  const comp = base.compound;
  const compFill = el("rect", {
    class: "ls-fill", x: X(comp.x1), y: Y(comp.y2), width: comp.w * S, height: comp.d * S,
    fill: C.navy, "fill-opacity": 0.15,
  });
  const conflictG = el("g", { "clip-path": "url(#lsOutside)" });
  const conflict = FZ.spills ? el("circle", {
    class: "ls-fill", cx: X(T.x), cy: Y(T.y), r: FZ.radius * S,
    fill: "url(#lsConflict)", stroke: C.red, "stroke-width": 2.4,
  }, conflictG) : null;
  const peFill = pe ? el("circle", {
    class: "ls-fill", cx: X(T.x), cy: Y(T.y), r: pe.fallZone.radius * S,
    fill: C.amber, "fill-opacity": 0.12,
  }) : null;

  /* ── strokes group ── */
  const G = el("g", {});

  /* boundary edges (pencil walks the perimeter) */
  const n = verts.length;
  const centroidX = verts.reduce((a, p) => a + p[0], 0) / n;
  const centroidY = verts.reduce((a, p) => a + p[1], 0) / n;
  const edgeStrokes = [], edgeLabels = [];
  let retraceD = "";
  for (let i = 0; i < n; i++) {
    const [ax, ay] = verts[i], [bx, by] = verts[(i + 1) % n];
    const sx1 = X(ax), sy1 = Y(ay), sx2 = X(bx), sy2 = Y(by);
    edgeStrokes.push(stroke(roughLineD(sx1, sy1, sx2, sy2), C.ink, 3, { parent: G }));
    retraceD += roughLineD(sx1, sy1, sx2, sy2, { amp: 1.6 }) + " ";
    const lenFt = Math.hypot(bx - ax, by - ay);
    if (lenFt >= 45) {
      const mxw = (ax + bx) / 2, myw = (ay + by) / 2;
      let nx = -(by - ay), ny = (bx - ax);
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      if ((mxw - centroidX) * nx + (myw - centroidY) * ny < 0) { nx = -nx; ny = -ny; }
      const lx = X(mxw + nx * (16 / S)), ly = Y(myw + ny * (16 / S));
      let ang = Math.atan2(sy2 - sy1, sx2 - sx1) * 180 / Math.PI;
      if (ang > 90 || ang <= -90) ang += 180;
      let suffix = "";
      const adx = Math.abs(bx - ax), ady = Math.abs(by - ay);
      if (adx > ady * 2.5) suffix = myw > centroidY ? " (N)" : " (S)";
      else if (ady > adx * 2.5) suffix = mxw > centroidX ? " (E)" : " (W)";
      edgeLabels.push(handLabel(lx, ly, `${Math.round(lenFt)}'${suffix}`, { size: 12.5, anchor: "middle", rot: Math.round(ang) }));
    } else edgeLabels.push(null);
  }
  const retrace = stroke(retraceD.trim(), C.ink, 1.2, { op: 0.3, parent: G });

  /* setback envelope — hand dashes */
  let envDash = null;
  if (env.valid) {
    const ex1 = X(env.x1), ey1 = Y(env.y2), ex2 = X(env.x2), ey2 = Y(env.y1);
    const rectPts = [[ex1, ey1, ex2, ey1], [ex2, ey1, ex2, ey2], [ex2, ey2, ex1, ey2], [ex1, ey2, ex1, ey1]];
    const dsegs = [];
    for (const [qx1, qy1, qx2, qy2] of rectPts) {
      const L = Math.hypot(qx2 - qx1, qy2 - qy1), ux = (qx2 - qx1) / L, uy = (qy2 - qy1) / L;
      let s0 = 0;
      while (s0 < L) { const e0 = Math.min(L, s0 + 12); dsegs.push([qx1 + ux * s0, qy1 + uy * s0, qx1 + ux * e0, qy1 + uy * e0]); s0 = e0 + 8; }
    }
    envDash = stroke(segsD(dsegs, 1), C.cyanDk, 2, { parent: G });
  }

  /* easement */
  const ease = base.easement;
  let easeA = null, easeB = null, easeHatch = null;
  if (ease) {
    const vertical = ease.from === "south" || ease.from === "north";
    if (vertical) {
      const xl = X(ease.x1), xr = X(ease.x2), yt = Y(ease.y2), yb = Y(ease.y1);
      easeA = stroke(roughLineD(xl, yb, xl, yt), C.dim, 1.6, { parent: G });
      easeB = stroke(roughLineD(xr, yb, xr, yt), C.dim, 1.6, { parent: G });
      const hs = [], hw = xr - xl;
      for (let yv = Math.min(yt, yb) + 6; yv < Math.max(yt, yb) - 2; yv += 10) hs.push([xl + 1.5, yv + hw - 3, xr - 1.5, yv]);
      easeHatch = stroke(segsD(hs, 0.8), C.dim, 1.2, { op: 0.7, parent: G });
    } else {
      const yt = Y(ease.y2), yb = Y(ease.y1), xl = X(ease.x1), xr = X(ease.x2);
      easeA = stroke(roughLineD(xl, yt, xr, yt), C.dim, 1.6, { parent: G });
      easeB = stroke(roughLineD(xl, yb, xr, yb), C.dim, 1.6, { parent: G });
      const hs = [], hh = yb - yt;
      for (let xv = xl + 6; xv < xr - 2; xv += 10) hs.push([xv, yt + 1.5, xv + hh - 3, yb - 1.5]);
      easeHatch = stroke(segsD(hs, 0.8), C.dim, 1.2, { op: 0.7, parent: G });
    }
  }

  /* compound + fence */
  const cnw = [X(comp.x1), Y(comp.y2)], cne = [X(comp.x2), Y(comp.y2)],
    cse = [X(comp.x2), Y(comp.y1)], csw = [X(comp.x1), Y(comp.y1)];
  const compCol = comp.fits ? C.navy : C.red;
  const compStroke = stroke(
    roughLineD(...cnw, ...cne, { over: 2 }) + " " + roughLineD(...cne, ...cse, { over: 2 }) + " " +
    roughLineD(...cse, ...csw, { over: 2 }) + " " + roughLineD(...csw, ...cnw, { over: 2 }),
    compCol, 2.4, { parent: G });
  const fsegs = [];
  for (const [a, b] of [[cnw, cne], [cne, cse], [cse, csw], [csw, cnw]]) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.floor(L / 16),
      ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    for (let i = 1; i < m; i++) {
      const mx = a[0] + ux * i * 16, my = a[1] + uy * i * 16;
      fsegs.push([mx - 3, my - 3, mx + 3, my + 3]); fsegs.push([mx - 3, my + 3, mx + 3, my - 3]);
    }
  }
  const fence = stroke(segsD(fsegs, 0.5), compCol, 1.1, { op: 0.55, parent: G });

  /* fall zone + radius + tower */
  const fzStroke = stroke(roughCircleD(X(T.x), Y(T.y), FZ.radius * S), C.amber, 2.2, { parent: G });
  const radLine = stroke(roughLineD(X(T.x), Y(T.y), X(T.x + FZ.radius), Y(T.y), { amp: 0.9, over: 0 }), C.amber, 1.5, { parent: G });
  const peStroke = pe ? stroke(roughCircleD(X(T.x), Y(T.y), pe.fallZone.radius * S), C.amber, 2.4, { parent: G }) : null;
  const peRad = pe ? stroke(roughLineD(X(T.x), Y(T.y), X(T.x - pe.fallZone.radius * 0.7071), Y(T.y + pe.fallZone.radius * 0.7071), { amp: 0.7, over: 0 }), C.amber, 1.4, { parent: G }) : null;
  const txp = X(T.x), typ = Y(T.y);
  const towerCross = stroke(
    roughLineD(txp - 16, typ, txp + 16, typ, { amp: 0.4, over: 1 }) + " " +
    roughLineD(txp, typ - 20, txp, typ + 18, { amp: 0.4, over: 1 }), C.ink, 1.2, { parent: G });
  const towerTri = stroke(
    roughLineD(txp, typ - 15, txp - 10, typ + 9, { amp: 0.5, over: 0, slop: 0.8 }) + " " +
    roughLineD(txp - 10, typ + 9, txp + 10, typ + 9, { amp: 0.5, over: 0, slop: 0.8 }) + " " +
    roughLineD(txp + 10, typ + 9, txp, typ - 15, { amp: 0.5, over: 0, slop: 0.8 }), C.red, 2.2, { parent: G });
  const towerDot = stroke(roughCircleD(txp, typ - 15, 3), C.amber, 2, { parent: G });
  const towerLeader = stroke(roughLineD(txp + 12, typ - 10, txp + 64, typ - 38, { amp: 0.6, over: 0 }), C.ink, 1, { op: 0.7, parent: G });

  /* elevation inset — only when the left margin has room */
  const hasElev = OX >= 180;
  let evParts = [], evLabels = [];
  if (hasElev) {
    const exC = Math.max(90, OX / 2 - 10), gy = 474, topY = 150;
    const gnd = stroke(roughLineD(exC - 70, gy, exC + 80, gy, { amp: 1 }), C.ink, 2.2, { parent: G });
    const gsegs = [];
    for (let gx = exC - 64; gx < exC + 78; gx += 11) gsegs.push([gx, gy + 1, gx - 6, gy + 8]);
    const gndH = stroke(segsD(gsegs, 0.7), C.ink, 1.1, { op: 0.6, parent: G });
    const pole = stroke(
      roughLineD(exC - 9, gy, exC - 5.5, topY, { amp: 0.9 }) + " " +
      roughLineD(exC + 9, gy, exC + 5.5, topY, { amp: 0.9 }) + " " +
      roughLineD(exC - 5.5, topY, exC + 5.5, topY, { amp: 0.4, over: 0 }), C.ink, 2, { parent: G });
    const tiers = [];
    [topY + 14, topY + 32, topY + 50].forEach((tyv) => {
      tiers.push([exC - 26, tyv, exC + 26, tyv]);
      tiers.push([exC - 26, tyv - 5, exC - 26, tyv + 5]); tiers.push([exC + 26, tyv - 5, exC + 26, tyv + 5]);
      tiers.push([exC - 14, tyv, exC - 6, tyv - 6]); tiers.push([exC + 14, tyv, exC + 6, tyv - 6]);
    });
    tiers.push([exC, topY, exC, topY - 14]);
    const tiersP = stroke(segsD(tiers, 0.5), C.ink, 1.4, { parent: G });
    const dimX = exC + 56;
    const dim = stroke(
      roughLineD(dimX, gy, dimX, topY, { amp: 0.5, over: 0 }) + " " +
      segsD([[dimX - 5, gy - 8, dimX, gy], [dimX + 5, gy - 8, dimX, gy],
        [dimX - 5, topY + 8, dimX, topY], [dimX + 5, topY + 8, dimX, topY],
        [dimX - 8, gy, dimX + 8, gy], [dimX - 8, topY, dimX + 8, topY]], 0), C.amber, 1.3, { parent: G });
    evParts = [gnd, gndH, pole, tiersP, dim];
    evLabels = [
      handLabel(dimX + 18, (gy + topY) / 2, `${Math.round(T.heightFt)}'-0"`, { size: 13, fill: C.amber, rot: -90, anchor: "middle", weight: 700 }),
      handLabel(exC + 5, gy + 26, `${(T.type || "MONOPOLE").toUpperCase()} ELEV. — N.T.S.`, { size: 11.5, fill: C.dim, anchor: "middle" }),
    ];
  }

  /* north arrow + scale bar */
  const NAx = VW - 69, NAy = 84;
  const naCirc = stroke(roughCircleD(NAx, NAy, 24), C.ink, 1.6, { parent: G });
  const naArrow = stroke(
    roughLineD(NAx, NAy - 17, NAx - 8, NAy + 9, { amp: 0.4, over: 0, slop: 0.6 }) + " " +
    roughLineD(NAx - 8, NAy + 9, NAx, NAy + 3, { amp: 0.3, over: 0, slop: 0.6 }) + " " +
    roughLineD(NAx, NAy + 3, NAx + 8, NAy + 9, { amp: 0.3, over: 0, slop: 0.6 }) + " " +
    roughLineD(NAx + 8, NAy + 9, NAx, NAy - 17, { amp: 0.4, over: 0, slop: 0.6 }), C.ink, 1.7, { parent: G });
  const nice = [10, 20, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000];
  const barFt = nice.reduce((best, v) => Math.abs(v - bw * 0.3) < Math.abs(best - bw * 0.3) ? v : best, nice[0]);
  const barPx = barFt * S, sbx = 52, sby = VH - 34;
  el("rect", { x: sbx - 10, y: sby - 16, width: barPx + 140, height: 34, rx: 6, fill: "#FFFFFF", "fill-opacity": 0.85 });
  const scaleBar = stroke(
    roughLineD(sbx, sby - 7, sbx + barPx, sby - 7, { amp: 0.4, over: 0 }) + " " +
    roughLineD(sbx, sby, sbx + barPx, sby, { amp: 0.4, over: 0 }) + " " +
    segsD([[sbx, sby - 7, sbx, sby], [sbx + barPx / 2, sby - 7, sbx + barPx / 2, sby], [sbx + barPx, sby - 7, sbx + barPx, sby]], 0),
    C.ink, 1.4, { parent: G });
  const scaleFill = el("rect", { class: "ls-fill", x: sbx, y: sby - 7, width: barPx / 2, height: 7, fill: C.ink });

  /* off-site utilities callout — fiber + power are ALWAYS written with their
     measured distance, even when they fall outside the drawn sketch extent. */
  const utilLines = Array.isArray(opts.utilities) ? opts.utilities.filter(Boolean) : [];
  let utilBox = null;
  const utilLabels = [];
  if (utilLines.length) {
    const uw = 306, uh = 30 + utilLines.length * 18;
    const ux = VW - uw - 26, uy = VH - uh - 58;
    el("rect", { x: ux, y: uy, width: uw, height: uh, rx: 6, fill: "#FFFFFF", "fill-opacity": 0.86 });
    utilBox = stroke(
      roughLineD(ux, uy, ux + uw, uy, { amp: 0.6 }) + " " +
      roughLineD(ux + uw, uy, ux + uw, uy + uh, { amp: 0.6 }) + " " +
      roughLineD(ux + uw, uy + uh, ux, uy + uh, { amp: 0.6 }) + " " +
      roughLineD(ux, uy + uh, ux, uy, { amp: 0.6 }), C.dim, 1.4, { op: 0.8 });
    utilLabels.push(handLabel(ux + 10, uy + 18, "OFF-SITE UTILITIES — MEASURED DISTANCE", { size: 10.5, fill: C.dim, weight: 700 }));
    utilLines.forEach((line, i) => {
      utilLabels.push(handLabel(ux + 10, uy + 36 + i * 18, line.text, { size: 12, fill: line.color === "power" ? C.amber : C.cyanDk, weight: 700 }));
    });
  }

  /* labels */
  const title = handLabel(40, 52, "CONCEPT SITE SKETCH", { size: 17, weight: 700 });
  const titleUL = stroke(roughLineD(40, 60, 248, 60, { amp: 1 }), C.ink, 1.4, { op: 0.6 });
  const lblEnv = env.valid ? handLabel(X(env.x1) + 8, Y(env.y2) + 19, "SETBACK LINE — BUILDABLE AREA", { size: 12, fill: C.cyanDk }) : null;
  const setbackLabels = env.valid ? [
    handLabel((X(env.x1) + X(env.x2)) / 2, Y(env.y1) - 8, `FRONT ${base.setbacks.front}'`, { size: 10.5, fill: C.cyanDk, anchor: "middle" }),
    handLabel((X(env.x1) + X(env.x2)) / 2, Y(env.y2) + 34, `REAR ${base.setbacks.rear}'`, { size: 10.5, fill: C.cyanDk, anchor: "middle" }),
    handLabel(X(env.x1) + 8, (Y(env.y1) + Y(env.y2)) / 2, `LEFT ${base.setbacks.left}'`, { size: 10.5, fill: C.cyanDk, rot: -90, anchor: "middle" }),
    handLabel(X(env.x2) - 8, (Y(env.y1) + Y(env.y2)) / 2, `RIGHT ${base.setbacks.right}'`, { size: 10.5, fill: C.cyanDk, rot: 90, anchor: "middle" }),
  ] : [];
  const lblEase = ease ? handLabel(
    ease.from === "south" || ease.from === "north" ? X(ease.x2) + 14 : (X(ease.x1) + X(ease.x2)) / 2,
    ease.from === "south" || ease.from === "north" ? (Y(ease.y1) + Y(ease.y2)) / 2 + 30 : Y(ease.y2) - 10,
    `${Math.round(ease.w)}' ACCESS ESM'T`,
    { size: 11.5, fill: C.dim, rot: ease.from === "south" || ease.from === "north" ? -90 : 0, anchor: "middle" }) : null;
  const lblComp = handLabel((cnw[0] + cne[0]) / 2, csw[1] - 9, `${Math.round(comp.w)}'×${Math.round(comp.d)}' COMPOUND`, { size: 10, fill: C.navy, anchor: "middle" });
  const lblFZ = handLabel((X(T.x) + X(T.x + FZ.radius)) / 2, typ - 8, `R ${Math.round(FZ.radius)}'`, { size: 13, fill: C.amber, anchor: "middle", weight: 700 });
  const lblFZ2 = handLabel(X(T.x) + FZ.radius * S * 0.72, Y(T.y) + FZ.radius * S * 0.72, "FALL ZONE", { size: 12, fill: C.amber, rot: -45, anchor: "middle" });
  const lblTower = handLabel(
    txp + 68, typ - 42,
    `${Math.round(T.heightFt)}' ${(T.type || "Monopole").toUpperCase()}${meta.heightNote ? ` — ${meta.heightNote}` : ""}`,
    { size: 13, weight: 700 });
  const lblPE1 = pe ? handLabel(X(T.x - pe.fallZone.radius * 0.354) + 6, Y(T.y + pe.fallZone.radius * 0.354) - 6,
    `R ${Math.round(pe.fallZone.radius)}' (PE)`, { size: 12.5, fill: C.amber, anchor: "middle", rot: 45, weight: 700 }) : null;
  const lblPE2 = pe ? handLabel(X(T.x), Y(T.y) - pe.fallZone.radius * S - 12, "ENGINEERED FALL ZONE — PE", { size: 11.5, fill: C.cyanDk, anchor: "middle" }) : null;
  const lblNA = handLabel(NAx, NAy + 40, "TRUE N", { size: 12.5, anchor: "middle", weight: 700 });
  const lblSc0 = handLabel(sbx, sby + 16, "0", { size: 10.5, anchor: "middle" });
  const lblSc1 = handLabel(sbx + barPx, sby + 16, `${barFt} ft`, { size: 10.5, anchor: "middle" });
  const lblScT = handLabel(sbx + barPx + 30, sby - 1, "GRAPHIC SCALE — AUTHORITATIVE", { size: 10.5, fill: C.dim });
  const peNote = peInfo ? handLabel(hasElev ? Math.max(90, OX / 2 - 10) : 150, VH - 76,
    peInfo.accepted ? `PE FALL-ZONE CERT ACCEPTED (${peInfo.ruleLabel})` : `PE FALL-ZONE CERT — VERIFY W/ JURISDICTION`,
    { size: 11, fill: peInfo.accepted ? C.cyanDk : C.dim, anchor: "middle" }) : null;

  /* stamps */
  const VLABEL = { FITS: "FITS", CONDITIONAL: "CONDITIONAL", DOES_NOT_FIT: "DOES NOT FIT" };
  const VCOL = { FITS: C.green, CONDITIONAL: C.amber, DOES_NOT_FIT: C.red };
  function buildStamp(id, pos, rot, verdict, topline, subline) {
    const posG = el("g", { id: id + "Pos", transform: `translate(${pos[0]},${pos[1]}) rotate(${rot})` });
    const g2 = el("g", { id, class: "ls-stamp" }, posG);
    const lab = VLABEL[verdict], col = VCOL[verdict];
    const wS = verdict === "FITS" ? 276 : 328, hS = 118;
    el("rect", { x: -wS / 2, y: -hS / 2, width: wS, height: hS, rx: 12, fill: "none", stroke: col, "stroke-width": 4.5, "stroke-opacity": 0.9 }, g2);
    el("rect", { x: -wS / 2 + 9, y: -hS / 2 + 9, width: wS - 18, height: hS - 18, rx: 8, fill: col, "fill-opacity": 0.07, stroke: col, "stroke-width": 1.7, "stroke-opacity": 0.85 }, g2);
    const t1 = el("text", { y: -hS / 2 + 30, "text-anchor": "middle", "font-size": 11, "font-weight": 700, "letter-spacing": 3, fill: col, "fill-opacity": 0.9 }, g2);
    t1.style.fontFamily = UIF; t1.textContent = topline;
    const big = el("text", { y: verdict === "FITS" ? 26 : 20, "text-anchor": "middle", "font-size": verdict === "FITS" ? 58 : (verdict === "CONDITIONAL" ? 40 : 36), "font-weight": 900, "letter-spacing": verdict === "FITS" ? 8 : 3, fill: col }, g2);
    big.style.fontFamily = UIF; big.textContent = lab;
    const t2 = el("text", { y: hS / 2 - 14, "text-anchor": "middle", "font-size": 10.5, "font-weight": 700, "letter-spacing": 1, fill: col, "fill-opacity": 0.9 }, g2);
    t2.style.fontFamily = UIF; t2.textContent = subline;
    for (let i = 0; i < 7; i++) el("circle", { cx: (R() - 0.5) * wS * 0.85, cy: (R() - 0.5) * hS * 0.8, r: 2 + R() * 5, fill: C.paper, "fill-opacity": 0.5 + R() * 0.3 }, g2);
    return { g: g2, pos: posG };
  }
  const dateLabel = meta.dateLabel || "";
  const baseSub = base.verdict === "FITS" ? `SETBACKS ✓ · FALL ZONE ✓ · ${dateLabel}` :
    (base.verdict === "CONDITIONAL" && peInfo ? `FALL ZONE ENCROACHES — PE OPTION · ${dateLabel}` : `REVIEW REQ'D · ${dateLabel}`);
  const stampBase = buildStamp("lsStampBase", [852, 486], -9, base.verdict, "SITEHAWK · CONCEPT CHECK", baseSub);
  const stampPE = pe ? buildStamp("lsStampPE", [812, 436], -5, pe.verdict,
    peInfo && peInfo.accepted ? "SITEHAWK · PE CERTIFIED" : "SITEHAWK · PE CONCEPT",
    `ENG. FALL ZONE ${peInfo ? peInfo.ruleLabel : ""} ✓ · ${dateLabel}`) : null;

  /* pencil */
  const pencil = el("g", { opacity: 0 });
  const pIn = el("g", {}, pencil);
  el("path", { d: "M0,0 L10,-4 L10,4 Z", fill: C.ink }, pIn);
  el("rect", { x: 10, y: -4.5, width: 30, height: 9, rx: 2, fill: C.amber, stroke: C.ink, "stroke-width": 1 }, pIn);
  el("rect", { x: 40, y: -4.5, width: 7, height: 9, rx: 2.5, fill: C.cyan, stroke: C.ink, "stroke-width": 1 }, pIn);

  /* ── timeline ── */
  const TL = [];
  const cap = (t) => TL.push({ t: "c", v: t });
  const st = (p2, sp) => p2 && TL.push({ t: "s", el: p2, sp });
  const wait = (ms) => TL.push({ t: "p", v: ms });
  const on = (g2) => g2 && TL.push({ t: "r", el: g2 });
  const fill = (e2) => e2 && TL.push({ t: "f", el: e2 });
  const chip = (k) => TL.push({ t: "ch", v: k });
  const fn = (f) => TL.push({ t: "fn", v: f });
  const SPD = { slow: 0.62, med: 1.0, fast: 2.1, tick: 3.0 };

  cap("Reading Talon FT geometry for " + (meta.siteName || "the site") + "…"); wait(650);
  on(title); st(titleUL, SPD.tick); wait(280);

  cap(`Drafting the property boundary — ${P.acres.toFixed(2)} ac${P.isRect ? ` (${Math.round(P.width)}' × ${Math.round(P.depth)}')` : ` · ${n} sides`}`);
  for (let i = 0; i < n; i++) { st(edgeStrokes[i], n > 8 ? SPD.med : SPD.slow); on(edgeLabels[i]); }
  st(retrace, 4.2); chip("parcel"); wait(240);

  if (env.valid) {
    cap(`Dashing the setback envelope — F${base.setbacks.front}' R${base.setbacks.rear}' S${base.setbacks.left}'/${base.setbacks.right}'`);
    st(envDash, SPD.tick); fill(envFill); on(lblEnv); setbackLabels.forEach(on); chip("setbacks"); wait(240);
  }
  if (ease) {
    cap(`Routing the ${Math.round(ease.w)}' access easement`);
    st(easeA, SPD.med); st(easeB, SPD.med); st(easeHatch, SPD.tick); on(lblEase); chip("easement"); wait(220);
  }
  cap(`Fencing the ${Math.round(comp.w)}' × ${Math.round(comp.d)}' equipment compound`);
  st(compStroke, SPD.med); st(fence, SPD.tick); fill(compFill); on(lblComp); chip("compound"); wait(240);

  cap(`Sweeping the fall zone — R ${Math.round(FZ.radius)}'`);
  st(fzStroke, SPD.fast); fill(fallFill); st(radLine, SPD.med); on(lblFZ); on(lblFZ2); chip("fallzone");
  if (conflict) { fn(() => conflict.classList.add("on")); cap("Fall zone crosses the property line — flagged red"); wait(600); }
  on(peNote); if (peInfo) chip("pe"); wait(260);

  cap(`Setting the ${Math.round(T.heightFt)}' ${(T.type || "monopole").toLowerCase()}`);
  st(towerCross, SPD.med); st(towerTri, SPD.med); st(towerDot, SPD.med); st(towerLeader, SPD.med); on(lblTower); chip("tower"); wait(260);

  if (hasElev) {
    cap("Raising the tower — elevation view");
    for (const p2 of evParts) st(p2, p2 === evParts[1] || p2 === evParts[3] ? SPD.tick : SPD.med);
    for (const l2 of evLabels) on(l2);
    wait(240);
  }
  if (utilLines.length) {
    cap("Noting off-site utilities — fiber and power, with distance to the site");
    st(utilBox, SPD.tick); utilLabels.forEach(on); chip("utilities"); wait(260);
  }
  cap("True north and graphic scale");
  st(naCirc, SPD.med); st(naArrow, SPD.med); on(lblNA);
  st(scaleBar, SPD.fast); fill(scaleFill); on(lblSc0); on(lblSc1); on(lblScT); wait(300);

  cap("Checking the fit against setbacks and fall zone…"); wait(750);
  fn(() => { hidePencil(); landStamp(stampBase.g); });
  wait(600);
  const FINALCAP = `Verdict: ${VLABEL[base.verdict]} — ${base.verdictReason}` + (base.verdict !== "FITS" && pe ? "  →  Try the PE letter." : "");
  cap(FINALCAP);
  fn(() => { done = true; emitState(); onDone(); });

  /* PE sequences */
  const PEON = [], PEOFF = [];
  if (pe) {
    PEON.push({ t: "c", v: `Applying PE letter — engineered yield point caps the fall zone at ${peInfo ? peInfo.ruleLabel : "the certified radius"}` });
    PEON.push({ t: "fn", v: () => { [fzStroke, radLine, lblFZ, lblFZ2].forEach((x2) => x2.classList.add("ls-dim")); if (conflict) conflict.classList.remove("on"); fallFill.classList.remove("on"); } });
    PEON.push({ t: "p", v: 280 });
    PEON.push({ t: "s", el: peStroke, sp: SPD.fast });
    PEON.push({ t: "f", el: peFill });
    PEON.push({ t: "s", el: peRad, sp: SPD.med });
    PEON.push({ t: "r", el: lblPE1 });
    PEON.push({ t: "r", el: lblPE2 });
    PEON.push({ t: "p", v: 300 });
    PEON.push({ t: "fn", v: () => { hidePencil(); stampBase.pos.classList.add("ls-ghosted"); landStamp(stampPE.g); } });
    PEON.push({ t: "p", v: 420 });
    PEON.push({ t: "c", v: `Verdict: ${VLABEL[pe.verdict]} — ${pe.verdictReason}` });
    PEON.push({ t: "fn", v: () => emitState() });

    PEOFF.push({ t: "c", v: "PE letter removed — the full fall-zone rule governs" });
    PEOFF.push({ t: "fn", v: () => {
      [fzStroke, radLine, lblFZ, lblFZ2].forEach((x2) => x2.classList.remove("ls-dim"));
      if (conflict) conflict.classList.add("on");
      fallFill.classList.add("on");
      peStroke.style.strokeDashoffset = peStroke.__L; peRad.style.strokeDashoffset = peRad.__L;
      peFill.classList.remove("on"); lblPE1.classList.remove("on"); lblPE2.classList.remove("on");
      stampBase.pos.classList.remove("ls-ghosted"); stampPE.g.classList.remove("landed");
      landStamp(stampBase.g); hidePencil();
    } });
    PEOFF.push({ t: "p", v: 300 });
    PEOFF.push({ t: "c", v: FINALCAP });
    PEOFF.push({ t: "fn", v: () => emitState() });
  }

  /* ── runner ── */
  let Q = null, lastTs = null, running = false, done = false, mult = 1, peOn = false, destroyed = false;
  function emitState() { onState({ running, done, peOn }); }
  function prepare() {
    for (const item of [...TL, ...PEON]) if (item.t === "s") {
      const L = item.el.getTotalLength(); item.len = L; item.el.__L = L;
      item.el.style.strokeDasharray = L; item.el.style.strokeDashoffset = L;
    }
  }
  function pencilAt(p2) { pencil.setAttribute("transform", `translate(${p2.x.toFixed(1)},${p2.y.toFixed(1)}) rotate(-38)`); }
  function showPencil() { pencil.setAttribute("opacity", 1); }
  function hidePencil() { pencil.setAttribute("opacity", 0); }
  function landStamp(g2) {
    g2.classList.remove("landed"); void g2.getBoundingClientRect();
    g2.classList.add("landed");
    audioThud();
  }
  function tick(ts) {
    if (destroyed || !running || !Q) return;
    if (lastTs === null) lastTs = ts;
    let dt = Math.min(50, ts - lastTs) * mult; lastTs = ts;
    let guard = 0;
    while (dt >= 0 && guard++ < 400) {
      if (!Q.cur) {
        if (Q.i >= Q.list.length) { running = false; scratch(false); emitState(); Q = null; return; }
        Q.cur = Q.list[Q.i++];
        const c0 = Q.cur;
        if (c0.t === "c") { onCaption(c0.v); Q.cur = null; continue; }
        if (c0.t === "r") { if (c0.el) c0.el.classList.add("on"); Q.cur = null; continue; }
        if (c0.t === "f") { if (c0.el) c0.el.classList.add("on"); Q.cur = null; continue; }
        if (c0.t === "ch") { onChip(c0.v); Q.cur = null; continue; }
        if (c0.t === "fn") { c0.v(); Q.cur = null; continue; }
        if (c0.t === "s") { Q.prog = 0; showPencil(); scratch(true, c0.sp); }
        if (c0.t === "p") { c0.rem = c0.v; scratch(false); }
      }
      const c1 = Q.cur;
      if (c1.t === "s") {
        Q.prog += c1.sp * dt;
        if (Q.prog >= c1.len) {
          c1.el.style.strokeDashoffset = 0;
          const left = (Q.prog - c1.len) / c1.sp; dt = left; Q.cur = null; continue;
        }
        c1.el.style.strokeDashoffset = c1.len - Q.prog;
        try { pencilAt(c1.el.getPointAtLength(Q.prog)); } catch (e) { /* noop */ }
        dt = -1;
      } else if (c1.t === "p") {
        c1.rem -= dt;
        if (c1.rem <= 0) { dt = -c1.rem; Q.cur = null; continue; }
        if (c1.v > 250) hidePencil();
        dt = -1;
      }
    }
    requestAnimationFrame(tick);
  }
  function startQueue(list) { Q = { list, i: 0, cur: null, prog: 0 }; lastTs = null; running = true; emitState(); requestAnimationFrame(tick); }

  /* ── audio ── */
  let actx = null, noiseGain = null, noiseFilter = null, soundOn = true;
  function audioInit() {
    if (actx || !soundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; actx = new AC();
      const len = actx.sampleRate, buf = actx.createBuffer(1, len, actx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
      noiseFilter = actx.createBiquadFilter(); noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 1500; noiseFilter.Q.value = 0.8;
      noiseGain = actx.createGain(); noiseGain.gain.value = 0;
      src.connect(noiseFilter).connect(noiseGain).connect(actx.destination);
      src.start();
    } catch (e) { actx = null; }
  }
  function scratch(onOff, sp) {
    if (!actx || !noiseGain) return;
    try {
      const t = actx.currentTime;
      if (onOff && soundOn) {
        noiseFilter.frequency.setTargetAtTime(1100 + Math.random() * 900, t, 0.05);
        noiseGain.gain.setTargetAtTime(0.028 + Math.min(0.02, (sp || 1) * 0.008), t, 0.04);
      } else noiseGain.gain.setTargetAtTime(0, t, 0.06);
    } catch (e) { /* noop */ }
  }
  function audioThud() {
    if (!actx || !soundOn) return;
    try {
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.24);
    } catch (e) { /* noop */ }
  }

  /* ── controller ── */
  function finishAll() {
    running = false; Q = null; scratch(false);
    svg.classList.add("ls-noanim");
    for (const item of TL) {
      if (item.t === "s") item.el.style.strokeDashoffset = 0;
      else if ((item.t === "r" || item.t === "f") && item.el) item.el.classList.add("on");
      else if (item.t === "ch") onChip(item.v);
    }
    if (conflict) conflict.classList.add("on");
    stampBase.g.classList.add("landed");
    hidePencil();
    onCaption(FINALCAP);
    done = true; emitState(); onDone();
    void svg.getBoundingClientRect();
    setTimeout(() => svg.classList.remove("ls-noanim"), 60);
  }
  function resetPE() {
    peOn = false;
    if (pe) {
      [fzStroke, radLine, lblFZ, lblFZ2].forEach((x2) => x2.classList.remove("ls-dim"));
      peStroke.style.strokeDashoffset = peStroke.__L; peRad.style.strokeDashoffset = peRad.__L;
      peFill.classList.remove("on"); lblPE1.classList.remove("on"); lblPE2.classList.remove("on");
      stampBase.pos.classList.remove("ls-ghosted"); stampPE.g.classList.remove("landed");
    }
  }
  prepare();

  const chips = [
    { key: "parcel", label: `Parcel ${P.acres.toFixed(2)} ac${P.isRect ? ` · ${Math.round(P.width)}'×${Math.round(P.depth)}'` : ""}` },
    ...(env.valid ? [{ key: "setbacks", label: `Setbacks F${base.setbacks.front}/R${base.setbacks.rear}/S${base.setbacks.left}` }] : []),
    ...(ease ? [{ key: "easement", label: `Easement ${Math.round(ease.w)}'` }] : []),
    { key: "compound", label: `Compound ${Math.round(comp.w)}'×${Math.round(comp.d)}'` },
    { key: "fallzone", label: `Fall zone R${Math.round(FZ.radius)}'` },
    { key: "tower", label: `Tower ${Math.round(T.heightFt)}' ${T.type || "Monopole"}` },
    ...(utilLines.length ? [{ key: "utilities", label: utilLines.map((u) => u.text).join(" · ") }] : []),
    ...(peInfo ? [{ key: "pe", label: peInfo.accepted ? `PE letter accepted (${peInfo.ruleLabel})` : "PE letter — verify ordinance" }] : []),
  ];

  return {
    chips,
    start() {
      if (destroyed || running || done) return;
      audioInit();
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { finishAll(); return; }
      startQueue(TL);
    },
    skip() { if (!destroyed && !done) finishAll(); },
    clear() {
      if (destroyed || running) return;
      done = false; Q = null; scratch(false);
      svg.classList.add("ls-noanim");
      for (const item of TL) {
        if (item.t === "s") item.el.style.strokeDashoffset = item.len;
        else if ((item.t === "r" || item.t === "f") && item.el) item.el.classList.remove("on");
      }
      if (conflict) conflict.classList.remove("on");
      stampBase.g.classList.remove("landed");
      resetPE(); hidePencil(); emitState();
      void svg.getBoundingClientRect();
      svg.classList.remove("ls-noanim");
    },
    replay() {
      if (destroyed || running) return;
      done = false;
      svg.classList.add("ls-noanim");
      for (const item of TL) {
        if (item.t === "s") item.el.style.strokeDashoffset = item.len;
        else if ((item.t === "r" || item.t === "f") && item.el) item.el.classList.remove("on");
      }
      if (conflict) conflict.classList.remove("on");
      stampBase.g.classList.remove("landed");
      resetPE();
      void svg.getBoundingClientRect();
      svg.classList.remove("ls-noanim");
      startQueue(TL);
    },
    applyPE() { if (!destroyed && done && !running && pe && !peOn) { peOn = true; startQueue(PEON); } },
    revertPE() { if (!destroyed && done && !running && pe && peOn) { peOn = false; startQueue(PEOFF); } },
    setSpeed(m) { mult = m; },
    setSound(v) { soundOn = v; if (!v) scratch(false); },
    destroy() {
      destroyed = true; running = false; Q = null;
      try { if (actx) actx.close(); } catch (e) { /* noop */ }
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    },
  };
}