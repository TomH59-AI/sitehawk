/**
 * CesiumTower3DViewer — hardened full-screen Cesium 3D tower preview.
 *
 * Hardening:
 * - CDN fallback chain (jsdelivr → unpkg → cesium.com)
 * - isDestroyed() guards on all camera/scene/capture calls
 * - StrictMode-safe: cancels async terrain-wait if unmounted
 * - try/catch around viewer creation and initial render; shows error in red bar
 * - Accepts Polygon, MultiPolygon, or Feature parcel geometry
 * - Centroid falls back to ring average if centroid_lat/lon missing
 */
import { useEffect, useRef, useState } from "react";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

// CDN fallback list — first one that loads wins
const CDN_CANDIDATES = [
  "https://cdn.jsdelivr.net/npm/cesium@1.118.0/Build/Cesium",
  "https://unpkg.com/cesium@1.118.0/Build/Cesium",
  "https://cesium.com/downloads/cesiumjs/releases/1.118/Build/Cesium",
];

function centroidFromGeojson(geojson) {
  try {
    const g = geojson?.type === "Feature" ? geojson.geometry : geojson;
    if (!g) return null;
    let ring = null;
    if (g.type === "Polygon") ring = g.coordinates?.[0];
    else if (g.type === "MultiPolygon") ring = g.coordinates?.[0]?.[0];
    if (!ring?.length) return null;
    let sumLon = 0, sumLat = 0;
    for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
    return { lat: sumLat / ring.length, lon: sumLon / ring.length };
  } catch { return null; }
}

function normaliseGeometry(geojson) {
  if (!geojson) return null;
  if (geojson.type === "Feature") return geojson.geometry;
  if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") return geojson;
  return null;
}

