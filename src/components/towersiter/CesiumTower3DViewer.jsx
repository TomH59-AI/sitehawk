/**
 * CesiumTower3DViewer — full-screen Cesium 1.118 3D tower placement preview.
 * Renders a self-contained HTML string into a sandboxed <iframe srcdoc>.
 * No separate HTML file needed — all Cesium JS/CSS loaded from CDN inside the iframe.
 *
 * Props:
 *   render   — Tower3DRender entity record
 *   cesiumToken — Cesium Ion access token
 *   onClose  — callback to close
 */
import { useEffect, useRef, useState } from "react";
import { X, Loader2, Camera, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const COMPOUND_OPTIONS = ["50x50", "75x75", "100x100"];
const BUFFER_OPTIONS = [10, 25, 50];
const HEIGHT_OPTIONS = [150, 199, 250];

function buildCesiumHtml(render, cesiumToken) {
  const {
    parcel_geojson,
    centroid_lat,
    centroid_lon,
    tower_height_ft = 199,
    compound_width_ft = 75,
    compound_depth_ft = 75,
    buffer_ft = 25,
    property_address = "",
    site_name = "Target A",
  } = render;

  const parcelGeoJsonStr = JSON.stringify(parcel_geojson || null);
  const towerHeightM = (tower_height_ft * 0.3048).toFixed(2);
  const compoundWM = (compound_width_ft * 0.3048).toFixed(2);
  const compoundDM = (compound_depth_ft * 0.3048).toFixed(2);
  const bufferM = (buffer_ft * 0.3048).toFixed(2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>3D Tower Preview — ${site_name}</title>
<script src="https://cesium.com/downloads/cesiumjs/releases/1.118/Build/Cesium/Cesium.js"></script>
<link href="https://cesium.com/downloads/cesiumjs/releases/1.118/Build/Cesium/Widgets/widgets.css" rel="stylesheet"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body,#cesiumContainer { width:100%; height:100%; overflow:hidden; background:#0a0a14; }
  #controls {
    position:absolute; top:10px; right:10px; z-index:100;
    background:rgba(10,15,35,0.92); border:1px solid rgba(255,255,255,0.15);
    border-radius:12px; padding:14px 16px; color:#fff; font-family:sans-serif;
    font-size:13px; min-width:220px; backdrop-filter:blur(8px);
  }
  #controls h3 { font-size:14px; font-weight:700; margin-bottom:10px; color:#7dd3fc; }
  .ctrl-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; gap:8px; }
  .ctrl-row label { color:#94a3b8; font-size:12px; }
  .ctrl-row select {
    background:#1e293b; border:1px solid #334155; color:#f1f5f9;
    border-radius:6px; padding:3px 7px; font-size:12px; cursor:pointer;
  }
  .btn-row { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; }
  .btn {
    flex:1; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:600;
    cursor:pointer; border:none; transition:background 0.15s;
  }
  .btn-primary { background:#2563eb; color:#fff; }
  .btn-primary:hover { background:#1d4ed8; }
  .btn-secondary { background:#1e293b; color:#94a3b8; border:1px solid #334155; }
  .btn-secondary:hover { background:#334155; color:#f1f5f9; }
  #disclaimer {
    position:absolute; top:0; left:0; right:0; z-index:99;
    background:#991b1b; color:#fca5a5; text-align:center;
    padding:7px 16px; font-size:12px; font-weight:600; font-family:sans-serif;
    letter-spacing:0.02em;
  }
  #loading {
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,0.7); z-index:200; color:#fff; font-family:sans-serif;
    font-size:15px; gap:12px; flex-direction:column;
  }
  .spinner {
    width:36px; height:36px; border:4px solid rgba(255,255,255,0.15);
    border-top-color:#3b82f6; border-radius:50%; animation:spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform:rotate(360deg); } }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div><span>Loading 3D terrain…</span></div>
<div id="disclaimer">
  ⚠ ILLUSTRATIVE CONCEPT — NOT A SURVEY. Parcel outline and tower height are to scale; the monopole, fence, gravel pad, and landscaped buffer are shown at exaggerated scale so placement is easy to see. Final dimensions set after site walk &amp; survey.
</div>
<div id="cesiumContainer"></div>
<div id="controls">
  <h3>🗼 3D Tower Preview</h3>
  <div style="color:#64748b;font-size:11px;margin-bottom:8px;word-break:break-all">${property_address || site_name}</div>
  <div class="ctrl-row">
    <label>Compound size</label>
    <select id="selCompound">
      <option value="50x50">50×50 ft</option>
      <option value="75x75" selected>75×75 ft</option>
      <option value="100x100">100×100 ft</option>
    </select>
  </div>
  <div class="ctrl-row">
    <label>Landscape buffer</label>
    <select id="selBuffer">
      <option value="10">10 ft</option>
      <option value="25" selected>25 ft</option>
      <option value="50">50 ft</option>
    </select>
  </div>
  <div class="ctrl-row">
    <label>Tower height</label>
    <select id="selHeight">
      <option value="150">150 ft</option>
      <option value="199" selected>199 ft</option>
      <option value="250">250 ft</option>
    </select>
  </div>
  <div class="btn-row">
    <button class="btn btn-primary" id="btnRender">⟳ Generate 3D</button>
  </div>
  <div class="btn-row">
    <button class="btn btn-secondary" id="btnOrbit">🎬 Cinematic Orbit</button>
    <button class="btn btn-secondary" id="btnTop">⬆ Top-down</button>
  </div>
  <div class="btn-row" style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px">
    <button class="btn" id="btnCapture" style="background:#7c3aed;color:#fff;flex:1">📸 Capture frame → packet</button>
  </div>
  <div id="captureStatus" style="display:none;margin-top:8px;font-size:11px;color:#86efac;text-align:center"></div>
</div>
<script>
Cesium.Ion.defaultAccessToken = "${cesiumToken}";

const viewer = new Cesium.Viewer("cesiumContainer", {
  terrainProvider: Cesium.createWorldTerrain(),
  baseLayerPicker: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  geocoder: false,
  homeButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  shadows: true,
  terrainShadows: Cesium.ShadowMode.ENABLED,
});
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.depthTestAgainstTerrain = true;

// Satellite imagery
viewer.imageryLayers.removeAll();
viewer.imageryLayers.addImageryProvider(new Cesium.IonImageryProvider({ assetId: 2 }));

const scene = viewer.scene;
const ellipsoid = scene.globe.ellipsoid;

// --- Constants ---
const LAT = ${centroid_lat};
const LON = ${centroid_lon};
const PARCEL_GEOJSON = ${parcelGeoJsonStr};

let orbitActive = false;
let orbitHandle = null;

// Remove loading overlay once globe tiles start rendering
const removeLoading = () => {
  const el = document.getElementById("loading");
  if (el) el.style.display = "none";
};
viewer.scene.globe.tileLoadProgressEvent.addEventListener((queueLength) => {
  if (queueLength === 0) removeLoading();
});
setTimeout(removeLoading, 6000);

// ── Helpers ──────────────────────────────────────────────────────────────────
function metersToCartesian(lon, lat, altOffset = 0) {
  return Cesium.Cartesian3.fromDegrees(lon, lat, altOffset);
}

// Convert feet to degrees lat/lon offset (approximate at the site latitude)
const FT_TO_M = 0.3048;
const DEG_PER_M_LAT = 1 / 111320;
const DEG_PER_M_LON = 1 / (111320 * Math.cos(LAT * Math.PI / 180));

function offsetDeg(latDeg, lonDeg, northFt, eastFt) {
  return {
    lat: latDeg + northFt * FT_TO_M * DEG_PER_M_LAT,
    lon: lonDeg + eastFt * FT_TO_M * DEG_PER_M_LON,
  };
}

// Build a rectangle of Cartesian3 corners (clamped) for compound/fence
function rectCorners(lat, lon, wFt, dFt) {
  const hw = wFt / 2, hd = dFt / 2;
  return [
    offsetDeg(lat, lon, -hd, -hw),
    offsetDeg(lat, lon, -hd,  hw),
    offsetDeg(lat, lon,  hd,  hw),
    offsetDeg(lat, lon,  hd, -hw),
  ].map(c => Cesium.Cartesian3.fromDegrees(c.lon, c.lat));
}

// ── Entity refs (so we can clear and re-render) ───────────────────────────────
let entityGroup = [];
function clearEntities() {
  entityGroup.forEach(e => viewer.entities.remove(e));
  entityGroup = [];
}
function addEnt(e) {
  entityGroup.push(viewer.entities.add(e));
}

// ── Main render function ──────────────────────────────────────────────────────
function renderAll(compoundWFt, compoundDFt, bufferFt, towerHFt) {
  clearEntities();

  const towerHM = towerHFt * FT_TO_M;
  const compWM = compoundWFt * FT_TO_M;
  const compDM = compoundDFt * FT_TO_M;
  const bufM = bufferFt * FT_TO_M;

  // 1. Parcel boundary (to-scale, clamped to terrain)
  if (PARCEL_GEOJSON && PARCEL_GEOJSON.coordinates) {
    const coords = PARCEL_GEOJSON.coordinates[0];
    const positions = coords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]));
    addEnt({
      polyline: {
        positions,
        width: 3,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Cesium.Color.YELLOW,
        }),
        clampToGround: true,
      }
    });
    // Faint fill
    addEnt({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: Cesium.Color.YELLOW.withAlpha(0.08),
        outline: false,
        perPositionHeight: false,
        classificationType: Cesium.ClassificationType.TERRAIN,
      }
    });
  }

  // 2. Gravel compound pad (extruded rectangle, slightly exaggerated)
  const padPos = Cesium.Cartesian3.fromDegrees(LON, LAT, 0.5);
  addEnt({
    position: padPos,
    box: {
      dimensions: new Cesium.Cartesian3(compWM * 1.2, compDM * 1.2, 0.3),
      material: Cesium.Color.fromCssColorString("#8B7355").withAlpha(0.9),
      outline: false,
    }
  });

  // 3. Perimeter fence wall (4 thin tall boxes)
  const fenceH = 3.0; // 10 ft fence in meters
  const fenceThick = 0.15;
  const fw = compWM * 1.2, fd = compDM * 1.2;
  // North/South walls
  [[0, fd/2], [0, -fd/2]].forEach(([ex, ey]) => {
    const p = offsetDeg(LAT, LON, ey / FT_TO_M, ex / FT_TO_M);
    addEnt({
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, fenceH / 2 + 0.3),
      box: {
        dimensions: new Cesium.Cartesian3(fw, fenceThick, fenceH),
        material: Cesium.Color.fromCssColorString("#9CA3AF").withAlpha(0.85),
      }
    });
  });
  // East/West walls
  [[fw/2, 0], [-fw/2, 0]].forEach(([ex, ey]) => {
    const p = offsetDeg(LAT, LON, ey / FT_TO_M, ex / FT_TO_M);
    addEnt({
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, fenceH / 2 + 0.3),
      box: {
        dimensions: new Cesium.Cartesian3(fenceThick, fd, fenceH),
        material: Cesium.Color.fromCssColorString("#9CA3AF").withAlpha(0.85),
      }
    });
  });

  // 4. Landscape buffer trees (ring of cylinders around the compound)
  const bufTotalW = (compoundWFt / 2 + bufferFt) * FT_TO_M;
  const bufTotalD = (compoundDFt / 2 + bufferFt) * FT_TO_M;
  const treeR = Math.max(bufM * 0.35, 1.5);
  const treeH = Math.max(bufM * 0.9, 4);
  const spacing = treeR * 2.8;
  const treeColor = Cesium.Color.fromCssColorString("#166534").withAlpha(0.85);
  // Place trees evenly around the buffer ring perimeter
  for (let side = 0; side < 4; side++) {
    const isNS = side % 2 === 0;
    const sign = side < 2 ? 1 : -1;
    const fixedOff = (isNS ? bufTotalD : bufTotalW) * sign;
    const range = isNS ? bufTotalW : bufTotalD;
    for (let x = -range; x <= range; x += spacing) {
      const n = isNS ? fixedOff : x;
      const e = isNS ? x : fixedOff;
      const p = offsetDeg(LAT, LON, n / FT_TO_M, e / FT_TO_M);
      const trunkH = treeH * 0.35;
      const canopyH = treeH * 0.75;
      // Trunk
      addEnt({
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, trunkH / 2 + 0.3),
        cylinder: {
          length: trunkH,
          topRadius: treeR * 0.12,
          bottomRadius: treeR * 0.18,
          material: Cesium.Color.fromCssColorString("#78350f").withAlpha(0.9),
        }
      });
      // Canopy
      addEnt({
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, trunkH + canopyH / 2 + 0.3),
        cylinder: {
          length: canopyH,
          topRadius: 0.2,
          bottomRadius: treeR * 0.95,
          material: treeColor,
          outline: false,
        }
      });
    }
  }

  // 5. Monopole tower — tapering cylinder, to-scale height, exaggerated girth
  const BASE_R = Math.max(towerHM * 0.012, 0.5);   // exaggerated girth
  const TOP_R  = Math.max(towerHM * 0.005, 0.2);
  addEnt({
    position: Cesium.Cartesian3.fromDegrees(LON, LAT, towerHM / 2 + 0.5),
    cylinder: {
      length: towerHM,
      topRadius: TOP_R,
      bottomRadius: BASE_R,
      material: Cesium.Color.fromCssColorString("#D1D5DB"),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString("#6B7280"),
    }
  });

  // Top platform disc
  addEnt({
    position: Cesium.Cartesian3.fromDegrees(LON, LAT, towerHM + 0.5),
    cylinder: {
      length: 0.6,
      topRadius: TOP_R * 2.5,
      bottomRadius: TOP_R * 2.5,
      material: Cesium.Color.fromCssColorString("#374151"),
    }
  });

  // 3 antenna panels at 120° intervals
  const antennaPanelH = Math.max(towerHM * 0.08, 1.2);
  const antennaPanelW = 0.25;
  const antennaPanelD = 0.08;
  const antennaR = TOP_R * 2.2;
  [0, 120, 240].forEach(deg => {
    const rad = deg * Math.PI / 180;
    const off = offsetDeg(LAT, LON, (antennaR * Math.cos(rad)) / FT_TO_M, (antennaR * Math.sin(rad)) / FT_TO_M);
    addEnt({
      position: Cesium.Cartesian3.fromDegrees(off.lon, off.lat, towerHM - antennaPanelH / 2 + 0.5),
      box: {
        dimensions: new Cesium.Cartesian3(antennaPanelW, antennaPanelD, antennaPanelH),
        material: Cesium.Color.fromCssColorString("#1e3a5f"),
      }
    });
  });

  // Red aviation beacon
  addEnt({
    position: Cesium.Cartesian3.fromDegrees(LON, LAT, towerHM + 1.2),
    ellipsoid: {
      radii: new Cesium.Cartesian3(0.35, 0.35, 0.35),
      material: Cesium.Color.RED.withAlpha(0.95),
    }
  });

  // Label
  addEnt({
    position: Cesium.Cartesian3.fromDegrees(LON, LAT, towerHM + 8),
    label: {
      text: towerHFt + " ft AGL",
      font: "bold 14px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -8),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    }
  });
}

