/**
 * Photo3DViewer — Preliminary Tower Siting Exhibit (Photorealistic 3D)
 * Route: /photo-3d-viewer?runId=<id>
 *
 * Data priority:
 *   1. location.state (passed by GeneratePhoto3DButton)
 *   2. TowerSitingRun.get(runId) hydration on refresh/deep-link
 *   3. If neither is available → empty state (no silent DEFAULT_PARAMS globe)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Box, Loader2, AlertTriangle, Download, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { googleTilesSession } from "@/functions/googleTilesSession";
import { base44 } from "@/api/base44Client";
import CesiumPhoto3DViewer from "@/components/photorealistic3d/CesiumPhoto3DViewer";
import Photo3DEditPanel from "@/components/photorealistic3d/Photo3DEditPanel";
import CameraControlBar from "@/components/photorealistic3d/CameraControlBar";

const EXHIBIT_DISCLAIMER =
  "Preliminary Tower Siting Exhibit — NOT final engineering, NOT a stamped survey, and NOT a final zoning determination.";

const CESIUM_VERSION = "1.122";
const CESIUM_CDN = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;

const DEFAULT_VIEWER_PARAMS = {
  towerType: "monopole",
  heightFt: 199,
  showMicrowave: false,
  compoundW: 100,
  compoundD: 100,
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

/** Map a TowerSitingRun DB record into the viewer model shape */
function hydrateFromRun(run) {
  if (!run) return null;
  const lat = run.parcel_centroid_lat || run.siting_result?.towerLonLat?.[1] || null;
  const lon = run.parcel_centroid_lon || run.siting_result?.towerLonLat?.[0] || null;
  if (!lat || !lon) return null;

  return {
    lat,
    lon,
    centroidLat: lat,
    centroidLon: lon,
    controls: {
      heightFt: run.tower_height_ft || 199,
      compoundW: run.compound_width_ft || 75,
      compoundD: run.compound_depth_ft || 75,
      towerType: run.tower_type || "monopole",
    },
    landscapeBuffer: 0,
    parcelAddress: run.property_address || null,
    siteName: run.property_address || null,
    towerSitingRunId: run.id,
    scipRecordId: run.scip_record_id || null,
    parcelId: run.parcel_id || null,
    sitingGeojson: {
      parcelBoundary: run.parcel_geometry || null,
      candidateArea: run.candidate_area_geojson || null,
      compoundGeojson: run.compound_geojson || null,
      fallZone: run.fall_zone_geojson || null,
      propertySetback: run.property_setback_geojson || null,
      conflictLayers: run.conflict_layers_geojson || null,
    },
    sitingMeta: {
      towerSitingRunId: run.id,
      resultClass: run.result_class || null,
      feasible: run.feasible ?? null,
      jurisdictionName: run.jurisdiction_name || null,
      towerHeightFt: run.tower_height_ft || 199,
    },
    exhibitDisclaimer: EXHIBIT_DISCLAIMER,
  };
}

/** Validate that we have at least a center lat/lon — geometry is optional */
function hasValidGeometry(viewerData) {
  if (!viewerData) return false;
  return !!(viewerData.lat && viewerData.lon);
}