function buildCesiumHtml(render, cesiumToken) {
  // Resolve centroid
  let lat = render.centroid_lat;
  let lon = render.centroid_lon;
  if (!lat || !lon) {
    const derived = centroidFromGeojson(render.parcel_geojson);
    if (derived) { lat = derived.lat; lon = derived.lon; }
  }
  if (!lat || !lon) return null;

  const parcelGeom = normaliseGeometry(render.parcel_geojson);
  const parcelGeoJsonStr = JSON.stringify(parcelGeom || null);

  const {
    tower_height_ft = 199,
    compound_width_ft = 75,
    compound_depth_ft = 75,
    buffer_ft = 25,
    property_address = "",
    site_name = "Target A",
    compound_size = "75x75",
  } = render;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>3D Tower Preview</title>
<script>
// CDN fallback loader — tries each CDN in order
(function() {
  var cdns = ${JSON.stringify(CDN_CANDIDATES)};
  var idx = 0;
  function tryNext() {
    if (idx >= cdns.length) {
      document.getElementById('cdn-error').style.display='flex';
      document.getElementById('loading').style.display='none';
      return;
    }
    var base = cdns[idx++];
    var s = document.createElement('script');
    s.src = base + '/Cesium.js';
    s.onload = function() {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = base + '/Widgets/widgets.css';
      document.head.appendChild(link);
      window.__cesiumBase = base;
      initCesium();
    };
    s.onerror = tryNext;
    document.head.appendChild(s);
  }
  tryNext();
})();
</script>
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
.btn { flex:1; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; border:none; transition:background 0.15s; }
.btn-primary { background:#2563eb; color:#fff; }
.btn-primary:hover { background:#1d4ed8; }
.btn-secondary { background:#1e293b; color:#94a3b8; border:1px solid #334155; }
.btn-secondary:hover { background:#334155; color:#f1f5f9; }
#disclaimer {
  position:absolute; top:0; left:0; right:0; z-index:99;
  background:#991b1b; color:#fca5a5; text-align:center;
  padding:7px 16px; font-size:12px; font-weight:600; font-family:sans-serif;
}
#loading {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,0.7); z-index:200; color:#fff; font-family:sans-serif;
  font-size:15px; gap:12px; flex-direction:column;
}
.spinner { width:36px; height:36px; border:4px solid rgba(255,255,255,0.15); border-top-color:#3b82f6; border-radius:50%; animation:spin 0.8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
#cdn-error {
  display:none; position:absolute; inset:0; align-items:center; justify-content:center;
  background:#0a0a14; z-index:300; color:#fca5a5; font-family:sans-serif;
  font-size:14px; text-align:center; flex-direction:column; gap:12px; padding:24px;
}
#runtime-error {
  display:none; position:absolute; bottom:0; left:0; right:0; z-index:400;
  background:#991b1b; color:#fca5a5; font-family:sans-serif;
  font-size:12px; padding:8px 16px; text-align:center;
}
#captureStatus { display:none; margin-top:8px; font-size:11px; color:#86efac; text-align:center; }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div><span>Loading 3D terrain…</span></div>
<div id="cdn-error">
  <div style="font-size:22px">⛔</div>
  <div style="font-weight:700;font-size:15px">External scripts blocked</div>
  <div style="max-width:360px;color:#94a3b8;font-size:13px">This environment's Content Security Policy is blocking Cesium from loading. Open this page in a published/standalone app where external scripts are permitted.</div>
</div>
<div id="runtime-error"></div>
<div id="disclaimer">
  ⚠ ILLUSTRATIVE CONCEPT — NOT A SURVEY. Parcel outline and tower height are to scale; the monopole, fence, gravel pad, and landscaped buffer are shown at exaggerated scale so placement is easy to see.
</div>
<div id="cesiumContainer"></div>
<div id="controls">
  <h3>🗼 3D Tower Preview</h3>
  <div style="color:#64748b;font-size:11px;margin-bottom:8px;word-break:break-all">${property_address || site_name}</div>
  <div class="ctrl-row"><label>Compound</label>
    <select id="selCompound">
      <option value="50x50">50×50 ft</option>
      <option value="75x75">75×75 ft</option>
      <option value="100x100">100×100 ft</option>
    </select>
  </div>
  <div class="ctrl-row"><label>Buffer</label>
    <select id="selBuffer">
      <option value="10">10 ft</option>
      <option value="25">25 ft</option>
      <option value="50">50 ft</option>
    </select>
  </div>
  <div class="ctrl-row"><label>Tower height</label>
    <select id="selHeight">
      <option value="150">150 ft</option>
      <option value="199">199 ft</option>
      <option value="250">250 ft</option>
    </select>
  </div>
  <div class="btn-row"><button class="btn btn-primary" id="btnRender">⟳ Generate 3D</button></div>
  <div class="btn-row">
    <button class="btn btn-secondary" id="btnOrbit">🎬 Cinematic Orbit</button>
    <button class="btn btn-secondary" id="btnTop">⬆ Top-down</button>
  </div>
  <div class="btn-row" style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px">
    <button class="btn" id="btnCapture" style="background:#7c3aed;color:#fff;flex:1">📸 Capture frame → packet</button>
  </div>
  <div id="captureStatus"></div>
</div>
<script>
var LAT = ${lat};
var LON = ${lon};
var PARCEL_GEOJSON = ${parcelGeoJsonStr};
var INIT_COMPOUND = "${compound_size || "75x75"}";
var INIT_BUFFER = "${buffer_ft || 25}";
var INIT_HEIGHT = "${tower_height_ft || 199}";
var SITE_NAME = "${site_name}";
var FT_TO_M = 0.3048;
var DEG_PER_M_LAT = 1 / 111320;
var DEG_PER_M_LON = 1 / (111320 * Math.cos(LAT * Math.PI / 180));

var viewer = null;
var orbitActive = false;
var orbitHandle = null;
var entityGroup = [];
var tileLoadListener = null;
var loadingTimerId = null;
var destroyed = false;

function showError(msg) {
  var el = document.getElementById('runtime-error');
  if (el) { el.style.display='block'; el.textContent='⚠ ' + msg; }
}

function isViewerAlive() {
  return viewer && !viewer.isDestroyed();
}

function removeLoading() {
  var el = document.getElementById('loading');
  if (el) el.style.display = 'none';
}

function offsetDeg(latDeg, lonDeg, northFt, eastFt) {
  return {
    lat: latDeg + northFt * FT_TO_M * DEG_PER_M_LAT,
    lon: lonDeg + eastFt * FT_TO_M * DEG_PER_M_LON,
  };
}

function clearEntities() {
  if (!isViewerAlive()) return;
  entityGroup.forEach(function(e) { try { viewer.entities.remove(e); } catch(ex) {} });
  entityGroup = [];
}

function addEnt(opts) {
  if (!isViewerAlive()) return;
  try { entityGroup.push(viewer.entities.add(opts)); } catch(ex) { showError(ex.message); }
}

function renderAll(compoundWFt, compoundDFt, bufferFt, towerHFt) {
  if (!isViewerAlive()) return;
  clearEntities();
  var towerHM = towerHFt * FT_TO_M;
  var fw = compoundWFt * FT_TO_M * 1.2;
  var fd = compoundDFt * FT_TO_M * 1.2;
  var fenceH = 3.0;
  var fenceThick = 0.15;

  // 1. Parcel boundary
  if (PARCEL_GEOJSON && PARCEL_GEOJSON.coordinates) {
    var coords = PARCEL_GEOJSON.type === 'Polygon' ? PARCEL_GEOJSON.coordinates[0] : PARCEL_GEOJSON.coordinates[0][0];
    if (coords && coords.length) {
      var positions = coords.map(function(c) { return Cesium.Cartesian3.fromDegrees(c[0], c[1]); });
      addEnt({ polyline: { positions: positions, width: 3, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: Cesium.Color.YELLOW }), clampToGround: true } });
      addEnt({ polygon: { hierarchy: new Cesium.PolygonHierarchy(positions), material: Cesium.Color.YELLOW.withAlpha(0.08), outline: false, perPositionHeight: false, classificationType: Cesium.ClassificationType.TERRAIN } });
    }
  }

  // 2. Gravel pad
  addEnt({ position: Cesium.Cartesian3.fromDegrees(LON, LAT, 0.5), box: { dimensions: new Cesium.Cartesian3(fw, fd, 0.3), material: Cesium.Color.fromCssColorString('#8B7355').withAlpha(0.9) } });

  // 3. Fence walls
  [[0, fd/2],[0,-fd/2]].forEach(function(e) {
    var p = offsetDeg(LAT, LON, e[1]/FT_TO_M, e[0]/FT_TO_M);
    addEnt({ position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, fenceH/2+0.3), box: { dimensions: new Cesium.Cartesian3(fw, fenceThick, fenceH), material: Cesium.Color.fromCssColorString('#9CA3AF').withAlpha(0.85) } });
  });
  [[fw/2,0],[-fw/2,0]].forEach(function(e) {
    var p = offsetDeg(LAT, LON, e[1]/FT_TO_M, e[0]/FT_TO_M);
    addEnt({ position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, fenceH/2+0.3), box: { dimensions: new Cesium.Cartesian3(fenceThick, fd, fenceH), material: Cesium.Color.fromCssColorString('#9CA3AF').withAlpha(0.85) } });
  });

  // 4. Buffer trees
  var bufM = bufferFt * FT_TO_M;
  var bufTotalW = (compoundWFt/2 + bufferFt)*FT_TO_M;
  var bufTotalD = (compoundDFt/2 + bufferFt)*FT_TO_M;
  var treeR = Math.max(bufM*0.35, 1.5);
  var treeH = Math.max(bufM*0.9, 4);
  var spacing = treeR*2.8;
  var treeColor = Cesium.Color.fromCssColorString('#166534').withAlpha(0.85);
  for (var side=0; side<4; side++) {
    var isNS = side%2===0; var sign = side<2?1:-1;
    var fixedOff = (isNS?bufTotalD:bufTotalW)*sign; var range = isNS?bufTotalW:bufTotalD;
    for (var x=-range; x<=range; x+=spacing) {
      var n=isNS?fixedOff:x; var e=isNS?x:fixedOff;
      var p=offsetDeg(LAT,LON,n/FT_TO_M,e/FT_TO_M);
      var trunkH=treeH*0.35; var canopyH=treeH*0.75;
      addEnt({ position: Cesium.Cartesian3.fromDegrees(p.lon,p.lat,trunkH/2+0.3), cylinder: { length:trunkH, topRadius:treeR*0.12, bottomRadius:treeR*0.18, material:Cesium.Color.fromCssColorString('#78350f').withAlpha(0.9) } });
      addEnt({ position: Cesium.Cartesian3.fromDegrees(p.lon,p.lat,trunkH+canopyH/2+0.3), cylinder: { length:canopyH, topRadius:0.2, bottomRadius:treeR*0.95, material:treeColor, outline:false } });
    }
  }

  // 5. Monopole
  var BASE_R = Math.max(towerHM*0.012, 0.5); var TOP_R = Math.max(towerHM*0.005, 0.2);
  addEnt({ position: Cesium.Cartesian3.fromDegrees(LON,LAT,towerHM/2+0.5), cylinder: { length:towerHM, topRadius:TOP_R, bottomRadius:BASE_R, material:Cesium.Color.fromCssColorString('#D1D5DB'), outline:true, outlineColor:Cesium.Color.fromCssColorString('#6B7280') } });
  addEnt({ position: Cesium.Cartesian3.fromDegrees(LON,LAT,towerHM+0.5), cylinder: { length:0.6, topRadius:TOP_R*2.5, bottomRadius:TOP_R*2.5, material:Cesium.Color.fromCssColorString('#374151') } });

  // Antenna panels
  var antH = Math.max(towerHM*0.08,1.2); var antR = TOP_R*2.2;
  [0,120,240].forEach(function(deg) {
    var rad=deg*Math.PI/180; var off=offsetDeg(LAT,LON,(antR*Math.cos(rad))/FT_TO_M,(antR*Math.sin(rad))/FT_TO_M);
    addEnt({ position: Cesium.Cartesian3.fromDegrees(off.lon,off.lat,towerHM-antH/2+0.5), box: { dimensions: new Cesium.Cartesian3(0.25,0.08,antH), material:Cesium.Color.fromCssColorString('#1e3a5f') } });
  });

  // Aviation beacon
  addEnt({ position: Cesium.Cartesian3.fromDegrees(LON,LAT,towerHM+1.2), ellipsoid: { radii: new Cesium.Cartesian3(0.35,0.35,0.35), material:Cesium.Color.RED.withAlpha(0.95) } });

  // Label
  addEnt({ position: Cesium.Cartesian3.fromDegrees(LON,LAT,towerHM+8), label: { text: towerHFt+' ft AGL', font:'bold 14px sans-serif', fillColor:Cesium.Color.WHITE, outlineColor:Cesium.Color.BLACK, outlineWidth:2, style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.BOTTOM, pixelOffset:new Cesium.Cartesian2(0,-8), disableDepthTestDistance:Number.POSITIVE_INFINITY } });
}

