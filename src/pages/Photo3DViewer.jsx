/**
 * Photo3DViewer — Photorealistic 3D Tower Site Visualization
 * Route: /photo-3d-viewer
 *
 * Loads CesiumJS dynamically from CDN, fetches the Google Maps API key
 * server-side via googleTilesSession, then renders the full 3D scene.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import { ArrowLeft, Box, Loader2, AlertTriangle, Download, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { googleTilesSession } from "@/functions/googleTilesSession";
import { base44 } from "@/api/base44Client";
import CesiumPhoto3DViewer from "@/components/photorealistic3d/CesiumPhoto3DViewer";
import Photo3DEditPanel from "@/components/photorealistic3d/Photo3DEditPanel";
import CameraControlBar from "@/components/photorealistic3d/CameraControlBar";

const CESIUM_VERSION = "1.122";
const CESIUM_CDN = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;

const DEFAULT_PARAMS = {
  towerType: "monopole",
  heightFt: 199,
  showMicrowave: false,
  compoundW: 75,
  compoundD: 75,
  showGenerator: true,
  showIceBridge: true,
  bufferFt: 25,
  showBuffer: true,
  showRFRadii: true,
};

function loadCesium(ionToken) {
  return new Promise((resolve, reject) => {
    if (window.Cesium) { resolve(); return; }

    // CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${CESIUM_CDN}/Widgets/widgets.css`;
    document.head.appendChild(link);

    // JS
    const script = document.createElement("script");
    script.src = `${CESIUM_CDN}/Cesium.js`;
    script.onload = () => {
      if (ionToken) window.Cesium.Ion.defaultAccessToken = ionToken;
      window.__CESIUM_ION_TOKEN__ = ionToken || "";
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load CesiumJS from CDN"));
    document.head.appendChild(script);
  });
}

export default function Photo3DViewer() {
  const location = useLocation();
  const routerState = location.state || {};

  // Params passed from TowerSiter via Generate3DPhotoButton
  const initLat = routerState.lat || null;
  const initLon = routerState.lon || null;
  const initControls = routerState.controls || {};
  const parcelAddress = routerState.parcelAddress || null;
  const landscapeBuffer = routerState.landscapeBuffer || 0; // from ordinance
  const ionToken = routerState.ionToken || null;

  const [status, setStatus] = useState("loading"); // loading | cesium | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const [apiKey, setApiKey] = useState(null);
  const [params, setParams] = useState({
    ...DEFAULT_PARAMS,
    heightFt: initControls.heightFt || 199,
    compoundW: initControls.compoundW || 75,
    compoundD: initControls.compoundD || 75,
  });
  const [treeMaturity, setTreeMaturity] = useState("initial");
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const viewerRef = useRef(null); // actual Cesium viewer (set from child)
  const orbitRef = useRef(null);

  useEffect(() => {
    (async () => {
      setStatus("loading");
      try {
        // 1. Fetch API key server-side (enforces tier quota)
        const res = await googleTilesSession({});
        const data = res?.data;

        if (data?.error === "upgrade_required") {
          setErrorMsg("upgrade_required");
          setStatus("error");
          return;
        }
        if (data?.error === "quota_exceeded") {
          setErrorMsg(data.message || "Daily quota exceeded.");
          setStatus("error");
          return;
        }
        if (!data?.apiKey) throw new Error(data?.error || "Could not load API key");

        setApiKey(data.apiKey);
        setStatus("cesium");

        // 2. Load CesiumJS from CDN
        const cfg = await base44.integrations.Core.InvokeLLM({ prompt: "ping" }).catch(() => null);
        // get ion token via publicConfig
        const { loadPublicConfig } = await import("@/lib/publicConfig");
        const pubCfg = await loadPublicConfig().catch(() => ({}));
        const cesiumIonToken = pubCfg?.cesiumIonToken || ionToken || "";

        await loadCesium(cesiumIonToken);
        setStatus("ready");
      } catch (e) {
        console.error("Photo3DViewer init error:", e);
        setErrorMsg(e.message || "Unknown error");
        setStatus("error");
      }
    })();
  }, []);

  // ── Camera presets ─────────────────────────────────────────────────────────
  const handlePreset = useCallback((preset) => {
    const viewer = window.__cesiumViewer__;
    if (!viewer) return;
    const Cesium = window.Cesium;
    const heightM = (params.heightFt || 199) * 0.3048;
    const lat = initLat, lon = initLon;

    const dist = heightM * 3;
    const pitch = Cesium.Math.toRadians(-65);

    const presetMap = {
      overhead: { dest: Cesium.Cartesian3.fromDegrees(lon, lat, heightM * 5), heading: 0, pitch: Cesium.Math.toRadians(-89) },
      north:    { dest: Cesium.Cartesian3.fromDegrees(lon, lat - 0.003, heightM * 2), heading: 0, pitch },
      south:    { dest: Cesium.Cartesian3.fromDegrees(lon, lat + 0.003, heightM * 2), heading: Cesium.Math.toRadians(180), pitch },
      east:     { dest: Cesium.Cartesian3.fromDegrees(lon - 0.003, lat, heightM * 2), heading: Cesium.Math.toRadians(90), pitch },
      west:     { dest: Cesium.Cartesian3.fromDegrees(lon + 0.003, lat, heightM * 2), heading: Cesium.Math.toRadians(270), pitch },
      hero:     { dest: Cesium.Cartesian3.fromDegrees(lon - 0.002, lat - 0.002, heightM * 0.4), heading: Cesium.Math.toRadians(45), pitch: Cesium.Math.toRadians(-15) },
    };

    const p = presetMap[preset];
    if (!p) return;
    viewer.camera.flyTo({ destination: p.dest, orientation: { heading: p.heading, pitch: p.pitch, roll: 0 }, duration: 2 });
  }, [initLat, initLon, params.heightFt]);

  // ── Auto-orbit ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = window.__cesiumViewer__;
    if (!viewer) return;
    const Cesium = window.Cesium;
    if (autoOrbit) {
      let angle = 0;
      const lat = initLat, lon = initLon;
      const heightM = (params.heightFt || 199) * 0.3048;
      const orbitR = heightM * 3;
      const tick = () => {
        angle += 0.003;
        const camLon = lon + Math.cos(angle) * orbitR / 111320;
        const camLat = lat + Math.sin(angle) * orbitR / 110540;
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(camLon, camLat, heightM * 1.8),
          orientation: {
            heading: Cesium.Math.toRadians(angle * 180 / Math.PI + 180),
            pitch: Cesium.Math.toRadians(-30),
            roll: 0,
          },
        });
        orbitRef.current = requestAnimationFrame(tick);
      };
      orbitRef.current = requestAnimationFrame(tick);
    } else {
      if (orbitRef.current) cancelAnimationFrame(orbitRef.current);
    }
    return () => { if (orbitRef.current) cancelAnimationFrame(orbitRef.current); };
  }, [autoOrbit, initLat, initLon, params.heightFt]);

  // ── Screenshot ─────────────────────────────────────────────────────────────
  const handleScreenshot = useCallback(() => {
    const viewer = window.__cesiumViewer__;
    if (!viewer) return;
    viewer.render();
    const canvas = viewer.scene.canvas;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `sitehawk-3d-${Date.now()}.png`;
    a.click();
  }, []);

  const handleReset = () => setParams({
    ...DEFAULT_PARAMS,
    heightFt: initControls.heightFt || 199,
    compoundW: initControls.compoundW || 75,
    compoundD: initControls.compoundD || 75,
  });

  if (!initLat || !initLon) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
        <p className="font-semibold text-foreground mb-1">No tower location provided</p>
        <p className="text-sm mb-4">Open this viewer from the Tower Siter after confirming a placement.</p>
        <Link to="/tower-siter"><Button variant="outline"><ArrowLeft className="w-4 h-4 mr-1" /> Back to Tower Siter</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0c1422]">
        <div className="flex items-center gap-3">
          <Link to="/tower-siter">
            <Button variant="ghost" size="sm" className="gap-1 text-white/60 hover:text-white hover:bg-white/10">
              <ArrowLeft className="w-4 h-4" /> Tower Siter
            </Button>
          </Link>
          <div className="w-px h-5 bg-white/15" />
          <Box className="w-4 h-4 text-indigo-400" />
          <span className="font-heading font-bold text-white text-sm">Photorealistic 3D Viewer</span>
          {parcelAddress && <span className="text-white/40 text-xs hidden md:inline">— {parcelAddress}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="border-white/15 text-white/70 hover:bg-white/10 gap-1.5" onClick={handleScreenshot} disabled={!viewerReady}>
            <Download className="w-3.5 h-3.5" /> PNG
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Viewer */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Camera bar */}
          <div className="px-3 py-2 border-b border-white/10 bg-[#0c1422]">
            <CameraControlBar
              onPreset={handlePreset}
              autoOrbit={autoOrbit}
              onToggleOrbit={() => setAutoOrbit(v => !v)}
              onScreenshot={handleScreenshot}
            />
          </div>

          {/* 3D canvas area */}
          <div className="flex-1 relative">
            {status === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span>Fetching session credentials…</span>
              </div>
            )}
            {status === "cesium" && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span>Loading CesiumJS engine…</span>
              </div>
            )}
            {status === "error" && errorMsg === "upgrade_required" && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="bg-[#0c1422] border border-white/10 rounded-2xl p-8 max-w-sm text-center space-y-4">
                  <Box className="w-10 h-10 text-indigo-400 mx-auto" />
                  <h2 className="font-heading font-bold text-white text-lg">HawkVision Required</h2>
                  <p className="text-white/60 text-sm">Photorealistic 3D Visualization requires HawkVision ($399/mo) or higher.</p>
                  <Link to="/pricing">
                    <Button className="w-full bg-indigo-600 hover:bg-indigo-500">Upgrade to HawkVision →</Button>
                  </Link>
                </div>
              </div>
            )}
            {status === "error" && errorMsg !== "upgrade_required" && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="bg-[#0c1422] border border-red-500/30 rounded-2xl p-6 max-w-sm text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                  <p className="text-white font-semibold">Could not load 3D viewer</p>
                  <p className="text-white/50 text-sm">{errorMsg}</p>
                </div>
              </div>
            )}
            {status === "ready" && apiKey && (
              <CesiumPhoto3DViewer
                apiKey={apiKey}
                lat={initLat}
                lon={initLon}
                params={params}
                treeMaturity={treeMaturity}
                onReady={() => setViewerReady(true)}
                onError={(e) => { setErrorMsg(e); setStatus("error"); }}
              />
            )}
          </div>
        </div>

        {/* Edit panel sidebar */}
        <div className="w-72 shrink-0 border-l border-white/10 bg-[#0c1422] overflow-y-auto p-3">
          <Photo3DEditPanel
            params={params}
            onChange={setParams}
            onReset={handleReset}
            treeMaturity={treeMaturity}
            setTreeMaturity={setTreeMaturity}
            landscapeBuffer={landscapeBuffer}
          />

          {/* Attribution */}
          <div className="mt-6 pt-4 border-t border-white/10 text-[10px] text-white/30 leading-relaxed">
            Imagery ©Google. Photorealistic 3D Tiles are served via Google Map Tiles API. Tower, compound and landscape models are parametric and for visualization purposes only — not a structural design or survey.
          </div>
        </div>
      </div>
    </div>
  );
}