// ── Camera helpers ────────────────────────────────────────────────────────────
// Frame tightly on the tower using an explicit bounding sphere so terrain-clamped
// parcel geometry never inflates the camera distance.
function flyToSite(towerHFt) {
  const towerHM = towerHFt * FT_TO_M;
  // Center the sphere at ~45% of tower height so the mid-tower is in frame
  const center = Cesium.Cartesian3.fromDegrees(LON, LAT, towerHM * 0.45);
  const range = towerHM * 1.5 + 55; // ~140 m for a 199 ft tower
  viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(center, 1),
    {
      duration: 2.5,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(35),
        Cesium.Math.toRadians(-18),
        range
      ),
    }
  );
}

function topDown() {
  stopOrbit();
  // Fly straight down to ~165 m over the centroid — tight enough to see pad + buffer
  viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(LON, LAT, 0), 1),
    {
      duration: 1.8,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(0),
        Cesium.Math.toRadians(-90),
        165
      ),
    }
  );
}

function stopOrbit() {
  orbitActive = false;
  if (orbitHandle) { orbitHandle(); orbitHandle = null; }
  document.getElementById("btnOrbit").textContent = "🎬 Cinematic Orbit";
}

function startOrbit() {
  orbitActive = true;
  document.getElementById("btnOrbit").textContent = "⏹ Stop Orbit";
  const towerHFt = Number(document.getElementById("selHeight").value);
  const towerHM = towerHFt * FT_TO_M;
  const center = Cesium.Cartesian3.fromDegrees(LON, LAT, towerHM * 0.45);
  const ORBIT_RADIUS = towerHM * 1.5 + 55; // match flyToSite range
  const ORBIT_HEIGHT = towerHM * 0.85 + 30; // roughly mid-tower altitude
  let startTime = Date.now();
  orbitHandle = viewer.clock.onTick.addEventListener(() => {
    if (!orbitActive) return;
    const t = (Date.now() - startTime) / 1000;
    const angle = t * 0.18; // slow orbit
    const x = Math.cos(angle) * ORBIT_RADIUS;
    const y = Math.sin(angle) * ORBIT_RADIUS;
    const camLon = LON + x * DEG_PER_M_LON;
    const camLat = LAT + y * DEG_PER_M_LAT;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(camLon, camLat, ORBIT_HEIGHT),
      orientation: {
        heading: Math.atan2(-y, -x),
        pitch: Cesium.Math.toRadians(-18),
        roll: 0,
      }
    });
  });
}