function flyToSite(towerHFt) {
  if (!isViewerAlive()) return;
  try {
    var towerHM = towerHFt * FT_TO_M;
    var center = Cesium.Cartesian3.fromDegrees(LON, LAT, towerHM * 0.45);
    var range = towerHM * 1.5 + 55;
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, 1), { duration:2.5, offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(35), Cesium.Math.toRadians(-18), range) });
  } catch(ex) { showError(ex.message); }
}

function topDown() {
  if (!isViewerAlive()) return;
  stopOrbit();
  try {
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(LON,LAT,0),1), { duration:1.8, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), 165) });
  } catch(ex) { showError(ex.message); }
}

function stopOrbit() {
  orbitActive = false;
  if (orbitHandle) { try { orbitHandle(); } catch(e){} orbitHandle = null; }
  var btn=document.getElementById('btnOrbit'); if(btn) btn.textContent='🎬 Cinematic Orbit';
}

function startOrbit() {
  if (!isViewerAlive()) return;
  orbitActive = true;
  var btn=document.getElementById('btnOrbit'); if(btn) btn.textContent='⏹ Stop Orbit';
  var towerHFt = Number(document.getElementById('selHeight').value);
  var towerHM = towerHFt * FT_TO_M;
  var ORBIT_RADIUS = towerHM*1.5+55; var ORBIT_HEIGHT = towerHM*0.85+30;
  var startTime = Date.now();
  try {
    orbitHandle = viewer.clock.onTick.addEventListener(function() {
      if (!orbitActive || !isViewerAlive()) return;
      var t=(Date.now()-startTime)/1000; var angle=t*0.18;
      var x=Math.cos(angle)*ORBIT_RADIUS; var y=Math.sin(angle)*ORBIT_RADIUS;
      try { viewer.camera.setView({ destination:Cesium.Cartesian3.fromDegrees(LON+x*DEG_PER_M_LON, LAT+y*DEG_PER_M_LAT, ORBIT_HEIGHT), orientation:{ heading:Math.atan2(-y,-x), pitch:Cesium.Math.toRadians(-18), roll:0 } }); } catch(ex){}
    });
  } catch(ex) { showError(ex.message); }
}

