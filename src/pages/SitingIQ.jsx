import { useState, useRef, useCallback, useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import RfiMap from "@/components/rfi/RfiMap";
import RfiControlPanel from "@/components/rfi/RfiControlPanel";
import DraggablePanel from "@/components/DraggablePanel";

const VIEW_MODES = ["normal", "expanded", "fullscreen"];

export default function SitingIQ() {
  const [overlays, setOverlays] = useState({ sites: true, rings: true });
  const [filters, setFilters] = useState({
    carriers: new Set(["ATT", "VZW", "TMO", "DISH", "OTHER"]),
    bands: new Set(["Low-Band", "Mid-Band", "C-Band", "mmWave"]),
    techs: new Set(["5G NR", "LTE", "UMTS", "GSM", "CDMA"]),
  });
  const [layers, setLayers] = useState({
    towers: true,
    coverage: true,
    deadzones: true,
    copernicus: false,
    oeaaa: false,
    environmental: false,
  });
  const [environmentalData, setEnvironmentalData] = useState(null);
  const [satelliteMode, setSatelliteMode] = useState("true_color");
  const [drawing, setDrawing] = useState(false);
  const [mapViewMode, setMapViewMode] = useState("normal");
  const drawCoverageRef = useRef(null);

  const registerDrawCoverage = useCallback((fn) => { drawCoverageRef.current = fn; }, []);
  const handleDrawCoverage = useCallback(() => { drawCoverageRef.current?.(); }, []);
  const cycleMapView = useCallback(() => {
    setMapViewMode((current) => VIEW_MODES[(VIEW_MODES.indexOf(current) + 1) % VIEW_MODES.length]);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMapViewMode("normal");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (mapViewMode === "fullscreen") document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [mapViewMode]);

  const controlPanel = (
    <RfiControlPanel
      overlays={overlays} setOverlays={setOverlays}
      filters={filters} setFilters={setFilters}
      layers={layers} setLayers={setLayers}
      onDrawCoverage={handleDrawCoverage} drawing={drawing}
      satelliteMode={satelliteMode} setSatelliteMode={setSatelliteMode}
      environmentalData={environmentalData}
    />
  );

  const map = (
    <RfiMap
      overlays={overlays}
      filters={filters}
      layers={layers}
      onRegisterDrawCoverage={registerDrawCoverage}
      onDrawingChange={setDrawing}
      satelliteMode={satelliteMode}
      onEnvironmentalData={setEnvironmentalData}
    />
  );

  const viewLabel = mapViewMode === "normal"
    ? "Expand map"
    : mapViewMode === "expanded"
      ? "Open fullscreen"
      : "Return to normal view";

  return (
    <div className={mapViewMode === "fullscreen" ? "fixed inset-0 z-[9999] bg-slate-950" : "p-4 sm:p-6"}>
      <div
        className={
          mapViewMode === "normal"
            ? "flex h-[calc(100vh-8rem)] min-h-[560px] flex-col gap-4 lg:flex-row"
            : mapViewMode === "expanded"
              ? "relative h-[calc(100vh-6rem)] min-h-[560px]"
              : "relative h-screen w-screen"
        }
      >
        {mapViewMode === "normal" && controlPanel}
        {mapViewMode === "expanded" && (
          <DraggablePanel
            defaultPos={{ x: 20, y: 80 }}
            className="h-[calc(100%-6rem)] w-72 max-h-[44rem]"
          >
            {controlPanel}
          </DraggablePanel>
        )}

        <div className="relative h-full min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/10 shadow-sm">
          {map}
          <button
            type="button"
            onClick={cycleMapView}
            title={viewLabel}
            aria-label={viewLabel}
            className="absolute right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-slate-950/90 text-white shadow-lg backdrop-blur transition hover:bg-slate-800"
          >
            {mapViewMode === "fullscreen" ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
          {mapViewMode !== "normal" && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-1 text-[10px] text-white/60">
              {mapViewMode === "expanded" ? "Drag the Siting IQ™ panel by its header · click expand again for fullscreen" : "Press Esc to exit fullscreen"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
