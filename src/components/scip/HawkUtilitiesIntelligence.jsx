/**
 * HawkUtilitiesIntelligence — One-click Generate button that produces two
 * dedicated print pages in parallel via Promise.all, mirroring the exact
 * structure and conventions of HawkAerialIntelligence:
 *
 *   MAP 1 — Hawk Power Map   (satellite + SRC waypoint + Target A tower
 *                            pin + 0.5mi yellow ring + 1mi red ring +
 *                            ft distance label between SRC and Target A +
 *                            HIFLD transmission-line raster overlay
 *                            bound to the 1mi ring)
 *   MAP 2 — Hawk Fiber Map   (satellite + same SARF base + FCC fiber
 *                            broadband raster overlay bound to the 1mi ring)
 *
 * Engine: Mapbox GL JS v3.6.0 loaded via CDN — matches HawkAerialIntelligence
 * and SARFMap exactly. Coordinates: SRC comes in as props; Target A coords
 * are typed by the user into this component's two input fields (read from
 * the Hawk Parcel Details Target 1 rows above).
 *
 * Each map renders into its own container with break-inside:avoid so the
 * print/PDF output puts each on its own page.
 *
 * NOTE: External overlay tile URLs (HIFLD transmission, FCC fiber) are
 * declared as constants at the top — wired to the same raster-source
 * pattern Aerial uses for USGS contours and NWI. Real production tile
 * endpoints can be swapped in without touching the render flow.
 */

import { useEffect, useRef, useState } from "react";
import { Zap, Sparkles, Loader2, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

// HIFLD Electric Power Transmission Lines (ArcGIS REST export endpoint)
const HIFLD_TRANSMISSION_URL =
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query";
// FCC National Broadband Map — Fiber service area tiles (placeholder endpoint;
// real tile URL slots in here once schema is confirmed).
const FCC_FIBER_URL =
  "https://broadbandmap.fcc.gov/nbm/map/api/tile/fiber";

// ────────────── geometry helpers (match Aerial / SARFMap math) ──────────────
function buildCircle(lat, lon, radiusMiles, steps = 96) {
  const R = 3958.7613;
  const d = radiusMiles / R;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (i * 2 * Math.PI) / steps;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
    );
    const lon2 =
      lonRad +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(lat2)
      );
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}

function distFt(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 5280;
}

