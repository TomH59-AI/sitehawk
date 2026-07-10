/**
 * generateCesiumTowerViewer — serves a self-contained interactive Cesium
 * viewer (text/html) for a Tower3DRender.
 *
 * GET  /functions/generateCesiumTowerViewer?renderId=<id>   (or ?runId=<id>)
 * Hydration order: Tower3DRender by renderId → Tower3DRender by
 * tower_siting_run_id=runId → TowerSitingRun by runId.
 *
 * Secrets are read from env only for the authenticated viewer session; raw
 * secrets are never logged, stored in entity fields, or echoed in errors.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const EXHIBIT_DISCLAIMER =
  "Preliminary Tower Siting Exhibit — NOT final engineering, NOT a stamped survey, and NOT a final zoning determination.";
const DEFAULT_ILLUSTRATIVE =
  "Illustrative concept — not a survey. Parcel outline and tower height are to scale; the monopole, fence, gravel pad, and landscaped buffer are shown at exaggerated scale so placement is easy to see. Final dimensions set after site walk & survey.";

const firstEnv = (names) => {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v && v.trim()) return v.trim();
  }
  return null;
};

function geomCentroid(geometry) {
  try {
    const g = geometry?.type === "Feature" ? geometry.geometry : geometry;
    let ring = null;
    if (g?.type === "Polygon") ring = g.coordinates[0];
    else if (g?.type === "MultiPolygon") ring = g.coordinates[0][0];
    if (!ring?.length) return null;
    return {
      lon: ring.reduce((s, c) => s + c[0], 0) / ring.length,
      lat: ring.reduce((s, c) => s + c[1], 0) / ring.length,
    };
  } catch { return null; }
}

const htmlResponse = (html, status = 200) =>
  new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

function messagePage(title, lines, snapshotUrl) {
  const items = lines.map((l) => `<li>${l}</li>`).join("");
  const snap = snapshotUrl
    ? `<p><a href="${snapshotUrl}" target="_blank" style="color:#818cf8">View saved 3D snapshot instead →</a></p>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preliminary Tower Siting Exhibit</title>
<style>body{margin:0;background:#0a0f1a;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#0c1422;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:36px;max-width:460px}
h1{font-size:18px;margin:0 0 12px}ul{color:#94a3b8;font-size:13px;line-height:1.7}a{color:#818cf8}</style></head>
<body><div class="card"><h1>⚠ ${title}</h1><ul>${items}</ul>${snap}
<p><a href="/tower-siter">← Back to Tower Siter</a></p>
<p style="font-size:11px;color:#f59e0b">${EXHIBIT_DISCLAIMER}</p></div></body></html>`;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let renderId = url.searchParams.get("renderId") || url.searchParams.get("render_id");
    let runId = url.searchParams.get("runId") || url.searchParams.get("run_id") || url.searchParams.get("tower_siting_run_id");
    if (!renderId && !runId && req.method === "POST") {
      try {
        const body = await req.json();
        renderId = body.renderId || body.render_id || null;
        runId = body.runId || body.run_id || body.tower_siting_run_id || null;
      } catch { /* no body */ }
    }

    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { /* not signed in */ }
    if (!user) {
      return htmlResponse(messagePage("Sign in required", [
        "This 3D exhibit is only available to signed-in SiteHawk users.",
        'Open the app, sign in, then use the "Open 3D Viewer" action on the Tower Siter / HawkFit surface.',
      ], null), 401);
    }

    if (!renderId && !runId) {
      return htmlResponse(messagePage("Missing viewer input", [
        "No <b>renderId</b> or <b>runId</b> was provided in the URL.",
        "Example: ?renderId=&lt;Tower3DRender id&gt;",
      ], null), 422);
    }

    // 1. Tower3DRender by renderId → 2. by tower_siting_run_id → 3. TowerSitingRun
    let render = null;
    if (renderId) render = await base44.entities.Tower3DRender.get(renderId).catch(() => null);
    if (!render && runId) {
      const rows = await base44.entities.Tower3DRender.filter({ tower_siting_run_id: runId }, "-created_date", 1).catch(() => []);
      render = rows?.[0] || null;
    }
    const effectiveRunId = render?.tower_siting_run_id || runId;
    let run = null;
    if (effectiveRunId) run = await base44.entities.TowerSitingRun.get(effectiveRunId).catch(() => null);

    if (!render && !run) {
      return htmlResponse(messagePage("No siting data found", [
        "No Tower3DRender or TowerSitingRun exists for the given id.",
        "Run the Tower Siter on a parcel first, then generate the 3D preview.",
      ], null), 404);
    }

    const parcelGeojson = render?.parcel_geojson || run?.parcel_geometry || null;
    const compoundGeojson = render?.compound_geojson || run?.compound_geojson?.geometry || run?.compound_geojson || null;
    let lat = render?.centroid_lat ?? run?.parcel_centroid_lat ?? null;
    let lon = render?.centroid_lon ?? run?.parcel_centroid_lon ?? null;
    if ((!lat || !lon) && parcelGeojson) {
      const c = geomCentroid(parcelGeojson);
      if (c) { lat = c.lat; lon = c.lon; }
    }

    // Hard guard — never a silent blank/default globe
    if (!lat || !lon) {
      return htmlResponse(messagePage("3D scene can't open — missing coordinates", [
        "Tower/centroid coordinates are missing on both the Tower3DRender and its TowerSitingRun.",
        !parcelGeojson ? "Parcel boundary geometry (parcel_geojson) is also missing." : "Parcel geometry exists but has no usable centroid.",
        "Re-run the Tower Siter on this parcel to regenerate coordinates.",
      ], render?.snapshot_image_url || null), 422);
    }

    const ionToken = firstEnv(["CESIUM_ION_TOKEN", "VITE_CESIUM_ION_TOKEN", "SITEHAWK_CESIUM_ION_TOKEN", "CESIUM_ION_API"]);
    const googleKey = firstEnv([
      "GOOGLE_MAP_TILES_API_KEY", "GOOGLE_3D_TILES_API_KEY", "VITE_GOOGLE_MAP_TILES_API_KEY",
      "SITEHAWK_GOOGLE_MAP_TILES_API_KEY", "GOOGLE_MAPS_API_KEY",
    ]);
    const googleAssetId = firstEnv([
      "CESIUM_GOOGLE_3D_TILES_ASSET_ID", "VITE_CESIUM_GOOGLE_3D_TILES_ASSET_ID", "SITEHAWK_CESIUM_GOOGLE_3D_TILES_ASSET_ID",
    ]);

    const missing = [];
    if (!parcelGeojson) missing.push("Parcel boundary geometry — parcel outline will not render");
    if (!compoundGeojson) missing.push("Compound geometry — 75×75 ft generated compound shown");
    if (!ionToken) missing.push("Cesium Ion token — terrain fallback limited to OpenStreetMap imagery");
    if (!googleKey && !googleAssetId) missing.push("Google 3D Tiles key — photorealistic tiles unavailable, terrain fallback used");

    const scene = {
      lat: Number(lat), lon: Number(lon),
      address: render?.property_address || run?.property_address || "",
      towerType: render?.tower_type || run?.tower_type || "monopole",
      heightFt: render?.tower_height_ft || run?.tower_height_ft || 200,
      compoundW: render?.compound_width_ft || run?.compound_width_ft || 75,
      compoundD: render?.compound_depth_ft || run?.compound_depth_ft || 75,
      bufferFt: render?.buffer_ft || 25,
      parcel: parcelGeojson,
      compound: compoundGeojson,
      snapshotUrl: render?.snapshot_image_url || "",
      illustrative: render?.disclaimer_text || DEFAULT_ILLUSTRATIVE,
      missing,
    };
    // Session-scoped tokens for the viewer only — never persisted anywhere.
    const cfg = { ionToken: ionToken || "", googleKey: googleKey || "", googleAssetId: googleAssetId || "" };
    const sceneJson = JSON.stringify(scene).replace(/</g, "\\u003c");
    const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c");

    console.log(`generateCesiumTowerViewer: user=${user.email} render=${render?.id || "-"} run=${effectiveRunId || "-"} parcel=${!!parcelGeojson} compound=${!!compoundGeojson}`);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preliminary Tower Siting Exhibit${scene.address ? " — " + scene.address.replace(/</g, "") : ""}</title>