function captureFrame() {
  if (!isViewerAlive()) { showError('Viewer has been closed.'); return; }
  var btn=document.getElementById('btnCapture'); var statusEl=document.getElementById('captureStatus');
  btn.disabled=true; btn.textContent='Capturing…'; statusEl.style.display='none';
  try { viewer.render(); } catch(ex) {}
  setTimeout(function() {
    try {
      if (!isViewerAlive()) { btn.textContent='📸 Capture frame → packet'; btn.disabled=false; showError('Viewer closed during capture.'); return; }
      var compStr=document.getElementById('selCompound').value;
      var bufFt=document.getElementById('selBuffer').value;
      var hFt=document.getElementById('selHeight').value;
      var cesiumCanvas=viewer.scene.canvas;
      var W=cesiumCanvas.width; var H=cesiumCanvas.height;
      var DISC_H=Math.round(H*0.048); var CAP_H=Math.round(H*0.058); var TOTAL_H=H+DISC_H+CAP_H;
      var out=document.createElement('canvas'); out.width=W; out.height=TOTAL_H;
      var ctx=out.getContext('2d');
      ctx.fillStyle='#991b1b'; ctx.fillRect(0,0,W,DISC_H);
      ctx.fillStyle='#fca5a5'; ctx.font='bold '+Math.round(DISC_H*0.52)+'px sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('⚠ ILLUSTRATIVE CONCEPT — NOT A SURVEY  ·  Parcel & tower height to scale; compound/buffer/fence exaggerated for visibility', W/2, DISC_H/2);
      ctx.drawImage(cesiumCanvas,0,DISC_H,W,H);
      var captionY=DISC_H+H;
      ctx.fillStyle='#0f172a'; ctx.fillRect(0,captionY,W,CAP_H);
      var now=new Date();
      var dateStr=now.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
      var captionText=SITE_NAME+'  ·  Tower: '+hFt+' ft AGL  ·  Compound: '+compStr+' ft  ·  Buffer: '+bufFt+' ft  ·  '+dateStr;
      ctx.fillStyle='#cbd5e1'; ctx.font=Math.round(CAP_H*0.38)+'px sans-serif';
      ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(captionText, Math.round(W*0.015), captionY+CAP_H/2);
      ctx.fillStyle='rgba(148,163,184,0.5)'; ctx.font='bold '+Math.round(CAP_H*0.32)+'px sans-serif';
      ctx.textAlign='right'; ctx.fillText('SiteHawk · HawkPerch 3D', W-Math.round(W*0.015), captionY+CAP_H/2);
      var dataUrl=out.toDataURL('image/png');
      window.parent.postMessage({ type:'sitehawk:3d-snapshot', dataUrl:dataUrl, site_name:SITE_NAME, tower_height_ft:Number(hFt), compound_size:compStr, buffer_ft:Number(bufFt), captured_at:now.toISOString() }, '*');
      if(statusEl){ statusEl.textContent='✓ Sending to packet…'; statusEl.style.display='block'; }
      btn.textContent='📸 Capture frame → packet'; btn.disabled=false;
    } catch(e) {
      btn.textContent='📸 Capture frame → packet'; btn.disabled=false;
      showError('Capture failed: '+e.message);
    }
  }, 300);
}