function ringBbox(lat, lon, radiusMiles = 1.0) {
  const ring = buildCircle(lat, lon, radiusMiles);
  const lons = ring.geometry.coordinates[0].map((c) => c[0]);
  const lats = ring.geometry.coordinates[0].map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

// ────────────── Mapbox GL JS loader (idempotent, matches Aerial) ──────────────
let mapboxLoadingPromise = null;
async function ensureMapboxLoaded() {
  if (window.mapboxgl) return;
  if (!mapboxLoadingPromise) {
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
  }
  await mapboxLoadingPromise;
}

// ────────────── reusable: SRC + Target A markers, two rings, distance label ──────────────
function decorateSarfBase(map, srcLat, srcLon, tgtLat, tgtLon) {
  const halfMile = buildCircle(srcLat, srcLon, 0.5);
  const oneMile = buildCircle(srcLat, srcLon, 1.0);

  map.addSource("hui-ring-1mi", { type: "geojson", data: oneMile });
  map.addLayer({
    id: "hui-ring-1mi-fill",
    type: "fill",
    source: "hui-ring-1mi",
    paint: { "fill-color": "#ef4444", "fill-opacity": 0.06 },
  });
  map.addLayer({
    id: "hui-ring-1mi-line",
    type: "line",
    source: "hui-ring-1mi",
    paint: { "line-color": "#ef4444", "line-width": 3 },
  });

  map.addSource("hui-ring-half", { type: "geojson", data: halfMile });
  map.addLayer({
    id: "hui-ring-half-fill",
    type: "fill",
    source: "hui-ring-half",
    paint: { "fill-color": "#facc15", "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "hui-ring-half-line",
    type: "line",
    source: "hui-ring-half",
    paint: { "line-color": "#facc15", "line-width": 3 },
  });

  // SRC waypoint marker
  const srcEl = document.createElement("div");
  srcEl.style.cssText = `
    width: 22px; height: 22px; border-radius: 50%;
    background: #06b6d4; border: 3px solid #fff;
    box-shadow: 0 0 0 2px #06b6d4, 0 0 12px rgba(6,182,212,0.8);
  `;
  new window.mapboxgl.Marker({ element: srcEl, anchor: "center" })
    .setLngLat([srcLon, srcLat])
    .setPopup(
      new window.mapboxgl.Popup({ offset: 18 }).setHTML(
        `<div style="font-family:monospace;font-size:11px;"><strong>SEARCH CENTER</strong><br/>${srcLat.toFixed(6)}, ${srcLon.toFixed(6)}</div>`
      )
    )
    .addTo(map);

  if (tgtLat != null && tgtLon != null) {
    const tgtEl = document.createElement("div");
    tgtEl.style.cssText = `
      width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
      background: rgba(15,23,42,0.92); border: 2px solid #f97316; border-radius: 50%;
      box-shadow: 0 0 0 2px rgba(249,115,22,0.5), 0 0 14px rgba(249,115,22,0.8);
      font-family: ui-monospace, monospace; font-weight: 700; color: #f97316; font-size: 16px;
    `;
    tgtEl.textContent = "📡";
    new window.mapboxgl.Marker({ element: tgtEl, anchor: "center" })
      .setLngLat([tgtLon, tgtLat])
      .setPopup(
        new window.mapboxgl.Popup({ offset: 22 }).setHTML(
          `<div style="font-family:monospace;font-size:11px;"><strong>TARGET A — TOWER</strong><br/>${tgtLat.toFixed(6)}, ${tgtLon.toFixed(6)}</div>`
        )
      )
      .addTo(map);

    const connector = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[srcLon, srcLat], [tgtLon, tgtLat]] },
      properties: {},
    };
    map.addSource("hui-connector", { type: "geojson", data: connector });
    map.addLayer({
      id: "hui-connector-line",
      type: "line",
      source: "hui-connector",
      paint: {
        "line-color": "#f97316",
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    });

    const midLat = (srcLat + tgtLat) / 2;
    const midLon = (srcLon + tgtLon) / 2;
    const ft = distFt(srcLat, srcLon, tgtLat, tgtLon);
    const ftLabel = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [midLon, midLat] },
          properties: { label: `${Math.round(ft).toLocaleString()} ft` },
        },
      ],
    };
    map.addSource("hui-ft-label", { type: "geojson", data: ftLabel });
    map.addLayer({
      id: "hui-ft-label-layer",
      type: "symbol",
      source: "hui-ft-label",
      layout: {
        "text-field": ["get", "label"],
        "text-size": 14,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#f97316",
        "text-halo-color": "#000",
        "text-halo-width": 2.5,
      },
    });
  }

  const coords = oneMile.geometry.coordinates[0];
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  map.fitBounds(
    [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: 60, duration: 0 }
  );
}

// ────────────── individual map renderers ──────────────
async function renderPowerMap(container, srcLat, srcLon, tgtLat, tgtLon, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [srcLon, srcLat], zoom: 13.2, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      // HIFLD transmission-line raster overlay bound to the 1-mile ring bbox.
      const [w, s, e, n] = ringBbox(srcLat, srcLon, 1.0);
      const tileUrl =
        `${HIFLD_TRANSMISSION_URL}?where=1=1&outFields=*&geometryType=esriGeometryEnvelope` +
        `&geometry=${w},${s},${e},${n}&inSR=4326&spatialRel=esriSpatialRelIntersects` +
        `&f=image&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true`;
      map.addSource("hui-hifld", {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 512,
        bounds: [w, s, e, n],
      });
      map.addLayer({
        id: "hui-hifld-layer",
        type: "raster",
        source: "hui-hifld",
        paint: { "raster-opacity": 0.85 },
      });
      decorateSarfBase(map, srcLat, srcLon, tgtLat, tgtLon);
      resolve(map);
    });
  });
}

async function renderFiberMap(container, srcLat, srcLon, tgtLat, tgtLon, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [srcLon, srcLat], zoom: 13.2, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      // FCC fiber broadband raster overlay bound to the 1-mile ring bbox.
      const [w, s, e, n] = ringBbox(srcLat, srcLon, 1.0);
      const tileUrl =
        `${FCC_FIBER_URL}/{z}/{x}/{y}.png?bbox={bbox-epsg-3857}`;
      map.addSource("hui-fcc-fiber", {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        bounds: [w, s, e, n],
      });
      map.addLayer({
        id: "hui-fcc-fiber-layer",
        type: "raster",
        source: "hui-fcc-fiber",
        paint: { "raster-opacity": 0.8 },
      });
      decorateSarfBase(map, srcLat, srcLon, tgtLat, tgtLon);
      resolve(map);
    });
  });
}

