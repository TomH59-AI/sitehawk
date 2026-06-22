/**
 * Photo3DViewer — Preliminary Tower Siting Exhibit (Photorealistic 3D)
 * Route: /photo-3d-viewer
 *
 * Loads CesiumJS dynamically from CDN, fetches the Google Maps API key
 * server-side via googleTilesSession, renders the full 3D scene with real
 * GeoJSON siting overlays from TowerSitingRun.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import { ArrowLeft, Box, Loader2, AlertTriangle, Download, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { googleTilesSession } from "@/functions/googleTilesSession";
import { base44 } from "@/api/base44Client";
import CesiumPhoto3DViewer from "@/components/photorealistic3d/CesiumPhoto3DViewer";
import Photo3DEditPanel from "@/components/photorealistic3d/Photo3DEditPanel";
import CameraControlBar from "@/components/photorealistic3d/CameraControlBar";

const EXHIBIT_DISCLAIMER = "Preliminary Tower Siting Exhibit - NOT final engineering, NOT a stamped survey, and NOT a final zoning determination.";

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
  showOverlays: true,
};

function loadCesium(ionToken) {
  return new Promise((resolve, reject) => {
    if (window.Cesium) { resolve(); return; }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${CESIUM_CDN}/Widgets/widgets.css`;
    document.head.appendChild(link);

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

  const initLat = routerState.lat || null;
  const initLon = routerState.lon || null;
  const initControls = routerState.controls || {};
  const parcelAddress = routerState.parcelAddress || null;
  const landscapeBuffer = routerState.landscapeBuffer || 0;
  const ionToken = routerState.ionToken || null;
  const sitingGeojson = routerState.sitingGeojson || null;
  const sitingMeta = routerState.sitingMeta || null;

  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [apiKey, setApiKey] = useState(null);
  const [params, setParams] = useState({
    ...DEFAULT_PARAMS,
    heightFt: initControls.heightFt || 199,
    compoundW: initControls.compoundW || 75,
    compoundD: initControls.compoundD || 75,
    towerType: initControls.towerType || "monopole",
  });
  const [treeMaturity, setTreeMaturity] = useState("initial");
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const orbitRef = useRef(null);

  useEffect(() => {
    (async () => {
      setStatus("loading");
      try {
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

  // ── Center Target ──────────────────────────────────────────────────────────
  const handleCenterTarget = useCallback(() => {
    const viewer = window.__cesiumViewer__;
    if (!viewer || !initLat || !initLon) return;
    const Cesium = window.Cesium;
    const heightM = (params.heightFt || 199) * 0.3048;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(initLon - 0.002, initLat - 0.002, heightM * 2.5),
      orientation: { heading: Cesium.Math.toRadians(45), pitch: Cesium.Math.toRadians(-25), roll: 0 },
      duration: 2,
    });
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
      const tick = () => {
        angle += 0.003;
        const camLon = lon + Math.cos(angle) * heightM * 3 / 111320;
        const camLat = lat + Math.sin(angle) * heightM * 3 / 110540;
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(camLon, camLat, heightM * 1.8),
          orientation: { heading: Cesium.Math.toRadians(angle * 180 / Math.PI + 180), pitch: Cesium.Math.toRadians(-30), roll: 0 },
        });
        orbitRef.current = requestAnimationFrame(tick);
      };
      orbitRef.current = requestAnimationFrame(tick);
    } else {
      if (orbitRef.current) cancelAnimationFrame(orbitRef.current);
    }
    return () => { if (orbitRef.current) cancelAnimationFrame(orbitRef.current); };
  }, [autoOrbit, initLat, initLon, params.heightFt]);

  // ── Snapshot: upload + optionally persist to TowerVisualization ────────────
  const handleScreenshot = useCallback(async () => {
    const viewer = window.__cesiumViewer__;
    if (!viewer) return;
    setSavingSnapshot(true);
    try {
      viewer.render();
      const canvas = viewer.scene.canvas;

      // Convert canvas → Blob
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Canvas toBlob failed");

      // Upload via UploadFile integration
      const file = new File([blob], `sitehawk-3d-exhibit-${Date.now()}.png`, { type: "image/png" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Persist URL to TowerVisualization if we have a siting run link
      // We write to the most-recent TowerVisualization for this run if available
      if (sitingMeta?.towerSitingRunId) {
        const vizRecords = await base44.entities.TowerVisualization.filter(
          { parcel_id: sitingMeta.towerSitingRunId }, "-created_date", 1
        ).catch(() => []);
        if (vizRecords?.length > 0) {
          const viz = vizRecords[0];
          const existing = Array.isArray(viz.render_image_urls) ? viz.render_image_urls : [];
          await base44.entities.TowerVisualization.update(viz.id, {
            render_image_urls: [...existing, file_url],
          }).catch(() => {});
        }
      }

      // Always also trigger browser download as fallback
      const a = document.createElement("a");
      a.href = file_url;
      a.download = `sitehawk-3d-exhibit-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.error("Snapshot failed:", e);
      // Fallback: direct canvas download
      const viewer2 = window.__cesiumViewer__;
      if (viewer2) {
        const url = viewer2.scene.canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `sitehawk-3d-exhibit-${Date.now()}.png`;
        a.click();
      }
    } finally {
      setSavingSnapshot(false);
    }
  }, [sitingMeta]);

  const handleReset = () => setParams({
    ...DEFAULT_PARAMS,
    heightFt: initControls.heightFt || 199,
    compoundW: initControls.compoundW || 75,
    compoundD: initControls.compoundD || 75,
    towerType: initControls.towerType || "monopole",
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
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/tower-siter">
            <Button variant="ghost" size="sm" className="gap-1 text-white/60 hover:text-white hover:bg-white/10 shrink-0">
              <ArrowLeft className="w-4 h-4" /> Tower Siter
            </Button>
          </Link>
          <div className="w-px h-5 bg-white/15 shrink-0" />
          <Box className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="min-w-0">
            <span className="font-heading font-bold text-white text-sm">Preliminary Tower Siting Exhibit</span>
            {parcelAddress && <span className="text-white/40 text-xs hidden md:inline ml-2">— {parcelAddress}</span>}
            {sitingMeta?.jurisdictionName && <span className="text-white/30 text-xs hidden lg:inline ml-1">· {sitingMeta.jurisdictionName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="border-white/15 text-white/70 hover:bg-white/10 gap-1.5"
            onClick={handleCenterTarget}
            disabled={!viewerReady}
            title="Center on tower location"
          >
            <Crosshair className="w-3.5 h-3.5" /> Center Target
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/15 text-white/70 hover:bg-white/10 gap-1.5"
            onClick={handleScreenshot}
            disabled={!viewerReady || savingSnapshot}
          >
            {savingSnapshot
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />
            }
            {savingSnapshot ? "Saving…" : "Save Exhibit"}
          </Button>
        </div>
      </div>

      {/* Disclaimer banner */}
      <div className="px-4 py-2 bg-amber-900/30 border-b border-amber-500/30 text-[11px] text-amber-300 text-center font-medium tracking-wide">
        ⚠ {EXHIBIT_DISCLAIMER}
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
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-sm">Fetching session credentials…</span>
              </div>
            )}
            {status === "cesium" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-sm">Loading CesiumJS engine…</span>
              </div>
            )}
            {status === "error" && errorMsg === "upgrade_required" && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="bg-[#0c1422] border border-white/10 rounded-2xl p-8 max-w-sm text-center space-y-4">
                  <Box className="w-10 h-10 text-indigo-400 mx-auto" />
                  <h2 className="font-heading font-bold text-white text-lg">HawkVision Required</h2>
                  <p className="text-white/60 text-sm">Photorealistic 3D Tower Siting Exhibit requires HawkVision Pro or higher.</p>
                  <Link to="/pricing">
                    <Button className="w-full bg-indigo-600 hover:bg-indigo-500">Upgrade to HawkVision Pro →</Button>
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
                  <p className="text-white/30 text-xs">Check that your Google Maps API key is configured and has the Map Tiles API enabled.</p>
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
                sitingGeojson={sitingGeojson}
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
            hasSitingOverlays={!!(sitingGeojson?.parcelBoundary || sitingGeojson?.fallZone || sitingGeojson?.compoundGeojson)}
          />

          {/* Siting metadata */}
          {sitingMeta && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5 text-[11px] text-white/50">
              <p className="font-semibold text-white/70 text-xs uppercase tracking-wider mb-2">Siting Summary</p>
              {sitingMeta.towerHeightFt && <p>Height: <span className="text-white/80">{sitingMeta.towerHeightFt}′ AGL</span></p>}
              {sitingMeta.resultClass && <p>Result: <span className="text-white/80">{sitingMeta.resultClass.replace(/_/g, " ")}</span></p>}
              {sitingMeta.feasible != null && (
                <p>Feasibility: <span className={sitingMeta.feasible ? "text-emerald-400" : "text-red-400"}>
                  {sitingMeta.feasible ? "✓ Compliant placement found" : "✗ No compliant placement"}
                </span></p>
              )}
            </div>
          )}

          {/* Attribution + disclaimer */}
          <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-white/30 leading-relaxed space-y-2">
            <p>Imagery ©Google. Photorealistic 3D Tiles via Google Map Tiles API. Tower, compound and overlay geometries are parametric/deterministic — for visualization only.</p>
            <p className="text-amber-400/60">{EXHIBIT_DISCLAIMER}</p>
          </div>
        </div>
      </div>
    </div>
  );
}