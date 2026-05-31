/**
 * section5Viewsheds — renderers for the HAWK RF VIEWSHED VISION (Section 5).
 *
 * ENGINE STRATEGY
 *  - PRIMARY: Cesium Ion world terrain is PROBED for coverage. We never spin up a
 *    full Cesium viewer for the 2D plan-view anymore (it was the silent failure
 *    point) — instead Cesium Ion is used as the terrain-coverage authority, and
 *    the map itself is always rendered with Mapbox GL (satellite + terrain-rgb).
 *  - FALLBACK: if Cesium Ion has no terrain coverage / auth fails, we log a
 *    [VIEWSHED DIAG] "Cesium no-coverage, falling back to MapBox" and proceed on
 *    Mapbox terrain-rgb only. Either way the map renders.
 *
 * Every cone is drawn on a Mapbox canvas layer with a RADIAL GRADIENT fill
 * (50%→15% opacity from the tower vertex to the outer arc), a crisp 2px stroke,
 * dashed range rings, a hawk-on-tower vertex icon, a compass rose, and a dotted
 * grey hatch over terrain/tree-canopy-obstructed wedges.
 *
 * Obstruction stats + elevation profile come from the EXISTING scipViewshed
 * backend function — reused as-is. Every map centers on TARGET A only.
 */

import { loadPublicConfig } from "@/lib/publicConfig";

export const BRAND_GREEN = "#628C83";

// Four cardinal directions — colors locked to the original build spec.
export const DIRECTIONS = {
  N: { short: "N", label: "North Viewshed", bearing: 0,   spread: 45, color: "#00BFFF" },
  S: { short: "S", label: "South Viewshed", bearing: 180, spread: 45, color: "#FFA500" },
  E: { short: "E", label: "East Viewshed",  bearing: 90,  spread: 45, color: "#00C853" },
  W: { short: "W", label: "West Viewshed",  bearing: 270, spread: 45, color: "#D500F9" },
};

const TREE_CANOPY_FT = 40; // matches scipViewshed assumed tree-line height

// ────────────── geometry ──────────────
function destPoint(lat, lon, bearingDeg, distMiles) {
  const R = 3958.8;
  const brg = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const dr = distMiles / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(brg));
  const lon2 = lon1 + Math.atan2(
    Math.sin(brg) * Math.sin(dr) * Math.cos(lat1),
    Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

// A sector (fan) polygon ring [ [lon,lat], ... ] closed back to the vertex.
function sectorRing(lat, lon, bearingDeg, spreadDeg, rangeMiles, steps = 48) {
  const coords = [[lon, lat]];
  for (let i = 0; i <= steps; i++) {
    const b = bearingDeg - spreadDeg + (2 * spreadDeg * i) / steps;
    const p = destPoint(lat, lon, b, rangeMiles);
    coords.push([p.lon, p.lat]);
  }
  coords.push([lon, lat]);
  return coords;
}

// A concentric ring polygon at a fixed radius (for the SARF-style range rings).
function circleRing(lat, lon, radiusMiles, steps = 64) {
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const p = destPoint(lat, lon, (i * 360) / steps, radiusMiles);
    coords.push([p.lon, p.lat]);
  }
  return coords;
}