function initCesium() {
  if (destroyed) return; // StrictMode double-mount guard
  try {
    Cesium.Ion.defaultAccessToken = "${cesiumToken}";
    viewer = new Cesium.Viewer('cesiumContainer', {
      terrainProvider: Cesium.createWorldTerrain(),
      baseLayerPicker:false, navigationHelpButton:false, sceneModePicker:false,
      geocoder:false, homeButton:false, animation:false, timeline:false,
      fullscreenButton:false, infoBox:false, selectionIndicator:false,
      shadows:true, terrainShadows:Cesium.ShadowMode.ENABLED,
    });
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(new Cesium.IonImageryProvider({ assetId:2 }));

    tileLoadListener = viewer.scene.globe.tileLoadProgressEvent.addEventListener(function(q) {
      if (q === 0 && !destroyed) removeLoading();
    });
    loadingTimerId = setTimeout(function() { if (!destroyed) removeLoading(); }, 6000);

    document.getElementById('selCompound').value = INIT_COMPOUND;
    document.getElementById('selBuffer').value = INIT_BUFFER;
    document.getElementById('selHeight').value = INIT_HEIGHT;

    var parts = INIT_COMPOUND.split('x').map(Number);
    renderAll(parts[0], parts[1], Number(INIT_BUFFER), Number(INIT_HEIGHT));
    setTimeout(function() { if (!destroyed && isViewerAlive()) flyToSite(Number(INIT_HEIGHT)); }, 2000);

    document.getElementById('btnRender').addEventListener('click', function() {
      var compStr=document.getElementById('selCompound').value;
      var parts=compStr.split('x').map(Number);
      var bufFt=Number(document.getElementById('selBuffer').value);
      var hFt=Number(document.getElementById('selHeight').value);
      renderAll(parts[0],parts[1],bufFt,hFt);
      flyToSite(hFt);
      window.parent.postMessage({ type:'3d_settings', compound:compStr, buffer:bufFt, height:hFt }, '*');
    });
    document.getElementById('btnOrbit').addEventListener('click', function() { if(orbitActive) stopOrbit(); else startOrbit(); });
    document.getElementById('btnTop').addEventListener('click', topDown);
    document.getElementById('btnCapture').addEventListener('click', captureFrame);

  } catch(ex) {
    showError('Cesium init failed: ' + ex.message);
    removeLoading();
  }
}