<link rel="stylesheet" href="https://cesium.com/downloads/cesiumjs/releases/1.122/Build/Cesium/Widgets/widgets.css">
<script src="https://cesium.com/downloads/cesiumjs/releases/1.122/Build/Cesium/Cesium.js"><\/script>
<style>
html,body{margin:0;height:100%;background:#0a0f1a;font-family:sans-serif;display:flex;flex-direction:column}
#hdr{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0c1422;border-bottom:1px solid rgba(255,255,255,.1);color:#fff;font-size:13px}
#hdr a{color:#94a3b8;text-decoration:none}#hdr a:hover{color:#fff}
#hdr b{font-size:14px}
#disc{padding:6px 14px;background:rgba(120,53,15,.35);border-bottom:1px solid rgba(245,158,11,.3);color:#fcd34d;font-size:11px;text-align:center}
#warn{padding:5px 14px;background:rgba(113,63,18,.25);color:#fde68a;font-size:10.5px;text-align:center;display:none}
#viewer{flex:1;position:relative}
#ftr{padding:7px 14px;background:#0c1422;border-top:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.45);font-size:10px;text-align:center;line-height:1.4}
.snap{margin-left:auto;color:#818cf8 !important;font-size:12px}
</style></head>
<body>
<div id="hdr">
  <a href="/tower-siter">← Tower Siter</a>
  <span style="color:rgba(255,255,255,.2)">|</span>
  <b>Preliminary Tower Siting Exhibit</b>
  <span style="color:#94a3b8">${scene.address ? "— " + scene.address.replace(/</g, "") : ""}</span>
  ${scene.snapshotUrl ? '<a class="snap" href="' + scene.snapshotUrl + '" target="_blank">Saved snapshot ↗</a>' : ""}
</div>
<div id="disc">⚠ ${EXHIBIT_DISCLAIMER}</div>
<div id="warn"></div>
<div id="viewer"></div>
<div id="ftr">${scene.illustrative.replace(/</g, "")}</div>
<script>
var SCENE = ${sceneJson};
var CFG = ${cfgJson};
var FT = 0.3048;
function warn(msg){var w=document.getElementById('warn');w.style.display='block';w.textContent='⚠ '+(w.textContent?w.textContent.replace('⚠ ','')+' · ':'')+msg;}
(SCENE.missing||[]).forEach(warn);

if (CFG.ionToken) Cesium.Ion.defaultAccessToken = CFG.ionToken;
var viewer = new Cesium.Viewer('viewer',{baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,animation:false,timeline:false,fullscreenButton:false,infoBox:false,selectionIndicator:false});
viewer.imageryLayers.removeAll();

function rings(g){var out=[];if(!g)return out;var geo=g.type==='Feature'?g.geometry:g;if(!geo)return out;
 if(geo.type==='Polygon')geo.coordinates.forEach(function(r){out.push(r);});
 else if(geo.type==='MultiPolygon')geo.coordinates.forEach(function(p){p.forEach(function(r){out.push(r);});});
 else if(geo.type==='FeatureCollection')(geo.features||[]).forEach(function(f){rings(f).forEach(function(r){out.push(r);});});
 return out;}
function toCart(r,h){return r.map(function(c){return Cesium.Cartesian3.fromDegrees(c[0],c[1],h);});}

(async function(){
  var baseLoaded=false;
  // 1. Google Photorealistic 3D Tiles (direct key, or via Ion asset id)
  if (CFG.googleKey){
    try{
      var ts=await Cesium.Cesium3DTileset.fromUrl('https://tile.googleapis.com/v1/3dtiles/root.json?key='+CFG.googleKey,{showCreditsOnScreen:true});
      viewer.scene.primitives.add(ts);baseLoaded=true;
    }catch(e){warn('Photorealistic 3D Tiles unavailable — using terrain fallback');}
  }
  if(!baseLoaded && CFG.googleAssetId && CFG.ionToken){
    try{
      var ts2=await Cesium.Cesium3DTileset.fromIonAssetId(Number(CFG.googleAssetId),{showCreditsOnScreen:true});
      viewer.scene.primitives.add(ts2);baseLoaded=true;
    }catch(e){warn('Ion 3D Tiles asset unavailable');}
  }
  // 2. Ion terrain + aerial imagery fallback
  if(!baseLoaded && CFG.ionToken){
    try{
      viewer.imageryLayers.addImageryProvider(await Cesium.IonImageryProvider.fromAssetId(2275207));
      try{viewer.terrainProvider=await Cesium.CesiumTerrainProvider.fromIonAssetId(1);}catch(e){}
      baseLoaded=true;
    }catch(e){warn('Ion aerial imagery unavailable');}
  }
  // 3. Ellipsoid + OSM imagery last resort — parcel/tower geometry still renders
  if(!baseLoaded){
    try{viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/'}));}catch(e){}
    warn('Using basic map fallback — 3D tiles and aerial imagery unavailable');
  }

  var lat=SCENE.lat,lon=SCENE.lon;
  var heightM=(SCENE.heightFt||200)*FT;
  var lonDeg=1/(111320*Math.cos(lat*Math.PI/180)),latDeg=1/110540;
  var pts=[];

  // Parcel boundary — cyan
  rings(SCENE.parcel).forEach(function(r){
    var pos=toCart(r,0.5);if(pos.length<3)return;pos.forEach(function(p){pts.push(p);});
    viewer.entities.add({polyline:{positions:pos.concat([pos[0]]),width:2.5,material:Cesium.Color.fromCssColorString('#00e5ff'),clampToGround:false}});
  });

  // Compound — real geometry or generated 75x75 fallback
  var cw=(SCENE.compoundW||75)*FT,cd=(SCENE.compoundD||75)*FT;
  var compRings=rings(SCENE.compound);
  if(compRings.length){
    compRings.forEach(function(r){var pos=toCart(r,0.3);if(pos.length<3)return;
      viewer.entities.add({polyline:{positions:pos.concat([pos[0]]),width:2,material:Cesium.Color.fromCssColorString('#88bbff')}});});
  } else {
    var hw=(cw/2)*lonDeg,hd=(cd/2)*latDeg;
    viewer.entities.add({rectangle:{coordinates:Cesium.Rectangle.fromDegrees(lon-hw,lat-hd,lon+hw,lat+hd),height:0.2,material:Cesium.Color.TRANSPARENT,outline:true,outlineColor:Cesium.Color.fromCssColorString('#88bbff'),outlineWidth:2}});
  }
  // Fence
  var fhw=(cw/2)*lonDeg,fhd=(cd/2)*latDeg;
  var fence=[[lon-fhw,lat-fhd],[lon+fhw,lat-fhd],[lon+fhw,lat+fhd],[lon-fhw,lat+fhd],[lon-fhw,lat-fhd]];
  viewer.entities.add({polyline:{positions:fence.map(function(c){return Cesium.Cartesian3.fromDegrees(c[0],c[1],2.4);}),width:2,material:Cesium.Color.fromCssColorString('#aaaaaa99')}});

  // Monopole tower
  viewer.entities.add({position:Cesium.Cartesian3.fromDegrees(lon,lat,heightM/2),cylinder:{length:heightM,topRadius:0.3,bottomRadius:0.5,material:Cesium.Color.fromCssColorString('#8899aa')}});
  for(var i=0;i<3;i++){var a=i*120*Math.PI/180;
    viewer.entities.add({position:Cesium.Cartesian3.fromDegrees(lon+Math.cos(a)*1.2*lonDeg,lat+Math.sin(a)*1.2*latDeg,heightM-1),box:{dimensions:new Cesium.Cartesian3(0.3,0.15,2.5),material:Cesium.Color.fromCssColorString('#cccccc')}});}
  pts.push(Cesium.Cartesian3.fromDegrees(lon,lat,0));
  pts.push(Cesium.Cartesian3.fromDegrees(lon,lat,heightM));

  // 25 ft landscape buffer — tree cones ringing the compound
  var bufM=(SCENE.bufferFt||25)*FT,treeH=25*FT;
  var bhw=cw/2+bufM,bhd=cd/2+bufM,trees=[];
  for(var x=-bhw;x<=bhw;x+=treeH*0.9){trees.push([lon+x*lonDeg,lat+bhd*latDeg]);trees.push([lon+x*lonDeg,lat-bhd*latDeg]);}
  for(var y=-bhd;y<=bhd;y+=treeH*0.9){trees.push([lon-bhw*lonDeg,lat+y*latDeg]);trees.push([lon+bhw*lonDeg,lat+y*latDeg]);}
  trees.slice(0,120).forEach(function(c){
    viewer.entities.add({position:Cesium.Cartesian3.fromDegrees(c[0],c[1],treeH/2),cylinder:{length:treeH,topRadius:0,bottomRadius:treeH*0.35,material:Cesium.Color.fromCssColorString('#2d5a27cc')}});});

  // Camera framing over parcel + tower apex
  var sphere=Cesium.BoundingSphere.fromPoints(pts);
  var range=Math.max(heightM*1.5,Math.min(sphere.radius*4,sphere.radius*2.4*1.35));
  viewer.camera.flyToBoundingSphere(sphere,{offset:new Cesium.HeadingPitchRange(Cesium.Math.toRadians(45),Cesium.Math.toRadians(-40),range),duration:2});
})().catch(function(e){warn('Viewer error: '+(e&&e.message?e.message:e));});
<\/script>
</body></html>`;

    return htmlResponse(html);
  } catch (error) {
    console.error("generateCesiumTowerViewer error:", error?.message || error);
    return htmlResponse(messagePage("Viewer error", ["The 3D viewer could not be generated.", String(error?.message || error).replace(/</g, "")], null), 500);
  }
});