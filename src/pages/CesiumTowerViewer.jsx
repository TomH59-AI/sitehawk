/**
 * CesiumTowerViewer — interactive Cesium scene for a Tower3DRender record.
 * Route: /cesium-tower-viewer?renderId=<Tower3DRender id>  (or ?runId=<TowerSitingRun id>)
 *
 * Hydrates via generateCesiumTowerViewer (Tower3DRender first, TowerSitingRun
 * fallback). Photorealistic Google 3D Tiles when available; Cesium Ion
 * terrain/imagery fallback otherwise. Never opens a blank/default globe —
 * missing inputs produce an explanatory empty state, with the saved
 * snapshot image as fallback.
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Box, Loader2, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateCesiumTowerViewer } from "@/functions/generateCesiumTowerViewer";
import CesiumPhoto3DViewer from "@/components/photorealistic3d/CesiumPhoto3DViewer";

const EXHIBIT_DISCLAIMER =
  "Preliminary Tower Siting Exhibit — NOT final engineering, NOT a stamped survey, and NOT a final zoning determination.";

const CESIUM_CDN = "https://cesium.com/downloads/cesiumjs/releases/1.122/Build/Cesium";

function loadCesium(ionToken) {
  return new Promise((resolve, reject) => {
    if (window.Cesium) {
      if (ionToken) window.Cesium.Ion.defaultAccessToken = ionToken;
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${CESIUM_CDN}/Widgets/widgets.css`;
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = `${CESIUM_CDN}/Cesium.js`;
    script.onload = () => {
      if (ionToken) window.Cesium.Ion.defaultAccessToken = ionToken;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load CesiumJS from CDN"));
    document.head.appendChild(script);
  });
}

export default function CesiumTowerViewer() {
  const urlParams = new URLSearchParams(window.location.search);
  const renderId = urlParams.get("renderId") || urlParams.get("render_id") || null;
  const runId = urlParams.get("runId") || urlParams.get("run_id") || null;

  const [status, setStatus] = useState("loading"); // loading | ready | empty | error
  const [payload, setPayload] = useState(null);
  const [missing, setMissing] = useState([]);
  const [snapshotFallback, setSnapshotFallback] = useState(null);
  const [tilesWarning, setTilesWarning] = useState(null);

  useEffect(() => {
    (async () => {
      if (!renderId && !runId) {
        setMissing(["No renderId or runId in the URL — open this viewer from a Tower3DRender record."]);
        setStatus("empty");
        return;
      }
      try {
        const { data } = await generateCesiumTowerViewer({ renderId, runId });
        setSnapshotFallback(data?.scene?.snapshot_image_url || null);
        setPayload(data);
        await loadCesium(data.ionToken || "");
        setStatus("ready");
      } catch (e) {
        const resp = e?.response?.data;
        setMissing(resp?.missing?.length ? resp.missing : [resp?.error || e.message || "Unknown error"]);
        setSnapshotFallback(resp?.snapshot_image_url || null);
        setStatus("empty");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-white/60">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
          <span className="text-sm">Loading 3D Tower Scene…</span>
        </div>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-8">
        <div className="bg-[#0c1422] border border-white/10 rounded-2xl p-8 max-w-md text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="font-heading font-bold text-white text-lg">Can't open the interactive 3D scene</h2>
          <div className="text-white/60 text-sm text-left space-y-1">
            <p className="text-white/40 text-xs uppercase tracking-wide">Missing input:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {missing.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
          {snapshotFallback && (
            <a href={snapshotFallback} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-1.5 text-sm text-indigo-400 hover:underline">
              <ImageIcon className="w-4 h-4" /> View saved 3D snapshot instead
            </a>
          )}
          <Link to="/tower-siter">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-500 gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Go to Tower Siter
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const scene = payload.scene;
  const viewerParams = {
    towerType: scene.tower_type || "monopole",
    heightFt: scene.tower_height_ft || 200,
    compoundW: scene.compound_width_ft || 75,
    compoundD: scene.compound_depth_ft || 75,
    bufferFt: scene.buffer_ft || 25,
    showBuffer: true,
    showOverlays: true,
    showMicrowave: false,
    showGenerator: false,
    showIceBridge: false,
    showRFRadii: false,
  };
  const sitingGeojson = {
    parcelBoundary: scene.parcel_geojson || null,
    compoundGeojson: scene.compound_geojson || null,
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex flex-col">
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
            {scene.property_address && (
              <span className="text-white/40 text-xs hidden md:inline ml-2">— {scene.property_address}</span>
            )}
          </div>
        </div>
        {snapshotFallback && (
          <a href={snapshotFallback} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 shrink-0">
            <ImageIcon className="w-3.5 h-3.5" /> Saved snapshot
          </a>
        )}
      </div>

      <div className="px-4 py-2 bg-amber-900/30 border-b border-amber-500/30 text-[11px] text-amber-300 text-center font-medium tracking-wide">
        ⚠ {EXHIBIT_DISCLAIMER}
      </div>

      {payload.missing?.length > 0 && (
        <div className="px-4 py-1.5 bg-orange-900/20 border-b border-orange-500/20 text-[11px] text-orange-300 text-center">
          ⚠ Partial data: {payload.missing.join("; ")} — rendering with available geometry.
        </div>
      )}
      {tilesWarning && (
        <div className="px-4 py-1.5 bg-yellow-900/20 border-b border-yellow-500/20 text-[11px] text-yellow-300 text-center">
          ⚠ Tiles: {tilesWarning}
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        <CesiumPhoto3DViewer
          apiKey={payload.googleKey || null}
          ionToken={payload.ionToken || null}
          lat={scene.lat}
          lon={scene.lon}
          params={viewerParams}
          treeMaturity="mature"
          viewMode="siteplan"
          sitingGeojson={sitingGeojson}
          onError={(e) => setTilesWarning(typeof e === "string" ? e : e?.message || "Viewer warning")}
        />
      </div>

      <div className="px-4 py-2 bg-[#0c1422] border-t border-white/10 text-[10px] text-white/40 text-center leading-relaxed">
        {scene.disclaimer_text}
      </div>
    </div>
  );
}