// ────────────── Map page wrapper (matches Aerial) ──────────────
function MapPage({ title, icon: Icon, statBlock, mapRef, height = 620 }) {
  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden"
      style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
    >
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-amber-300" />}
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-amber-300/80">
              SCIP · HAWK UTILITIES INTELLIGENCE
            </div>
            <h3 className="font-heading font-bold text-lg leading-tight">{title}</h3>
          </div>
        </div>
        {statBlock && <div className="text-xs font-mono text-amber-100">{statBlock}</div>}
      </div>
      <div className="relative w-full bg-card" style={{ height }}>
        <div ref={mapRef} className="absolute inset-0" />
      </div>
    </div>
  );
}

// ────────────── main component ──────────────
export default function HawkUtilitiesIntelligence({ srcLat, srcLon }) {
  // User-typed Target A coordinates (sole source of truth, matches Aerial).
  const [tgtLatStr, setTgtLatStr] = useState("");
  const [tgtLonStr, setTgtLonStr] = useState("");

  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const powerRef = useRef(null);
  const fiberRef = useRef(null);
  const mapsRef = useRef({ power: null, fiber: null });

  // Cleanup mapbox instances on unmount.
  useEffect(() => {
    return () => {
      Object.values(mapsRef.current).forEach((m) => m?.remove?.());
      mapsRef.current = { power: null, fiber: null };
    };
  }, []);

  async function handleGenerate() {
    if (srcLat == null || srcLon == null) {
      toast.error("Coordinates required — run a scan first.");
      return;
    }
    const tgtLat = parseFloat(tgtLatStr);
    const tgtLon = parseFloat(tgtLonStr);
    if (!Number.isFinite(tgtLat) || !Number.isFinite(tgtLon)) {
      toast.error("Type Target A latitude and longitude (from the Hawk Parcel Details rows above).");
      return;
    }

    setLoading(true);
    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (!token) {
        toast.error("Mapbox token unavailable.");
        setLoading(false);
        return;
      }
      await ensureMapboxLoaded();

      Object.values(mapsRef.current).forEach((m) => m?.remove?.());
      mapsRef.current = { power: null, fiber: null };

      await new Promise((r) => requestAnimationFrame(r));

      const [powerMap, fiberMap] = await Promise.all([
        renderPowerMap(powerRef.current, srcLat, srcLon, tgtLat, tgtLon, token),
        renderFiberMap(fiberRef.current, srcLat, srcLon, tgtLat, tgtLon, token),
      ]);

      mapsRef.current = { power: powerMap, fiber: fiberMap };

      setGenerated(true);
      toast.success("Hawk Utilities Intelligence generated 2 map pages.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Hawk Utilities Intelligence failed.");
    } finally {
      setLoading(false);
    }
  }

  const distanceStat =
    generated && Number.isFinite(parseFloat(tgtLatStr)) && Number.isFinite(parseFloat(tgtLonStr))
      ? `${Math.round(distFt(srcLat, srcLon, parseFloat(tgtLatStr), parseFloat(tgtLonStr))).toLocaleString()} ft SRC → Target A`
      : null;

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-orange-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · UTILITIES INTELLIGENCE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">Hawk Utilities Intelligence — Power · Fiber</h2>
            </div>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-white text-orange-700 hover:bg-orange-50 font-semibold shadow"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Regenerate" : "Generate with Hawk Utilities Intelligence"}</>
            )}
          </Button>
        </div>

        {/* Target A coord inputs */}
        <div className="p-4 bg-muted/30 border-t border-border">
          <div className="text-[11px] font-mono text-muted-foreground tracking-wider mb-2">
            TARGET A COORDINATES (type from the Hawk Parcel Details Target 1 rows above)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Target A Latitude</label>
              <input
                type="text"
                inputMode="decimal"
                value={tgtLatStr}
                onChange={(e) => setTgtLatStr(e.target.value)}
                placeholder="e.g. 27.950600"
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Target A Longitude</label>
              <input
                type="text"
                inputMode="decimal"
                value={tgtLonStr}
                onChange={(e) => setTgtLonStr(e.target.value)}
                placeholder="e.g. -82.457200"
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
          {(srcLat == null || srcLon == null) && (
            <div className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              Search Ring Center coordinates not yet set — run a scan first.
            </div>
          )}
        </div>
      </div>

      {/* Two dedicated map pages — each its own print page */}
      <MapPage title="Hawk Power Map" icon={Zap} statBlock={distanceStat} mapRef={powerRef} />
      <MapPage title="Hawk Fiber Map" icon={Cable} statBlock={distanceStat} mapRef={fiberRef} />
    </div>
  );
}