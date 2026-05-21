import { useEffect, useRef, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

// Lightweight Cesium Ion 2D viewer (SCENE2D) — loads CesiumJS from CDN on mount.
// Renders a waypoint marker + 0.5 and 1.0-mile rings around the entered coords.

const CESIUM_VERSION = "1.116";

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

export default function CesiumViewer({ centerLat, centerLon }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await loadPublicConfig();
        if (!config.cesiumIonToken) {
          throw new Error("CESIUM_ION_API token not configured");
        }
        const Cesium = await loadCesium();
        if (cancelled || !containerRef.current) return;

        Cesium.Ion.defaultAccessToken = config.cesiumIonToken;

        const viewer = new Cesium.Viewer(containerRef.current, {
          sceneMode: Cesium.SceneMode.SCENE2D,
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

        viewerRef.current = viewer;
        setStatus("ready");
      } catch (e) {
        console.error("Cesium init failed:", e);
        if (!cancelled) {
          setError(e.message || "Cesium failed to initialize");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        try { viewerRef.current.destroy(); } catch (_) { /* ignore */ }
        viewerRef.current = null;
      }
    };
  }, []);

  // Draw waypoint + rings whenever center changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (status !== "ready" || !viewer || centerLat == null || centerLon == null) return;
    const Cesium = window.Cesium;

    viewer.entities.removeAll();

    // Waypoint marker
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat),
      point: { pixelSize: 14, color: Cesium.Color.fromCssColorString("#2563EB"), outlineColor: Cesium.Color.WHITE, outlineWidth: 3 },
      label: {
        text: `${centerLat.toFixed(6)}, ${centerLon.toFixed(6)}`,
        font: "11px sans-serif",
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("rgba(12,27,46,0.85)"),
        pixelOffset: new Cesium.Cartesian2(0, -22),
        style: Cesium.LabelStyle.FILL,
      },
    });

    // 0.5-mile ring
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat),
      ellipse: {
        semiMajorAxis: 0.5 * 1609.344,
        semiMinorAxis: 0.5 * 1609.344,
        fill: true,
        material: Cesium.Color.fromCssColorString("#EAB308").withAlpha(0.10),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#EAB308"),
        outlineWidth: 2,
        height: 0,
      },
    });

    // 1.0-mile ring
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat),
      ellipse: {
        semiMajorAxis: 1.0 * 1609.344,
        semiMinorAxis: 1.0 * 1609.344,
        fill: true,
        material: Cesium.Color.fromCssColorString("#DC2626").withAlpha(0.05),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#DC2626"),
        outlineWidth: 2,
        height: 0,
      },
    });

    // Fit to 1-mile ring
    viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromCartesianArray([
        Cesium.Cartesian3.fromDegrees(centerLon - 0.025, centerLat - 0.018),
        Cesium.Cartesian3.fromDegrees(centerLon + 0.025, centerLat + 0.018),
      ]),
      duration: 0.6,
    });
  }, [status, centerLat, centerLon]);

  return (
    <div className="relative w-full h-full bg-[#0C1B2E]">
      <div ref={containerRef} className="w-full h-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/95">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="font-heading font-semibold text-foreground mt-3 text-sm">Loading Cesium 2D viewer…</p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card p-6 text-center">
          <p className="font-heading font-semibold text-red-600 text-sm">Cesium viewer unavailable</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">{error}</p>
        </div>
      )}
    </div>
  );
}