export default function Photo3DViewer() {
  const location = useLocation();
  const navigate = useNavigate();

  // Parse runId from URL query string
  const urlParams = new URLSearchParams(location.search);
  const urlRunId =
    urlParams.get("runId") ||
    urlParams.get("towerSitingRunId") ||
    urlParams.get("sitingRunId") ||
    urlParams.get("tower_siting_run_id") ||
    null;

  // ── Data hydration state ────────────────────────────────────────────────────
  const [viewerData, setViewerData] = useState(null); // normalized payload
  const [dataStatus, setDataStatus] = useState("hydrating"); // hydrating | ready | empty
  const [persistWarning, setPersistWarning] = useState(null);

  useEffect(() => {
    (async () => {
      const routerState = location.state;

      // 1. Router state (primary) — validate geometry
      if (routerState?.lat && routerState?.lon) {
        if (hasValidGeometry(routerState)) {
          setViewerData(routerState);
          if (routerState.persistWarning) setPersistWarning(routerState.persistWarning);
          setDataStatus("ready");
          return;
        }
      }

      // 2. Hydrate from DB by runId (refresh / deep-link)
      const runId =
        urlRunId ||
        routerState?.towerSitingRunId ||
        routerState?.sitingMeta?.towerSitingRunId ||
        null;

      if (runId) {
        try {
          const run = await base44.entities.TowerSitingRun.get(runId);
          const hydrated = hydrateFromRun(run);
          if (hydrated && hasValidGeometry(hydrated)) {
            setViewerData(hydrated);
            setDataStatus("ready");
            return;
          }
        } catch (e) {
          console.warn("[Photo3DViewer] Could not hydrate from TowerSitingRun:", e);
        }
      }

      // 3. Nothing valid — show empty state
      setDataStatus("empty");
    })();
  }, []); // run once on mount

  // ── Viewer UI params (separate from hydration data) ─────────────────────────
  const [viewerParams, setViewerParams] = useState(DEFAULT_VIEWER_PARAMS);

  // Sync params from viewerData once hydrated
  useEffect(() => {
    if (!viewerData) return;
    const c = viewerData.controls || {};
    setViewerParams((prev) => ({
      ...prev,
      heightFt: c.heightFt || 199,
      compoundW: c.compoundW || 75,
      compoundD: c.compoundD || 75,
      towerType: c.towerType || "monopole",
    }));
  }, [viewerData]);

  // ── Cesium / tiles loading ──────────────────────────────────────────────────
  const [cesiumStatus, setCesiumStatus] = useState("idle"); // idle | loading | cesium | ready | error
  const [tilesError, setTilesError] = useState(null); // non-fatal tile warning
  const [apiKey, setApiKey] = useState(null);
  const [ionToken, setIonToken] = useState("");
  const [viewerReady, setViewerReady] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [treeMaturity, setTreeMaturity] = useState("initial");
  const [viewMode, setViewMode] = useState("landowner"); // "landowner" | "siteplan"
  const [autoOrbit, setAutoOrbit] = useState(false);
  const orbitRef = useRef(null);

  // Only start Cesium once data is ready
  useEffect(() => {
    if (dataStatus !== "ready") return;
    (async () => {
      setCesiumStatus("loading");
      try {
        const res = await googleTilesSession({});
        const data = res?.data;

        if (data?.error === "upgrade_required") {
          setCesiumStatus("error_upgrade");
          return;
        }
        if (data?.error === "quota_exceeded") {
          setCesiumStatus("error_quota");
          setTilesError(data.message || "Daily quota exceeded.");
          return;
        }
        if (!data?.apiKey) {
          // Referrer restriction or other tile error — warn but continue rendering
          setTilesError(data?.error || "Google tile session unavailable (possible referrer restriction in builder preview). Vector overlays will still render.");
          // Continue with no apiKey — CesiumPhoto3DViewer handles null
        } else {
          setApiKey(data.apiKey);
        }

        setCesiumStatus("cesium");
        const { loadPublicConfig } = await import("@/lib/publicConfig");
        const pubCfg = await loadPublicConfig().catch(() => ({}));
        const cesiumIonToken = pubCfg?.cesiumIonToken || "";
        setIonToken(cesiumIonToken);
        await loadCesium(cesiumIonToken);
        setCesiumStatus("ready");
      } catch (e) {
        console.error("[Photo3DViewer] Cesium init error:", e);
        setCesiumStatus("error_generic");
        setTilesError(e.message || "Unknown error loading viewer");
      }
    })();
  }, [dataStatus]);

  // ── Camera helpers ──────────────────────────────────────────────────────────
  const initLat = viewerData?.lat;
  const initLon = viewerData?.lon;

  const handlePreset = useCallback((preset) => {
    const viewer = window.__cesiumViewer__;
    if (!viewer || !initLat || !initLon) return;
    const Cesium = window.Cesium;
    const heightM = (viewerParams.heightFt || 199) * 0.3048;
    const pitch = Cesium.Math.toRadians(-65);
    const presetMap = {
      overhead: { dest: Cesium.Cartesian3.fromDegrees(initLon, initLat, heightM * 5), heading: 0, pitch: Cesium.Math.toRadians(-89) },
      north:    { dest: Cesium.Cartesian3.fromDegrees(initLon, initLat - 0.003, heightM * 2), heading: 0, pitch },
      south:    { dest: Cesium.Cartesian3.fromDegrees(initLon, initLat + 0.003, heightM * 2), heading: Cesium.Math.toRadians(180), pitch },
      east:     { dest: Cesium.Cartesian3.fromDegrees(initLon - 0.003, initLat, heightM * 2), heading: Cesium.Math.toRadians(90), pitch },
      west:     { dest: Cesium.Cartesian3.fromDegrees(initLon + 0.003, initLat, heightM * 2), heading: Cesium.Math.toRadians(270), pitch },
      hero:     { dest: Cesium.Cartesian3.fromDegrees(initLon - 0.002, initLat - 0.002, heightM * 0.4), heading: Cesium.Math.toRadians(45), pitch: Cesium.Math.toRadians(-15) },
    };
    const p = presetMap[preset];
    if (!p) return;
    viewer.camera.flyTo({ destination: p.dest, orientation: { heading: p.heading, pitch: p.pitch, roll: 0 }, duration: 2 });
  }, [initLat, initLon, viewerParams.heightFt]);

  const handleCenterTarget = useCallback(() => {
    const viewer = window.__cesiumViewer__;
    if (!viewer || !initLat || !initLon) return;
    const Cesium = window.Cesium;
    const heightM = (viewerParams.heightFt || 199) * 0.3048;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(initLon - 0.002, initLat - 0.002, heightM * 2.5),
      orientation: { heading: Cesium.Math.toRadians(45), pitch: Cesium.Math.toRadians(-25), roll: 0 },
      duration: 2,
    });
  }, [initLat, initLon, viewerParams.heightFt]);

  useEffect(() => {
    const viewer = window.__cesiumViewer__;
    if (!viewer || !initLat || !initLon) return;
    const Cesium = window.Cesium;
    if (autoOrbit) {
      let angle = 0;
      const heightM = (viewerParams.heightFt || 199) * 0.3048;
      const tick = () => {
        angle += 0.003;
        const camLon = initLon + Math.cos(angle) * heightM * 3 / 111320;
        const camLat = initLat + Math.sin(angle) * heightM * 3 / 110540;
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
  }, [autoOrbit, initLat, initLon, viewerParams.heightFt]);

  // ── Screenshot ──────────────────────────────────────────────────────────────
  const handleScreenshot = useCallback(async () => {
    const viewer = window.__cesiumViewer__;
    if (!viewer) return;
    setSavingSnapshot(true);
    try {
      viewer.render();
      const canvas = viewer.scene.canvas;
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Canvas toBlob failed");
      const file = new File([blob], `sitehawk-3d-exhibit-${Date.now()}.png`, { type: "image/png" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const runId = viewerData?.towerSitingRunId || viewerData?.sitingMeta?.towerSitingRunId;
      if (runId) {
        base44.entities.TowerSitingRun.update(runId, {}).catch(() => {}); // keep run alive
        // Optionally save snapshot URL to TowerVisualization if linked
        const vizRecords = await base44.entities.TowerVisualization.filter(
          { parcel_id: runId }, "-created_date", 1
        ).catch(() => []);
        if (vizRecords?.length > 0) {
          const viz = vizRecords[0];
          const existing = Array.isArray(viz.render_image_urls) ? viz.render_image_urls : [];
          await base44.entities.TowerVisualization.update(viz.id, {
            render_image_urls: [...existing, file_url],
          }).catch(() => {});
        }
      }

      const a = document.createElement("a");
      a.href = file_url;
      a.download = `sitehawk-3d-exhibit-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.error("Snapshot failed:", e);
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
  }, [viewerData]);

  const handleReset = () => {
    const c = viewerData?.controls || {};
    setViewerParams({
      ...DEFAULT_VIEWER_PARAMS,
      heightFt: c.heightFt || 199,
      compoundW: c.compoundW || 75,
      compoundD: c.compoundD || 75,
      towerType: c.towerType || "monopole",
    });
  };

  // ── Empty / loading states ──────────────────────────────────────────────────

  // Still hydrating from DB
  if (dataStatus === "hydrating") {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-white/60">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
          <span className="text-sm">Loading 3D Exhibit…</span>
        </div>
      </div>
    );
  }

  // No valid run — guard against silent blank globe
  if (dataStatus === "empty") {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-8">
        <div className="bg-[#0c1422] border border-white/10 rounded-2xl p-10 max-w-md text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="font-heading font-bold text-white text-xl">No siting run loaded — run HawkPerch first.</h2>
          <p className="text-white/50 text-sm leading-relaxed">
            Open the Tower Siter, enter a parcel, confirm a placement, then click <strong className="text-white/80">3D Exhibit</strong>.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Link to="/tower-siter">
              <Button className="w-full bg-indigo-600 hover:bg-indigo-500 gap-1.5">
                <ArrowLeft className="w-4 h-4" /> Go to Tower Siter / HawkPerch
              </Button>
            </Link>
            <Button variant="ghost" className="text-white/40 hover:text-white/60 text-xs" onClick={() => navigate(-1)}>
              ← Go back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const sitingGeojson = viewerData.sitingGeojson || null;
  const sitingMeta = viewerData.sitingMeta || null;
  const parcelAddress = viewerData.parcelAddress || null;
  const landscapeBuffer = viewerData.landscapeBuffer || 0;
  const disclaimer = viewerData.exhibitDisclaimer || EXHIBIT_DISCLAIMER;

  // Upgrade-gated error
  if (cesiumStatus === "error_upgrade") {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-8">
        <div className="bg-[#0c1422] border border-white/10 rounded-2xl p-8 max-w-sm text-center space-y-4">
          <Box className="w-10 h-10 text-indigo-400 mx-auto" />
          <h2 className="font-heading font-bold text-white text-lg">HawkVision Required</h2>
          <p className="text-white/60 text-sm">Photorealistic 3D Tower Siting Exhibit requires HawkVision Pro or higher.</p>
          <Link to="/pricing">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-500">Upgrade to HawkVision Pro →</Button>
          </Link>
        </div>
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
            {sitingMeta?.jurisdictionName && (
              <span className="text-white/30 text-xs hidden lg:inline ml-1">· {sitingMeta.jurisdictionName}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-lg border border-white/15 overflow-hidden text-xs shrink-0">
            <button
              onClick={() => setViewMode("landowner")}
              className={`px-3 py-1.5 transition-colors ${viewMode === "landowner" ? "bg-indigo-600 text-white" : "text-white/50 hover:bg-white/10"}`}
            >
              Landowner View
            </button>
            <button
              onClick={() => setViewMode("siteplan")}
              className={`px-3 py-1.5 transition-colors ${viewMode === "siteplan" ? "bg-indigo-600 text-white" : "text-white/50 hover:bg-white/10"}`}
            >
              Site Plan View
            </button>
          </div>
          <Button
            size="sm" variant="outline"
            className="border-white/15 text-white/70 hover:bg-white/10 gap-1.5"
            onClick={handleCenterTarget}
            disabled={!viewerReady}
            title="Center on tower location"
          >
            <Crosshair className="w-3.5 h-3.5" /> Center Target
          </Button>
          <Button
            size="sm" variant="outline"
            className="border-white/15 text-white/70 hover:bg-white/10 gap-1.5"
            onClick={handleScreenshot}
            disabled={!viewerReady || savingSnapshot}
          >
            {savingSnapshot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {savingSnapshot ? "Saving…" : "Save Exhibit"}
          </Button>
        </div>
      </div>

      {/* Disclaimer banner */}
      <div className="px-4 py-2 bg-amber-900/30 border-b border-amber-500/30 text-[11px] text-amber-300 text-center font-medium tracking-wide">
        ⚠ {disclaimer}
      </div>

      {/* Non-fatal persist warning */}
      {persistWarning && (
        <div className="px-4 py-1.5 bg-orange-900/20 border-b border-orange-500/20 text-[11px] text-orange-300 text-center">
          ⚠ {persistWarning}
        </div>
      )}

      {/* Non-fatal tile warning intentionally hidden — the viewer falls back
          to Cesium Ion imagery silently instead of surfacing a Google error. */}

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Viewer */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-2 border-b border-white/10 bg-[#0c1422]">
            <CameraControlBar
              onPreset={handlePreset}
              autoOrbit={autoOrbit}
              onToggleOrbit={() => setAutoOrbit(v => !v)}
              onScreenshot={handleScreenshot}
            />
          </div>

          <div className="flex-1 relative">
            {(cesiumStatus === "loading" || cesiumStatus === "idle") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-sm">Fetching session credentials…</span>
              </div>
            )}
            {cesiumStatus === "cesium" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-sm">Loading CesiumJS engine…</span>
              </div>
            )}
            {cesiumStatus === "error_quota" && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="bg-[#0c1422] border border-red-500/30 rounded-2xl p-6 max-w-sm text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                  <p className="text-white font-semibold">Daily quota exceeded</p>
                  <p className="text-white/50 text-sm">{tilesError}</p>
                </div>
              </div>
            )}
            {cesiumStatus === "error_generic" && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="bg-[#0c1422] border border-red-500/30 rounded-2xl p-6 max-w-sm text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                  <p className="text-white font-semibold">Could not load 3D viewer</p>
                  <p className="text-white/50 text-sm">{tilesError}</p>
                  <p className="text-white/30 text-xs">Check that your Google Maps API key is configured and has the Map Tiles API enabled.</p>
                </div>
              </div>
            )}
            {cesiumStatus === "ready" && (
              <CesiumPhoto3DViewer
                apiKey={apiKey}
                ionToken={ionToken}
                lat={initLat}
                lon={initLon}
                params={viewerParams}
                treeMaturity={viewMode === "landowner" ? "mature" : treeMaturity}
                viewMode={viewMode}
                sitingGeojson={sitingGeojson}
                onReady={() => setViewerReady(true)}
                onError={(e) => {
                  console.warn("[Photo3DViewer] CesiumPhoto3DViewer error:", e);
                  setTilesError(typeof e === "string" ? e : e?.message || "Viewer error");
                }}
              />
            )}
          </div>
        </div>

        {/* Edit panel sidebar */}
        <div className="w-72 shrink-0 border-l border-white/10 bg-[#0c1422] overflow-y-auto p-3">
          <Photo3DEditPanel
            params={viewerParams}
            onChange={setViewerParams}
            onReset={handleReset}
            treeMaturity={treeMaturity}
            setTreeMaturity={setTreeMaturity}
            landscapeBuffer={landscapeBuffer}
            hasSitingOverlays={!!(sitingGeojson?.parcelBoundary || sitingGeojson?.fallZone || sitingGeojson?.compoundGeojson)}
          />

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
              {sitingMeta.towerSitingRunId && (
                <p className="text-white/30 truncate">Run ID: {sitingMeta.towerSitingRunId}</p>
              )}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-white/30 leading-relaxed space-y-2">
            <p>Imagery ©Google. Photorealistic 3D Tiles via Google Map Tiles API. Tower, compound and overlay geometries are parametric/deterministic — for visualization only.</p>
            <p className="text-amber-400/60">{disclaimer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}