// ── Frame capture with disclaimer + caption composite ────────────────────────
function captureFrame() {
  const btn = document.getElementById("btnCapture");
  const statusEl = document.getElementById("captureStatus");
  btn.disabled = true;
  btn.textContent = "Capturing…";
  statusEl.style.display = "none";

  // Force Cesium to render one fresh frame, then grab the canvas
  viewer.render();
  setTimeout(() => {
    try {
      const compStr = document.getElementById("selCompound").value;
      const bufFt = document.getElementById("selBuffer").value;
      const hFt = document.getElementById("selHeight").value;

      // Find the Cesium WebGL canvas
      const cesiumCanvas = viewer.scene.canvas;
      const W = cesiumCanvas.width;
      const H = cesiumCanvas.height;

      const DISC_H = Math.round(H * 0.048);   // disclaimer bar ~5% height
      const CAP_H  = Math.round(H * 0.058);   // caption bar ~6% height
      const TOTAL_H = H + DISC_H + CAP_H;

      const out = document.createElement("canvas");
      out.width = W;
      out.height = TOTAL_H;
      const ctx = out.getContext("2d");

      // 1. Disclaimer bar (red)
      ctx.fillStyle = "#991b1b";
      ctx.fillRect(0, 0, W, DISC_H);
      ctx.fillStyle = "#fca5a5";
      ctx.font = "bold " + Math.round(DISC_H * 0.52) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        "⚠ ILLUSTRATIVE CONCEPT — NOT A SURVEY  ·  Parcel & tower height to scale; compound/buffer/fence exaggerated for visibility",
        W / 2, DISC_H / 2
      );

      // 2. Cesium scene
      ctx.drawImage(cesiumCanvas, 0, DISC_H, W, H);

      // 3. Caption bar (dark navy)
      const captionY = DISC_H + H;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, captionY, W, CAP_H);
      const siteName = "${site_name}";
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" });
      const captionText = siteName + "  ·  Tower: " + hFt + " ft AGL  ·  Compound: " + compStr + " ft  ·  Buffer: " + bufFt + " ft  ·  " + dateStr;
      ctx.fillStyle = "#cbd5e1";
      ctx.font = Math.round(CAP_H * 0.38) + "px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(captionText, Math.round(W * 0.015), captionY + CAP_H / 2);

      // Skywave watermark right-aligned
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.font = "bold " + Math.round(CAP_H * 0.32) + "px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("SiteHawk · HawkPerch 3D", W - Math.round(W * 0.015), captionY + CAP_H / 2);

      const dataUrl = out.toDataURL("image/png");

      window.parent.postMessage({
        type: "sitehawk:3d-snapshot",
        dataUrl,
        site_name: siteName,
        tower_height_ft: Number(hFt),
        compound_size: compStr,
        buffer_ft: Number(bufFt),
        captured_at: now.toISOString(),
      }, "*");

      statusEl.textContent = "✓ Sending to packet…";
      statusEl.style.display = "block";
      btn.textContent = "📸 Capture frame → packet";
      btn.disabled = false;
    } catch(e) {
      btn.textContent = "📸 Capture frame → packet";
      btn.disabled = false;
      statusEl.textContent = "Capture failed: " + e.message;
      statusEl.style.color = "#fca5a5";
      statusEl.style.display = "block";
    }
  }, 300);
}

