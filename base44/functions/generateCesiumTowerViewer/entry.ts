/**
 * generateCesiumTowerViewer — serves a self-contained interactive 3D tower
 * exhibit (text/html) for a Tower3DRender, built on Google's native
 * photorealistic 3D map (Maps JavaScript API, <gmp-map-3d> / maps3d library).
 *
 * (Function name kept for URL stability — existing viewer_html_url links
 * on Tower3DRender records keep working.)
 *
 * GET  /functions/generateCesiumTowerViewer?renderId=<id>   (or ?runId=<id>)
 * Hydration order: Tower3DRender by renderId → Tower3DRender by
 * tower_siting_run_id=runId → TowerSitingRun by runId.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const EXHIBIT_DISCLAIMER =
  "Preliminary Tower Siting Exhibit — NOT final engineering, NOT a stamped survey, and NOT a final zoning determination.";
const DEFAULT_ILLUSTRATIVE =
  "Illustrative concept — not a survey. Parcel outline and tower height are to scale; the monopole, fence, gravel pad, and landscaped buffer are shown at exaggerated scale so placement is easy to see. Final dimensions set after site walk & survey.";

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
    ? `<p><a href="${snapshotUrl}" target="_blank" style="color:#818cf8">View saved 2D snapshot instead →</a></p>`
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
    let body = {};
    if (req.method === "POST") {
      try { body = (await req.json()) || {}; } catch { /* no body */ }
      renderId = renderId || body.renderId || body.render_id || null;
      runId = runId || body.runId || body.run_id || body.tower_siting_run_id || null;
    }
    const param = (k, ...alts) => {
      const v = url.searchParams.get(k);
      if (v != null) return v;
      for (const a of [k, ...alts]) if (body?.[a] != null) return body[a];
      return null;
    };

    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { /* not signed in */ }
    if (!user) {
      return htmlResponse(messagePage("Sign in required", [
        "This 3D exhibit is only available to signed-in SiteHawk users.",
        'Open the app, sign in, then use the "3D view" action on the Tower Siter / HawkFit surface.',
      ], null), 401);
    }

    // Ad-hoc scene — render straight from coordinates when no record exists yet
    // (e.g. a generate_3d_monopole payload from the scout/Target A surface).
    const qLat = Number(param("lat", "latitude"));
    const qLon = Number(param("lon", "lng", "longitude"));
    const adHoc = !renderId && !runId && Number.isFinite(qLat) && Number.isFinite(qLon);

    if (!renderId && !runId && !adHoc) {
      return htmlResponse(messagePage("Missing viewer input", [
        "No <b>renderId</b> or <b>runId</b> was provided in the URL.",
        "Example: ?renderId=&lt;Tower3DRender id&gt;",
      ], null), 422);
    }

    // 1. Tower3DRender by renderId → 2. by tower_siting_run_id → 3. TowerSitingRun
    let render = null;
    if (adHoc) {
      render = {
        centroid_lat: qLat,
        centroid_lon: qLon,
        property_address: param("label", "target_id") || "",
        tower_type: param("tower_type", "structure_type") || "monopole",
        tower_height_ft: Number(param("height_ft", "tower_height_ft")) || 150,
        compound_width_ft: Number(param("compound_w_ft", "width")) || 75,
        compound_depth_ft: Number(param("compound_d_ft", "length")) || 75,
        buffer_ft: Number(param("buffer_ft", "landscaping_buffer_ft")) || 10,
      };
    }
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
        "Run the Tower Siter on a parcel first, then generate the preview.",
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

    const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim() || null;
    if (!googleKey) {
      return htmlResponse(messagePage("3D map key not configured", [
        "The Google Maps API key (GOOGLE_MAPS_API_KEY) is not set, so the photorealistic 3D map can't load.",
      ], render?.snapshot_image_url || null), 503);
    }

    const missing = [];
    if (!parcelGeojson) missing.push("Parcel boundary geometry — parcel outline will not render");
    if (!compoundGeojson) missing.push("Compound geometry — generated compound rectangle shown");

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
    const sceneJson = JSON.stringify(scene).replace(/</g, "\\u003c");

    console.log(`generateCesiumTowerViewer(gmp-map-3d): user=${user.email} render=${render?.id || "-"} run=${effectiveRunId || "-"} parcel=${!!parcelGeojson} compound=${!!compoundGeojson}`);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preliminary Tower Siting Exhibit${scene.address ? " — " + scene.address.replace(/</g, "") : ""}</title>
