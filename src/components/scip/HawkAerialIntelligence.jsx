/**
 * HawkAerialIntelligence — One-click Generate button that produces three
 * dedicated print pages in parallel via Promise.all:
 *
 *   MAP 1 — Hawk Aerial View   (satellite + SRC waypoint + Target A tower
 *                              pin + 0.5mi yellow ring + 1mi red ring +
 *                              ft distance label between SRC and Target A)
 *   MAP 2 — Hawk Topography    (satellite + USGS contour raster overlay
 *                              bound to the 1mi ring + AMSL ft labels
 *                              at SRC and Target A via pointElevation)
 *   MAP 3 — Hawk Wetlands      (satellite + USFWS NWI WMS overlay
 *                              preserving native blue water symbology +
 *                              wetland presence flag at Target A via
 *                              wetlandsLookup)
 *
 * Engine: Mapbox GL JS v3.6.0 loaded via CDN — matches SARFMap exactly.
 * Coordinates: SRC comes in as props; Target A coordinates are typed by
 * the user into this component's two input fields (the user reads them
 * off the Hawk Parcel Details Target 1 rows above).
 *
 * Each map is rendered into its own container with break-inside:avoid so
 * the print/PDF output puts each on its own page.
 */

import { useEffect, useRef, useState } from "react";
import { Plane, Sparkles, Loader2, Mountain, Droplets, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";
import { pointElevation } from "@/functions/pointElevation";
import { wetlandsLookup } from "@/functions/wetlandsLookup";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const SAT_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

const USGS_CONTOUR_URL =
  "https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/export";
const NWI_WMS_URL =
  "https://www.fws.gov/wetlandsmapservice/services/Wetlands/MapServer/WMSServer";

// ────────────── geometry helpers (match SARFMap math) ──────────────
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

// Haversine distance in feet between two lat/lon pairs.
function distFt(lat1, lon1, lat2, lon2) {
  const R = 3958.7613; // miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 5280;
}

// 1-mile ring bbox → [west, south, east, north] in lon/lat degrees.
function ringBbox(lat, lon, radiusMiles = 1.0) {
  const ring = buildCircle(lat, lon, radiusMiles);
  const lons = ring.geometry.coordinates[0].map((c) => c[0]);
  const lats = ring.geometry.coordinates[0].map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

// ────────────── Mapbox GL JS loader (idempotent, matches SARFMap) ──────────────
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

// ────────────── reusable: add SRC + Target A markers, two rings, distance label ──────────────
function decorateSarfBase(map, srcLat, srcLon, tgtLat, tgtLon) {
  const halfMile = buildCircle(srcLat, srcLon, 0.5);
  const oneMile = buildCircle(srcLat, srcLon, 1.0);

  map.addSource("hai-ring-1mi", { type: "geojson", data: oneMile });
  map.addLayer({
    id: "hai-ring-1mi-fill",
    type: "fill",
    source: "hai-ring-1mi",
    paint: { "fill-color": "#ef4444", "fill-opacity": 0.06 },
  });
  map.addLayer({
    id: "hai-ring-1mi-line",
    type: "line",
    source: "hai-ring-1mi",
    paint: { "line-color": "#ef4444", "line-width": 3 },
  });

  map.addSource("hai-ring-half", { type: "geojson", data: halfMile });
  map.addLayer({
    id: "hai-ring-half-fill",
    type: "fill",
    source: "hai-ring-half",
    paint: { "fill-color": "#facc15", "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "hai-ring-half-line",
    type: "line",
    source: "hai-ring-half",
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

  // Target A tower icon marker (only if Target A coords provided)
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

    // Connector line + ft distance label midpoint
    const connector = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[srcLon, srcLat], [tgtLon, tgtLat]] },
      properties: {},
    };
    map.addSource("hai-connector", { type: "geojson", data: connector });
    map.addLayer({
      id: "hai-connector-line",
      type: "line",
      source: "hai-connector",
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
    map.addSource("hai-ft-label", { type: "geojson", data: ftLabel });
    map.addLayer({
      id: "hai-ft-label-layer",
      type: "symbol",
      source: "hai-ft-label",
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

  // Fit to 1-mile ring with padding
  const coords = oneMile.geometry.coordinates[0];
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  map.fitBounds(
    [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: 60, duration: 0 }
  );
}

// ────────────── individual map renderers ──────────────
async function renderAerialMap(container, srcLat, srcLon, tgtLat, tgtLon, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [srcLon, srcLat], zoom: 13.2, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
  return new Promise((resolve) => {
    map.on("load", () => {
      decorateSarfBase(map, srcLat, srcLon, tgtLat, tgtLon);
      resolve(map);
    });
  });
}

async function renderTopoMap(container, srcLat, srcLon, tgtLat, tgtLon, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [srcLon, srcLat], zoom: 13.2, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      // USGS contour raster overlay bound to the 1-mile ring bbox
      const [w, s, e, n] = ringBbox(srcLat, srcLon, 1.0);
      const tileUrl =
        `${USGS_CONTOUR_URL}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857` +
        `&size=512,512&dpi=96&format=png32&transparent=true&layers=show:9,14,19&f=image`;
      map.addSource("hai-usgs-contours", {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 512,
        bounds: [w, s, e, n],
      });
      map.addLayer({
        id: "hai-usgs-contours-layer",
        type: "raster",
        source: "hai-usgs-contours",
        paint: { "raster-opacity": 0.85 },
      });
      decorateSarfBase(map, srcLat, srcLon, tgtLat, tgtLon);
      resolve(map);
    });
  });
}

async function renderWetlandsMap(container, srcLat, srcLon, tgtLat, tgtLon, token) {
  window.mapboxgl.accessToken = token;
  const map = new window.mapboxgl.Map({
    container, style: SAT_STYLE, center: [srcLon, srcLat], zoom: 13.2, preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      // USFWS NWI WMS overlay — native blue water symbology preserved (layers=0).
      const tileUrl =
        `${NWI_WMS_URL}?service=WMS&request=GetMap&version=1.3.0` +
        `&layers=0&styles=&format=image/png&transparent=true` +
        `&crs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`;
      map.addSource("hai-nwi", {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
      });
      map.addLayer({
        id: "hai-nwi-layer",
        type: "raster",
        source: "hai-nwi",
        paint: { "raster-opacity": 0.85 },
      });
      decorateSarfBase(map, srcLat, srcLon, tgtLat, tgtLon);
      resolve(map);
    });
  });
}