// Cleanup hook called from parent via postMessage
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'sitehawk:destroy') {
    destroyed = true;
    stopOrbit();
    if (tileLoadListener) { try { tileLoadListener(); } catch(ex){} }
    if (loadingTimerId) clearTimeout(loadingTimerId);
    if (isViewerAlive()) { try { viewer.destroy(); } catch(ex){} }
    viewer = null;
  }
});
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
    if (!render || cesiumToken === null) return;
    const html = buildCesiumHtml(render, cesiumToken);
    if (!html) return;
    setHtmlContent(html);

    // Cleanup: send destroy message to iframe so Cesium tears down gracefully
    return () => {
      try {
        iframeRef.current?.contentWindow?.postMessage({ type: "sitehawk:destroy" }, "*");
      } catch { /* cross-origin guard */ }
    };
  }, [render?.id, cesiumToken, render?.tower_height_ft, render?.compound_width_ft, render?.buffer_ft]);

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
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], `3d-snapshot-${Date.now()}.png`, { type: "image/png" });
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          await base44.entities.Tower3DRender.update(render.id, { snapshot_image_url: file_url, status: "ready" });
          setSnapshotSaved(true);
          toast.success("Saved to packet ✓");
          onSnapshot?.({ file_url, site_name, tower_height_ft, compound_size, buffer_ft, captured_at });
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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white font-bold text-sm">
            3D Tower Preview — {render?.site_name || "Target A"}
          </span>
          <span className="text-white/40 text-xs">{render?.property_address}</span>
          {snapshotSaving && (
            <span className="flex items-center gap-1.5 text-xs text-purple-300">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving to packet…
            </span>
          )}
          {snapshotSaved && !snapshotSaving && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved to packet ✓
            </span>
          )}
        </div>
        <Button size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10" onClick={onClose}>
          <X className="w-4 h-4 mr-1" /> Close
        </Button>
      </div>

      {/* Cesium iframe — sandbox WITHOUT allow-same-origin to isolate blob workers */}
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