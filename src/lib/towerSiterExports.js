// HawkPerch — export + bearing helpers. NOT A SURVEY disclaimer is
// non-negotiable on every export, both exhibits.

export const NOT_A_SURVEY = "NOT A SURVEY — PRELIMINARY SITING ONLY";

/* ---- bearing-style boundary calls synthesized from polygon edges (feet frame) ---- */
export function synthesizeCalls(ringFt) {
  const calls = [];
  for (let i = 0; i < ringFt.length - 1; i++) {
    const [x1, y1] = ringFt[i];
    const [x2, y2] = ringFt[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) continue;
    let az = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (az < 0) az += 360;
    calls.push({ bearing: azimuthToBearing(az), distance_ft: dist, mid: [(x1 + x2) / 2, (y1 + y2) / 2], angle: az });
  }
  return calls;
}

export function azimuthToBearing(az) {
  let ns, ew, ang;
  if (az <= 90) { ns = "N"; ew = "E"; ang = az; }
  else if (az <= 180) { ns = "S"; ew = "E"; ang = 180 - az; }
  else if (az <= 270) { ns = "S"; ew = "W"; ang = az - 180; }
  else { ns = "N"; ew = "W"; ang = 360 - az; }
  const d = Math.floor(ang);
  const m = Math.round((ang - d) * 60);
  return `${ns} ${d}\u00B0${String(m).padStart(2, "0")}\u2032 ${ew}`;
}

/* ---- SVG node → PNG download at 2x ---- */
export async function svgToPngDownload(svgNode, filename) {
  const xml = new XMLSerializer().serializeToString(svgNode);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const vb = svgNode.viewBox.baseVal;
  const canvas = document.createElement("canvas");
  canvas.width = vb.width * 2;
  canvas.height = vb.height * 2;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  ctx.drawImage(img, 0, 0, vb.width, vb.height);
  URL.revokeObjectURL(url);
  triggerDownload(canvas.toDataURL("image/png"), filename);
}

/* ---- Exhibit B — Mapbox Static Images PNG with encoded GeoJSON overlay ---- */
export async function exportExhibitB({ token, result, watermark, jurisdiction, filename }) {
  const simple = (geom, props) => ({ type: "Feature", properties: props, geometry: geom.geometry ?? geom });
  const features = [
    simple(result.parcel, { stroke: "#ffffff", "stroke-width": 2.5, "fill-opacity": 0 }),
  ];
  if (result.envelope)
    features.push(simple(result.envelope, { stroke: "#14b8a6", "stroke-width": 2, fill: "#14b8a6", "fill-opacity": 0.12 }));
  if (result.checks?.fallZone?.circle)
    features.push(simple(result.checks.fallZone.circle, {
      stroke: result.checks.fallZone.status === "pass" ? "#22d3ee" : "#f97316",
      "stroke-width": 2, fill: "#22d3ee", "fill-opacity": 0.18,
    }));
  if (result.compound?.lonLat)
    features.push(simple(result.compound.lonLat, { stroke: "#f59e0b", "stroke-width": 2, fill: "#f59e0b", "fill-opacity": 0.45 }));
  features.push({
    type: "Feature",
    properties: { "marker-color": "#f59e0b", "marker-size": "small" },
    geometry: { type: "Point", coordinates: result.towerLonLat },
  });

  const gj = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }));
  const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/geojson(${gj})/auto/1280x960@2x?padding=60&access_token=${token}`;

  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("Mapbox static image failed — parcel may be too complex for a static export.")); img.src = url; });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height + 90;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0a0f1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  // title strip + disclaimer (non-negotiable)
  ctx.fillStyle = "#0a0f1a";
  ctx.fillRect(0, img.height, canvas.width, 90);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px 'IBM Plex Mono', monospace";
  ctx.fillText(`SITEHAWK TOWER SITER \u00B7 EXHIBIT B \u00B7 ${(jurisdiction || "—").toUpperCase()} \u00B7 ${new Date().toLocaleDateString()}`, 30, img.height + 38);
  ctx.fillStyle = "#f87171";
  ctx.font = "bold 26px 'IBM Plex Mono', monospace";
  ctx.fillText(NOT_A_SURVEY, 30, img.height + 74);

  if (watermark) {
    ctx.save();
    ctx.translate(canvas.width / 2, img.height / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.font = "bold 110px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.textAlign = "center";
    ctx.fillText("PRELIMINARY — SITEHAWK", 0, 0);
    ctx.restore();
  }

  triggerDownload(canvas.toDataURL("image/png"), filename);
}

function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}