// ────────────── Map page wrapper ──────────────
function MapPage({ title, icon: Icon, statBlock, mapRef, height = 620 }) {
  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden"
      style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
    >
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-cyan-300" />}
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-cyan-300/80">
              SCIP · HAWK AERIAL INTELLIGENCE
            </div>
            <h3 className="font-heading font-bold text-lg leading-tight">{title}</h3>
          </div>
        </div>
        {statBlock && <div className="text-xs font-mono text-cyan-100">{statBlock}</div>}
      </div>
      <div className="relative w-full bg-card" style={{ height }}>
        <div ref={mapRef} className="absolute inset-0" />
      </div>
    </div>
  );
}

// ────────────── main component ──────────────
export default function HawkAerialIntelligence({ srcLat, srcLon }) {
  // User-typed Target A coordinates (sole source of truth per spec).
  const [tgtLatStr, setTgtLatStr] = useState("");
  const [tgtLonStr, setTgtLonStr] = useState("");

  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [elevation, setElevation] = useState({ src: null, tgt: null });
  const [wetlandFlag, setWetlandFlag] = useState(null);

  const aerialRef = useRef(null);
  const topoRef = useRef(null);
  const wetlandsRef = useRef(null);
  const mapsRef = useRef({ aerial: null, topo: null, wetlands: null });

  // Cleanup mapbox instances on unmount.
  useEffect(() => {
    return () => {
      Object.values(mapsRef.current).forEach((m) => m?.remove?.());
      mapsRef.current = { aerial: null, topo: null, wetlands: null };
    };
  }, []);

  async function handleGenerate() {
    // Pre-flight gates
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

      // Dispose any prior maps.
      Object.values(mapsRef.current).forEach((m) => m?.remove?.());
      mapsRef.current = { aerial: null, topo: null, wetlands: null };

      // Wait one frame so the three refs exist with their final size.
      await new Promise((r) => requestAnimationFrame(r));

      // Parallel-render all three maps + parallel data fetches.
      const [aerialMap, topoMap, wetlandsMap, srcElevRes, tgtElevRes, wetRes] = await Promise.all([
        renderAerialMap(aerialRef.current, srcLat, srcLon, tgtLat, tgtLon, token),
        renderTopoMap(topoRef.current, srcLat, srcLon, tgtLat, tgtLon, token),
        renderWetlandsMap(wetlandsRef.current, srcLat, srcLon, tgtLat, tgtLon, token),
        pointElevation({ lat: srcLat, lon: srcLon }).catch(() => null),
        pointElevation({ lat: tgtLat, lon: tgtLon }).catch(() => null),
        wetlandsLookup({ lat: tgtLat, lon: tgtLon }).catch(() => null),
      ]);

      mapsRef.current = { aerial: aerialMap, topo: topoMap, wetlands: wetlandsMap };

      const srcEl = srcElevRes?.data?.elevation_ft;
      const tgtEl = tgtElevRes?.data?.elevation_ft;
      setElevation({
        src: Number.isFinite(srcEl) ? srcEl : null,
        tgt: Number.isFinite(tgtEl) ? tgtEl : null,
      });

      const wPresent = wetRes?.data?.wetlands_present;
      setWetlandFlag(
        wPresent === true
          ? `WETLANDS PRESENT — ${wetRes?.data?.wetland_type || "NWI feature"}`
          : wPresent === false
          ? "No wetlands at Target A (NWI)"
          : "NEEDS_HUMAN_REVIEW"
      );

      setGenerated(true);
      toast.success("Hawk Aerial Intelligence generated 3 map pages.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Hawk Aerial Intelligence failed.");
    } finally {
      setLoading(false);
    }
  }

  // Stat blocks shown in each map header
  const aerialStat =
    generated && Number.isFinite(parseFloat(tgtLatStr)) && Number.isFinite(parseFloat(tgtLonStr))
      ? `${Math.round(distFt(srcLat, srcLon, parseFloat(tgtLatStr), parseFloat(tgtLonStr))).toLocaleString()} ft SRC → Target A`
      : null;

  const topoStat = generated
    ? `SRC ${elevation.src != null ? elevation.src.toFixed(1) + " ft AMSL" : "NEEDS_HUMAN_REVIEW"} · Target A ${elevation.tgt != null ? elevation.tgt.toFixed(1) + " ft AMSL" : "NEEDS_HUMAN_REVIEW"}`
    : null;

  const wetlandsStat = generated ? wetlandFlag : null;

  return (
    <div className="space-y-4">
      {/* Control banner */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · AERIAL INTELLIGENCE</div>
              <h2 className="font-heading font-bold text-lg leading-tight">Hawk Aerial Intelligence — Aerial · Topography · Wetlands</h2>
            </div>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Regenerate" : "Generate with Hawk Aerial Intelligence"}</>
            )}
          </Button>
        </div>

        {/* Target A coord inputs — sole source of truth per spec */}
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
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
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

      {/* Three dedicated map pages — each its own print page */}
      <MapPage title="Hawk Aerial View" icon={Radio} statBlock={aerialStat} mapRef={aerialRef} />
      <MapPage title="Hawk Topography" icon={Mountain} statBlock={topoStat} mapRef={topoRef} />
      <MapPage title="Hawk Wetlands" icon={Droplets} statBlock={wetlandsStat} mapRef={wetlandsRef} />
    </div>
  );
}