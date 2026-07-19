// HawkPerch 3D Verification View — Cesium + Google Photorealistic 3D Tiles
// rendered side-by-side with the 2D HawkPerch map. Mirrors the exact same
// deterministic fit geometry (parcel, setbacks, fall zone, compound, tower).
// Terrain/3D imagery is VISUAL VERIFICATION ONLY — it never changes the verdict.
import { useEffect, useRef, useState } from "react";
import { Box, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { googleTilesSession } from "@/functions/googleTilesSession";
import { loadPublicConfig } from "@/lib/publicConfig";
import { loadCesium } from "@/lib/cesiumLoader";
import { drawPerchScene, framePerchScene } from "@/components/hawkfit/perch3dScene";

export default function HawkPerch3DView({ siteTarget, towerLngLat, fit, controls, savedTargets }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const entitiesRef = useRef([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [baseSource, setBaseSource] = useState(null); // "google" | "ion"

  const start = async () => {
    setStatus("loading");
    setError(null);
    try {
      let apiKey = null;
      try {
        const { data } = await googleTilesSession({});
        if (data?.error === "upgrade_required") {
          setError("Photorealistic Google 3D Tiles require HawkVision or higher — using Cesium aerial imagery instead.");
        } else if (data?.error === "quota_exceeded") {
          setError(data.message || "Daily 3D Tiles quota reached — using Cesium aerial imagery instead.");
        } else if (data?.apiKey) {
          apiKey = data.apiKey;
        }
      } catch { /* fall through to Cesium Ion */ }

      const pubCfg = await loadPublicConfig().catch(() => ({}));
      await loadCesium(pubCfg?.cesiumIonToken || "");
      const Cesium = window.Cesium;
      if (!containerRef.current) return;

      const viewer = new Cesium.Viewer(containerRef.current, {
        baseLayerPicker: false, geocoder: false, homeButton: false,
        sceneModePicker: false, navigationHelpButton: false,
        animation: false, timeline: false, fullscreenButton: false,
        infoBox: false, selectionIndicator: false,
        creditContainer: document.createElement("div"),
      });
      viewer.imageryLayers.removeAll();
      viewerRef.current = viewer;

      let loaded = false;
      if (apiKey) {
        try {
          const tileset = await Cesium.Cesium3DTileset.fromUrl(
            `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`,
            { showCreditsOnScreen: true }
          );
          viewer.scene.primitives.add(tileset);
          setBaseSource("google");
          loaded = true;
        } catch { /* fall back to Ion */ }
      }
      if (!loaded && Cesium.Ion.defaultAccessToken) {
        try {
          viewer.imageryLayers.addImageryProvider(await Cesium.IonImageryProvider.fromAssetId(2275207));
          try { viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1); } catch { /* flat terrain */ }
          setBaseSource("ion");
          loaded = true;
        } catch { /* last resort below */ }
      }
      if (!loaded) throw new Error("No 3D imagery source available — check the Google Maps key and Cesium Ion token.");

      setStatus("ready");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  };

  // Cleanup on unmount
  useEffect(() => () => {
    if (viewerRef.current) { try { viewerRef.current.destroy(); } catch { /* already gone */ } }
    viewerRef.current = null;
  }, []);

  // Live redraw — mirrors every 2D change (tower drag, controls, D/E/F saves)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (status !== "ready" || !viewer) return;
    const Cesium = window.Cesium;
    entitiesRef.current.forEach((e) => { try { viewer.entities.remove(e); } catch { /* removed */ } });
    entitiesRef.current = drawPerchScene(viewer, Cesium, { siteTarget, towerLngLat, fit, controls, savedTargets });
  }, [status, siteTarget, towerLngLat, fit, controls, savedTargets]);

  // Frame the camera once per parcel
  const parcelKey = siteTarget ? `${siteTarget.latitude},${siteTarget.longitude}` : "none";
  useEffect(() => {
    const viewer = viewerRef.current;
    if (status !== "ready" || !viewer || !siteTarget) return;
    framePerchScene(viewer, window.Cesium, { siteTarget, towerLngLat, heightFt: controls?.heightFt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, parcelKey]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-border bg-[#0a0f1a]">
      <div ref={containerRef} className="w-full h-full" />

      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          {status === "loading" ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-sm text-white/70">Loading 3D verification view…</span>
            </>
          ) : status === "error" ? (
            <>
              <AlertTriangle className="w-7 h-7 text-amber-400" />
              <p className="text-sm text-white/70 max-w-xs">{error}</p>
              <Button size="sm" variant="outline" onClick={start}>Retry</Button>
            </>
          ) : (
            <>
              <Box className="w-8 h-8 text-primary" />
              <p className="text-sm text-white/80 font-semibold">3D Verification View</p>
              <p className="text-xs text-white/50 max-w-xs">
                Photorealistic Google 3D Tiles with the exact parcel, setback, fall-zone and compound lines from the 2D verdict.
              </p>
              <Button size="sm" onClick={start}>Load 3D View</Button>
            </>
          )}
        </div>
      )}

      {status === "ready" && (
        <>
          {error && (
            <div className="absolute left-2 top-2 z-10 max-w-[70%] rounded-md bg-amber-900/80 px-2.5 py-1.5 text-[10px] text-amber-200">{error}</div>
          )}
          <div className="absolute bottom-2 left-2 z-10 rounded-md bg-black/60 px-2.5 py-1.5 text-[10px] text-white/70">
            {baseSource === "google" ? "Google Photorealistic 3D Tiles" : "Cesium Ion aerial"} · Visual verification only — verdict comes from the 2D parcel geometry
          </div>
        </>
      )}
    </div>
  );
}