<style>
html,body{margin:0;height:100%;background:#0a0f1a;font-family:sans-serif;display:flex;flex-direction:column}
#hdr{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0c1422;border-bottom:1px solid rgba(255,255,255,.1);color:#fff;font-size:13px}
#hdr a{color:#94a3b8;text-decoration:none}#hdr a:hover{color:#fff}
#hdr b{font-size:14px}
#disc{padding:6px 14px;background:rgba(120,53,15,.35);border-bottom:1px solid rgba(245,158,11,.3);color:#fcd34d;font-size:11px;text-align:center}
#warn{padding:5px 14px;background:rgba(113,63,18,.25);color:#fde68a;font-size:10.5px;text-align:center;display:none}
#viewer{flex:1;position:relative}
#viewer gmp-map-3d{position:absolute;inset:0;width:100%;height:100%}
#ftr{padding:7px 14px;background:#0c1422;border-top:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.45);font-size:10px;text-align:center;line-height:1.4}
.snap{margin-left:auto;color:#818cf8 !important;font-size:12px}
</style></head>
<body>
<div id="hdr">
  <a href="/tower-siter">← Tower Siter</a>
  <span style="color:rgba(255,255,255,.2)">|</span>
  <b>Preliminary Tower Siting Exhibit</b>
  <span style="color:#94a3b8">${scene.address ? "— " + scene.address.replace(/</g, "") : ""}</span>
  ${scene.snapshotUrl ? '<a class="snap" href="' + scene.snapshotUrl + '" target="_blank">2D snapshot ↗</a>' : ""}
</div>
<div id="disc">⚠ ${EXHIBIT_DISCLAIMER}</div>
<div id="warn"></div>
<div id="viewer"></div>
<div id="ftr">${scene.illustrative.replace(/</g, "")}</div>
<script>
var SCENE = ${sceneJson};
var FT = 0.3048;
function warn(msg){var w=document.getElementById('warn');w.style.display='block';w.textContent='⚠ '+(w.textContent?w.textContent.replace('⚠ ','')+' · ':'')+msg;}
(SCENE.missing||[]).forEach(warn);

function rings(g){var out=[];if(!g)return out;var geo=g.type==='Feature'?g.geometry:g;if(!geo)return out;
 if(geo.type==='Polygon')geo.coordinates.forEach(function(r){out.push(r);});
 else if(geo.type==='MultiPolygon')geo.coordinates.forEach(function(p){p.forEach(function(r){out.push(r);});});
 else if(geo.type==='FeatureCollection')(geo.features||[]).forEach(function(f){rings(f).forEach(function(r){out.push(r);});});
 return out;}
function toLL(r,alt){return r.map(function(c){return {lat:c[1],lng:c[0],altitude:alt||0};});}

async function init(){
  try{
    var maps3d = await google.maps.importLibrary('maps3d');
    var Map3DElement = maps3d.Map3DElement, Polyline3DElement = maps3d.Polyline3DElement,
        Polygon3DElement = maps3d.Polygon3DElement, AltitudeMode = maps3d.AltitudeMode,
        MapMode = maps3d.MapMode;

    var lat=SCENE.lat,lon=SCENE.lon;
    var heightM=(SCENE.heightFt||200)*FT;
    var lonDeg=1/(111320*Math.cos(lat*Math.PI/180)),latDeg=1/110540;

    var map = new Map3DElement({
      center:{lat:lat,lng:lon,altitude:heightM/2},
      range:Math.max(heightM*3,250),
      tilt:65, heading:45,
      mode: MapMode ? MapMode.HYBRID : 'HYBRID'
    });
    document.getElementById('viewer').append(map);

    // Parcel boundary — cyan, clamped to ground
    rings(SCENE.parcel).forEach(function(r){
      if(r.length<3)return;
      var line=new Polyline3DElement({altitudeMode:AltitudeMode.CLAMP_TO_GROUND,strokeColor:'#00e5ff',strokeWidth:4,drawsOccludedSegments:true});
      line.coordinates=toLL(r.concat([r[0]]));
      map.append(line);
    });

    // Compound — real geometry or generated rectangle
    var cw=(SCENE.compoundW||75)*FT,cd=(SCENE.compoundD||75)*FT;
    var compRings=rings(SCENE.compound);
    var hw=(cw/2)*lonDeg,hd=(cd/2)*latDeg;
    if(!compRings.length){
      compRings=[[[lon-hw,lat-hd],[lon+hw,lat-hd],[lon+hw,lat+hd],[lon-hw,lat+hd]]];
    }
    compRings.forEach(function(r){
      if(r.length<3)return;
      var line=new Polyline3DElement({altitudeMode:AltitudeMode.CLAMP_TO_GROUND,strokeColor:'#88bbff',strokeWidth:3,drawsOccludedSegments:true});
      line.coordinates=toLL(r.concat([r[0]]));
      map.append(line);
    });

    // Fence — extruded 8 ft ring around the compound pad
    var fence=new Polygon3DElement({altitudeMode:AltitudeMode.RELATIVE_TO_GROUND,extruded:true,fillColor:'#aaaaaa22',strokeColor:'#aaaaaacc',strokeWidth:2,drawsOccludedSegments:true});
    fence.outerCoordinates=toLL([[lon-hw,lat-hd],[lon+hw,lat-hd],[lon+hw,lat+hd],[lon-hw,lat+hd]],2.4);
    map.append(fence);

    // Monopole tower — extruded square prism to true height
    var tr=0.6;
    var tower=new Polygon3DElement({altitudeMode:AltitudeMode.RELATIVE_TO_GROUND,extruded:true,fillColor:'#8899aaee',strokeColor:'#66778899',strokeWidth:1,drawsOccludedSegments:true});
    tower.outerCoordinates=toLL([
      [lon-tr*lonDeg,lat-tr*latDeg],[lon+tr*lonDeg,lat-tr*latDeg],
      [lon+tr*lonDeg,lat+tr*latDeg],[lon-tr*lonDeg,lat+tr*latDeg]
    ],heightM);
    map.append(tower);

    // Landscaped buffer — extruded green hedge ring (buffer band around fence)
    var bufM=(SCENE.bufferFt||25)*FT,treeH=25*FT;
    var bhw=hw+bufM*lonDeg,bhd=hd+bufM*latDeg;
    var hedge=new Polygon3DElement({altitudeMode:AltitudeMode.RELATIVE_TO_GROUND,extruded:true,fillColor:'#2d5a2799',strokeColor:'#2d5a27',strokeWidth:1,drawsOccludedSegments:true});
    hedge.outerCoordinates=toLL([[lon-bhw,lat-bhd],[lon+bhw,lat-bhd],[lon+bhw,lat+bhd],[lon-bhw,lat+bhd]],treeH);
    hedge.innerCoordinates=[toLL([[lon-hw,lat-hd],[lon+hw,lat-hd],[lon+hw,lat+hd],[lon-hw,lat+hd]],treeH)];
    map.append(hedge);
  }catch(e){
    warn('3D map error: '+(e&&e.message?e.message:e));
  }
}
</script>
<script async
  src="https://maps.googleapis.com/maps/api/js?key=${googleKey}&v=alpha&libraries=maps3d&callback=init">
</script>
</body></html>`;

    return htmlResponse(html);
  } catch (error) {
    console.error("generateCesiumTowerViewer error:", error?.message || error);
    return htmlResponse(messagePage("Viewer error", ["The 3D viewer could not be generated.", String(error?.message || error).replace(/</g, "")], null), 500);
  }
});