// ── Control events ────────────────────────────────────────────────────────────
document.getElementById("btnRender").addEventListener("click", () => {
  const compStr = document.getElementById("selCompound").value;
  const [cw, cd] = compStr.split("x").map(Number);
  const bufFt = Number(document.getElementById("selBuffer").value);
  const hFt = Number(document.getElementById("selHeight").value);
  renderAll(cw, cd, bufFt, hFt);
  flyToSite(hFt);
  window.parent.postMessage({ type: "3d_settings", compound: compStr, buffer: bufFt, height: hFt }, "*");
});

document.getElementById("btnOrbit").addEventListener("click", () => {
  if (orbitActive) stopOrbit();
  else startOrbit();
});

document.getElementById("btnTop").addEventListener("click", topDown);
document.getElementById("btnCapture").addEventListener("click", captureFrame);

// ── Init: set selectors from record values, render, fly ───────────────────────
const initCompound = "${render.compound_size || "75x75"}";
const initBuffer = "${render.buffer_ft || 25}";
const initHeight = "${render.tower_height_ft || 199}";

document.getElementById("selCompound").value = initCompound;
document.getElementById("selBuffer").value = initBuffer;
document.getElementById("selHeight").value = initHeight;

const [initW, initD] = initCompound.split("x").map(Number);
renderAll(initW, initD, Number(initBuffer), Number(initHeight));
setTimeout(() => flyToSite(Number(initHeight)), 2000);
</script>
</body>
</html>`;
}

export default function CesiumTower3DViewer({ render, cesiumToken, onClose, onSettingsChange, onSnapshot }) {
  const iframeRef = useRef(null);
  const [htmlContent, setHtmlContent] = useState("");
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotSaved, setSnapshotSaved] = useState(false);

  useEffect(() => {
    if (!render || !cesiumToken) return;
    setHtmlContent(buildCesiumHtml(render, cesiumToken));
  }, [render?.id, cesiumToken, render?.tower_height_ft, render?.compound_width_ft, render?.buffer_ft]);

  // Listen for settings updates AND snapshot messages from the iframe
  useEffect(() => {
    const handler = async (e) => {
      if (e.data?.type === "3d_settings") {
        onSettingsChange?.(e.data);
        return;
      }

      if (e.data?.type === "sitehawk:3d-snapshot") {
        const { dataUrl, site_name, tower_height_ft, compound_size, buffer_ft, captured_at } = e.data;
        if (!dataUrl || !render?.id) return;
        setSnapshotSaving(true);
        setSnapshotSaved(false);
        try {
          // Convert dataUrl → Blob → File
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], `3d-snapshot-${Date.now()}.png`, { type: "image/png" });

          // Upload via UploadFile integration
          const { file_url } = await base44.integrations.Core.UploadFile({ file });

          // Persist URL on the Tower3DRender record
          await base44.entities.Tower3DRender.update(render.id, {
            snapshot_image_url: file_url,
            status: "ready",
          });

          setSnapshotSaved(true);
          toast.success("Saved to packet ✓");
          onSnapshot?.({ file_url, site_name, tower_height_ft, compound_size, buffer_ft, captured_at });

          // Auto-clear the confirmation after 4 s
          setTimeout(() => setSnapshotSaved(false), 4000);
        } catch (err) {
          console.error("Snapshot upload failed:", err);
          toast.error("Could not save snapshot to packet.");
        } finally {
          setSnapshotSaving(false);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [render?.id, onSettingsChange, onSnapshot]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a0f1e] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white font-bold text-sm font-heading">
            3D Tower Preview — {render?.site_name || "Target A"}
          </span>
          <span className="text-white/40 text-xs ml-2">{render?.property_address}</span>

          {/* Snapshot status pill */}
          {snapshotSaving && (
            <span className="ml-3 flex items-center gap-1.5 text-xs text-purple-300">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving to packet…
            </span>
          )}
          {snapshotSaved && !snapshotSaving && (
            <span className="ml-3 flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved to packet ✓
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-white/60 hover:text-white hover:bg-white/10"
          onClick={onClose}
        >
          <X className="w-4 h-4 mr-1" /> Close
        </Button>
      </div>

      {/* Cesium iframe */}
      <div className="flex-1 relative">
        {htmlContent ? (
          <iframe
            ref={iframeRef}
            srcDoc={htmlContent}
            title="Cesium 3D Tower Preview"
            className="w-full h-full border-0"
            sandbox="allow-scripts"
            allow="fullscreen"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white/50 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Loading 3D viewer…</span>
          </div>
        )}
      </div>
    </div>
  );
}