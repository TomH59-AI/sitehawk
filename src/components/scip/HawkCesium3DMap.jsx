/**
 * HawkCesium3DMap — Interactive 3D RF / viewshed viewer for a tower site
 * candidate. Renders a full CesiumJS globe with world terrain + Bing-style
 * satellite imagery, a red waypoint pin + site-name label, concentric RF
 * radii rings (0.25 mi red · 0.5 mi orange · 1.0 mi yellow), zoom controls,
 * and N/S/E/W directional treeline views (−65° pitch low-angle flythrough).
 *
 * Centers on the resolved Target A parcel centroid. This is the SCIP "Mapster
 * 3D" component that complements the static MapBox map suite.
 *
 * CesiumJS is loaded from CDN (idempotent). Cesium Ion token comes from the
 * app's public config (CESIUM_ION_API secret).
 */

import { useEffect, useRef, useState } from "react";
import { Globe2, AlertTriangle, ZoomIn, ZoomOut, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadPublicConfig } from "@/lib/publicConfig";

const CESIUM_VERSION = "1.116";
const MILE_M = 1609.344;

function loadCesium() {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  return new Promise((resolve, reject) => {
    const cssId = "cesium-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/Widgets/widgets.css`;
      document.head.appendChild(link);
    }
    const scriptId = "cesium-js";
    if (document.getElementById(scriptId)) {
      const wait = setInterval(() => {
        if (window.Cesium) { clearInterval(wait); resolve(window.Cesium); }
      }, 100);
      return;
    }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/Cesium.js`;
    script.onload = () => {
      window.CESIUM_BASE_URL = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`;
      resolve(window.Cesium);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

const DIRECTIONS = [
  { key: "N", label: "North", heading: 0 },
  { key: "E", label: "East", heading: 90 },
  { key: "S", label: "South", heading: 180 },
  { key: "W", label: "West", heading: 270 },
];

export default function HawkCesium3DMap({ targetA, siteName }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [terrainReady, setTerrainReady] = useState(false);
  const [error, setError] = useState(null);

  const hasTarget =
    targetA &&
    Number.isFinite(Number(targetA.latitude)) &&
    Number.isFinite(Number(targetA.longitude));
  const lat = hasTarget ? Number(targetA.latitude) : null;
  const lon = hasTarget ? Number(targetA.longitude) : null;
  const label = siteName || targetA?.owner || targetA?.parcel_address || "Site Candidate";

  // Init viewer once.
  useEffect(() => {
    if (!hasTarget) return;
    if (viewerRef.current) return; // guard React 18 StrictMode double-mount
    let cancelled = false;
    let terrainTimer = null;
    // Captured so cleanup can explicitly detach the tile listener — viewer.destroy()
    // won't remove a listener that closes over our React setter.
    let detachTiles = null;
    setStatus("loading");
    (async () => {
      try {
        const config = await loadPublicConfig();
        if (cancelled) return;
        if (!config.cesiumIonToken) throw new Error("CESIUM_ION_API token not configured");
        const Cesium = await loadCesium();
        if (cancelled || !containerRef.current) return;

        Cesium.Ion.defaultAccessToken = config.cesiumIonToken;

        // createWorldTerrainAsync awaits — resolve it BEFORE constructing the
        // viewer so we can re-check cancelled right after the heavy await.
        const terrainProvider = await Cesium.createWorldTerrainAsync();
        if (cancelled || !containerRef.current) return;

        const viewer = new Cesium.Viewer(containerRef.current, {
          terrainProvider,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
        });
        // Teardown may have fired during construction — if so, destroy this
        // orphan immediately and bail without ever assigning the ref.
        if (cancelled) { viewer.destroy(); return; }
        viewer.scene.globe.depthTestAgainstTerrain = true;

        // Satellite imagery from Ion (Bing aerial).
        try {
          const imagery = await Cesium.IonImageryProvider.fromAssetId(2);
          if (cancelled) { viewer.destroy(); return; }
          viewer.imageryLayers.addImageryProvider(imagery);
        } catch (_) { /* fall back to default imagery */ }

        if (cancelled) { viewer.destroy(); return; }
        viewerRef.current = viewer;
        setStatus("ready");

        // Gate placement / fly-to on first terrain tile load so directional
        // pitched views have real elevation under them (avoids the height race).
        const globe = viewer.scene.globe;
        const onTiles = () => {
          if (cancelled) return;
          if (globe.tilesLoaded) {
            setTerrainReady(true);
            detachTiles?.();
          }
        };
        detachTiles = () => {
          try { globe.tileLoadProgressEvent.removeEventListener(onTiles); } catch (_) { /* ignore */ }
          detachTiles = null;
        };
        globe.tileLoadProgressEvent.addEventListener(onTiles);
        // Fallback: if the event never settles, release after 4s.
        terrainTimer = setTimeout(() => { if (!cancelled) setTerrainReady(true); }, 4000);
      } catch (e) {
        console.error("Cesium 3D init failed:", e);
        if (!cancelled) {
          setError(e.message || "Cesium failed to initialize");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (terrainTimer) clearTimeout(terrainTimer);
      detachTiles?.(); // remove our React-setter listener before destroying the viewer
      if (viewerRef.current) {
        try { viewerRef.current.destroy(); } catch (_) { /* ignore */ }
        viewerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTarget]);

  // Draw waypoint + rings + initial fly-to once terrain has loaded.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (status !== "ready" || !terrainReady || !viewer || lat == null || lon == null) return;
    const Cesium = window.Cesium;

    viewer.entities.removeAll();

    // Red waypoint pin + site label.
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      billboard: undefined,
      point: {
        pixelSize: 16,
        color: Cesium.Color.fromCssColorString("#DC2626"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: label,
        font: "bold 13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("rgba(12,27,46,0.9)"),
        pixelOffset: new Cesium.Cartesian2(0, -26),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    // Concentric RF radii rings.
    const rings = [
      { mi: 0.25, color: "#DC2626", alpha: 0.10 },
      { mi: 0.5, color: "#F97316", alpha: 0.08 },
      { mi: 1.0, color: "#EAB308", alpha: 0.05 },
    ];
    rings.forEach((r) => {
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        ellipse: {
          semiMajorAxis: r.mi * MILE_M,
          semiMinorAxis: r.mi * MILE_M,
          fill: true,
          material: Cesium.Color.fromCssColorString(r.color).withAlpha(r.alpha),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(r.color),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          classificationType: Cesium.ClassificationType.TERRAIN,
        },
      });
    });

    // Initial oblique fly-to.
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.012, 1400),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 1.2,
    });
  }, [status, terrainReady, lat, lon, label]);

  const zoom = (factor) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.zoomIn(viewer.camera.positionCartographic.height * factor);
  };

  const flyDirection = (heading) => {
    const viewer = viewerRef.current;
    if (!viewer || lat == null || lon == null) return;
    const Cesium = window.Cesium;
    // Low-angle treeline view looking out along the bearing from the site.
    const offset = 0.015;
    const rad = (heading * Math.PI) / 180;
    // Camera sits opposite the look direction so it faces outward along heading.
    const camLat = lat - Math.cos(rad) * offset;
    const camLon = lon - Math.sin(rad) * offset;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(camLon, camLat, 600),
      orientation: {
        heading: Cesium.Math.toRadians(heading),
        pitch: Cesium.Math.toRadians(-65),
        roll: 0,
      },
      duration: 1.0,
    });
  };

  if (!hasTarget) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-heading font-bold text-amber-900 dark:text-amber-200 text-sm">
            Hawk 3D RF / Viewshed Map
          </div>
          <div className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
            Run Hawk Parcel Details first to resolve Target A — the 3D viewer centers on the chosen Target A parcel centroid.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden no-print">
      <div className="bg-gradient-to-r from-slate-950 to-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Globe2 className="w-5 h-5 text-cyan-300" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-cyan-300/80">SCIP · MAPSTER 3D</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk 3D RF / Viewshed Map</h2>
            <div className="text-[11px] font-mono opacity-90 mt-0.5">
              {label} · {lat.toFixed(6)}, {lon.toFixed(6)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {DIRECTIONS.map((d) => (
            <Button
              key={d.key}
              size="sm"
              variant="secondary"
              className="bg-white/10 hover:bg-white/20 text-white border-0 h-8"
              onClick={() => flyDirection(d.heading)}
            >
              <Compass className="w-3.5 h-3.5 mr-1" /> {d.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative w-full bg-[#0C1B2E]" style={{ height: 560 }}>
        <div ref={containerRef} className="absolute inset-0" />

        {status === "ready" && (
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
            <Button size="icon" variant="secondary" className="h-9 w-9 shadow-lg" onClick={() => zoom(-0.4)}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="secondary" className="h-9 w-9 shadow-lg" onClick={() => zoom(0.6)}>
              <ZoomOut className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Legend */}
        {status === "ready" && (
          <div className="absolute bottom-3 left-3 z-10 bg-slate-900/80 backdrop-blur-md rounded-lg px-3 py-2 text-[11px] text-white font-mono space-y-1 border border-white/10">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: "#DC2626" }} /> 0.25 mi</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: "#F97316" }} /> 0.50 mi</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: "#EAB308" }} /> 1.00 mi</div>
          </div>
        )}

        {(status === "loading" || status === "idle") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0C1B2E]">
            <div className="w-10 h-10 border-4 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
            <p className="font-heading font-semibold text-white mt-3 text-sm">Loading 3D terrain globe…</p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card p-6 text-center">
            <p className="font-heading font-semibold text-red-600 text-sm">3D viewer unavailable</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">{error}</p>
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 bg-muted/30 border-t border-border text-[11px] text-muted-foreground">
        Drag to orbit · scroll to zoom · use the N/S/E/W buttons for low-angle treeline obstruction views (−65° pitch). Rings show 0.25 / 0.50 / 1.00-mile RF coverage.
      </div>
    </div>
  );
}