// ────────────── Cesium Ion terrain-coverage probe ──────────────
// Hit Cesium Ion's REST API for the world-terrain asset (1) endpoint metadata.
// Returns { ok, status, fallback } — we only use this to decide terrain source,
// the actual map is always Mapbox. Logs every checkpoint per direction.
async function probeCesiumTerrain(ionToken, dirShort) {
  const tag = `[VIEWSHED DIAG ${dirShort}]`;
  if (!ionToken) {
    console.warn(`${tag} No Cesium Ion token — MapBox terrain-rgb fallback.`);
    return { ok: false, status: 0, fallback: true };
  }
  const endpoint = "https://api.cesium.com/v1/assets/1/endpoint";
  console.log(`${tag} Cesium Ion call: token=${String(ionToken).slice(0, 8)}… endpoint=${endpoint}`);
  try {
    const res = await fetch(`${endpoint}?access_token=${ionToken}`, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    console.log(`${tag} Cesium Ion status=${res.status} responseSize=${text.length}B`);
    if (res.status === 401 || res.status === 403) {
      const err = new Error("Cesium auth failed — verify CESIUM_ION_TOKEN");
      err.code = res.status;
      throw err;
    }
    if (!res.ok) {
      console.log(`${tag} Cesium no-coverage, falling back to MapBox`);
      return { ok: false, status: res.status, fallback: true };
    }
    return { ok: true, status: res.status, fallback: false };
  } catch (e) {
    if (e.code === 401 || e.code === 403) throw e; // auth bubbles up to a hard error
    console.log(`${tag} Cesium no-coverage, falling back to MapBox`);
    return { ok: false, status: 0, fallback: true };
  }
}

// ────────────── Mapbox GL loader (idempotent, CDN) ──────────────
const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
let mapboxLoadingPromise = null;
function ensureMapboxLoaded() {
  if (window.mapboxgl) return Promise.resolve();
  if (mapboxLoadingPromise) return mapboxLoadingPromise;
  mapboxLoadingPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = MAPBOX_CSS;
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = MAPBOX_JS;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return mapboxLoadingPromise;
}

// ────────────── radial-gradient cone (canvas source) ──────────────
// Mapbox fill layers can't do a radial gradient, so we paint the cone onto a
// <canvas> tied to the cone's bbox and add it as an image source. 50%→15% fade
// from the vertex outward = visual RF degradation.
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function addGradientConeLayer(map, lat, lon, dir, rangeMiles, obstructed) {
  const ring = sectorRing(lat, lon, dir.bearing, dir.spread, rangeMiles);
  // bbox of the cone
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [x, y] of ring) {
    minLon = Math.min(minLon, x); maxLon = Math.max(maxLon, x);
    minLat = Math.min(minLat, y); maxLat = Math.max(maxLat, y);
  }
  const W = 512, H = 512;
  const cvs = document.createElement("canvas");
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext("2d");
  const toPx = ([x, y]) => [
    ((x - minLon) / (maxLon - minLon)) * W,
    H - ((y - minLat) / (maxLat - minLat)) * H, // canvas Y is inverted
  ];
  const [vx, vy] = toPx([lon, lat]);
  const arcEnd = destPoint(lat, lon, dir.bearing, rangeMiles);
  const [ax, ay] = toPx([arcEnd.lon, arcEnd.lat]);
  const radPx = Math.hypot(ax - vx, ay - vy);

  // Clip to the cone shape for crisp edges, then paint the radial gradient.
  ctx.save();
  ctx.beginPath();
  ring.forEach((c, i) => {
    const [px, py] = toPx(c);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.clip();

  const { r, g, b } = hexToRgb(dir.color);
  const grad = ctx.createRadialGradient(vx, vy, 0, vx, vy, radPx || 1);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.50)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0.15)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Tree-canopy obstruction hatch — diagonal 45° dotted grey stripes over the
  // outer (obstructed) portion of the cone if line-of-sight is blocked.
  if (obstructed?.blocked && obstructed.fromFrac < 1) {
    const innerR = radPx * obstructed.fromFrac;
    ctx.save();
    ctx.beginPath();
    ctx.arc(vx, vy, radPx, 0, Math.PI * 2);
    ctx.arc(vx, vy, innerR, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.strokeStyle = "rgba(85,85,85,0.60)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 3]);
    for (let d = -H; d < W + H; d += 4) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + H, H);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  const coords = [
    [minLon, maxLat], [maxLon, maxLat], [maxLon, minLat], [minLon, minLat],
  ];
  map.addSource("s5-cone-img", { type: "canvas", canvas: cvs, coordinates: coords, animate: false });
  map.addLayer({ id: "s5-cone-img-layer", type: "raster", source: "s5-cone-img", paint: { "raster-opacity": 1, "raster-fade-duration": 0 } });

  // Crisp 2px stroke outline at 80% opacity (anti-aliased vector line).
  const cone = { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} };
  map.addSource("s5-cone-line", { type: "geojson", data: cone });
  map.addLayer({ id: "s5-cone-stroke", type: "line", source: "s5-cone-line", paint: { "line-color": dir.color, "line-width": 2, "line-opacity": 0.8 } });
}

// Faint dashed concentric range rings at 0.25 / 0.5 / 1 mi (SARF convention).
function addRangeRings(map, lat, lon) {
  const rings = [0.25, 0.5, 1.0];
  const fc = {
    type: "FeatureCollection",
    features: rings.map((r) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [circleRing(lat, lon, r)] }, properties: { mi: r } })),
  };
  map.addSource("s5-rings", { type: "geojson", data: fc });
  map.addLayer({ id: "s5-rings-line", type: "line", source: "s5-rings", paint: { "line-color": "#ffffff", "line-opacity": 0.4, "line-width": 1, "line-dasharray": [3, 3] } });
  // Distance labels along the bearing line.
  const labels = {
    type: "FeatureCollection",
    features: rings.map((r) => {
      const p = destPoint(lat, lon, 0, r); // place along North; rotated per-dir not needed for a faint label
      return { type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: { label: `${r} mi` } };
    }),
  };
  map.addSource("s5-ring-labels", { type: "geojson", data: labels });
  map.addLayer({
    id: "s5-ring-labels-layer", type: "symbol", source: "s5-ring-labels",
    layout: { "text-field": ["get", "label"], "text-size": 10, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true },
    paint: { "text-color": "#ffffff", "text-opacity": 0.55, "text-halo-color": "#000", "text-halo-width": 1 },
  });
}

// SkyWave hawk-on-tower vertex icon (24px, drop shadow).
const HAWK_TOWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4 19 20"/><path d="M19 4 5 20"/><path d="M12 4v16"/><path d="M8.5 9h7"/><path d="M7 13h10"/></svg>`;

function addTowerVertex(map, lat, lon, dir) {
  const el = document.createElement("div");
  el.style.cssText = `width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid ${dir.color};border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.55),0 0 12px ${dir.color}aa;`;
  el.innerHTML = HAWK_TOWER_SVG;
  new window.mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([lon, lat]).addTo(map);
}

// ────────────── obstruction → cone hatch mapping ──────────────
// Translate the scipViewshed profile into { blocked, fromFrac } for the hatch,
// where fromFrac is the fraction of range at which obstruction begins.
function obstructionForCone(profileDir, rangeMiles) {
  if (!profileDir) return { blocked: false, fromFrac: 1 };
  const firstMi = profileDir.first_obstruction_mi;
  if (firstMi == null) return { blocked: false, fromFrac: 1 };
  return { blocked: true, fromFrac: Math.max(0, Math.min(1, firstMi / (rangeMiles || 1))) };
}

// ────────────── public API ──────────────
// Render one direction's 2D viewshed on Mapbox (Cesium Ion is probed for terrain
// coverage). Logs every [VIEWSHED DIAG] checkpoint. Returns { engine, instance,
// destroy } where engine ∈ "cesium" | "mapbox" (terrain authority used).
export async function renderViewshed(container, lat, lon, dirKey, rangeMiles, dirOverride, profileDir) {
  const dir = dirOverride || DIRECTIONS[dirKey];
  const tag = `[VIEWSHED DIAG ${dir.short}]`;
  const cfg = await loadPublicConfig();
  const ionToken = cfg.cesiumIonToken;
  const mapboxToken = cfg.mapboxAccessToken;

  // 2 — Cesium Ion terrain-coverage probe (throws on 401/403).
  const probe = await probeCesiumTerrain(ionToken, dir.short);
  // 3 — MapBox fallback trigger.
  const engine = probe.ok ? "cesium" : "mapbox";
  if (!probe.ok) console.log(`${tag} MapBox terrain-rgb fallback active (cesiumOk=${probe.ok})`);

  if (!mapboxToken) throw new Error("Mapbox token unavailable for viewshed.");
  await ensureMapboxLoaded();
  window.mapboxgl.accessToken = mapboxToken;

  const map = new window.mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/satellite-streets-v12",
    center: [lon, lat],
    zoom: rangeMiles <= 0.25 ? 15 : rangeMiles <= 0.5 ? 14 : 13,
    preserveDrawingBuffer: true,
  });
  map.on("error", (e) => console.error(`${tag} Mapbox error:`, e?.error || e));
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");

  const obstructed = obstructionForCone(profileDir, rangeMiles);

  return new Promise((resolve) => {
    map.on("load", () => {
      // terrain-rgb hillshade.
      map.addSource("s5-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
      map.addLayer({ id: "s5-hillshade", type: "hillshade", source: "s5-dem", paint: { "hillshade-exaggeration": 0.4 } });

      addRangeRings(map, lat, lon);

      // 5 — cone polygon GeoJSON build.
      console.log(`${tag} Cone build: bearing=${dir.bearing}° width=${dir.spread * 2}° range=${rangeMiles}mi`);
      // 6 — raster (gradient canvas) + polygon (stroke) layer add.
      addGradientConeLayer(map, lat, lon, dir, rangeMiles, obstructed);
      console.log(`${tag} Cone + hatch layers added (blocked=${obstructed.blocked})`);

      addTowerVertex(map, lat, lon, dir);

      const d = rangeMiles / 50;
      map.fitBounds([[lon - d, lat - d], [lon + d, lat + d]], { padding: 40, duration: 0 });

      resolve({ engine, instance: map, destroy: () => { try { map.remove(); } catch { /* noop */ } } });
    });
  });
}

// ────────────── combined-view inset (all four cones) ──────────────
// Tiny static-image inset: all four generated cones overlaid on a transparent
// disc. Returns a data-URL the panel can drop into an <img>. Pure canvas — no
// network, instant.
export function buildCombinedInset(doneDirs, size = 120) {
  const cvs = document.createElement("canvas");
  cvs.width = size; cvs.height = size;
  const ctx = cvs.getContext("2d");
  const cx = size / 2, cy = size / 2, R = size / 2 - 6;
  // backdrop disc
  ctx.fillStyle = "rgba(12,27,46,0.85)";
  ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI * 2); ctx.fill();
  for (const dk of ["N", "S", "E", "W"]) {
    if (!doneDirs[dk]) continue;
    const dir = DIRECTIONS[dk];
    const start = ((dir.bearing - dir.spread - 90) * Math.PI) / 180;
    const end = ((dir.bearing + dir.spread - 90) * Math.PI) / 180;
    const { r, g, b } = hexToRgb(dir.color);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0.18)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, start, end); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dir.color; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, start, end); ctx.closePath(); ctx.stroke();
  }
  // center tower dot
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  return cvs.toDataURL("image/png");
}

// ────────────── stats helpers ──────────────
// Compute obstruction stats + path loss + max obstruction height from a
// scipViewshed direction profile. Returns the full per-map stats object.
export function obstructionStats(profileDir, rangeMiles, towerHeightFt) {
  const profile = profileDir?.profile || [];
  const base = {
    pctObstructed: null, pctClear: null,
    firstObstructionMi: profileDir?.first_obstruction_mi ?? null,
    clear: !!profileDir?.clear,
    maxObstructionFt: null, maxObstructionMi: null,
    bestPathLossDb: null, worstPathLossDb: null,
  };
  if (!profile.length) return base;

  const blocked = profile.filter((p) => p.obstructed).length;
  const pctObstructed = Math.round((blocked / profile.length) * 100);

  // Max obstruction = highest ground+canopy among obstructed samples (ft AMSL).
  let maxObstructionFt = null, maxObstructionMi = null;
  for (const p of profile) {
    if (!p.obstructed) continue;
    const top = (p.ground_ft ?? 0) + TREE_CANOPY_FT;
    if (maxObstructionFt == null || top > maxObstructionFt) { maxObstructionFt = Math.round(top); maxObstructionMi = p.dist_mi; }
  }

  // Simple free-space path loss bracket at 700 MHz across the corridor
  // (best = nearest sample, worst = farthest). FSPL(dB)=96.6+20log10(d_mi)+20log10(f_GHz).
  const fGHz = 0.7;
  const dists = profile.map((p) => p.dist_mi).filter((d) => d > 0);
  const fspl = (dMi) => Math.round(96.6 + 20 * Math.log10(dMi) + 20 * Math.log10(fGHz));
  const bestPathLossDb = dists.length ? fspl(Math.min(...dists)) : null;
  const worstPathLossDb = dists.length ? fspl(Math.max(...dists)) : null;

  return {
    ...base,
    pctObstructed,
    pctClear: 100 - pctObstructed,
    maxObstructionFt, maxObstructionMi,
    bestPathLossDb, worstPathLossDb,
  };
}