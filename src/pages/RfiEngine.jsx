import { useState, useRef, useCallback } from "react";
import RfiMap from "@/components/rfi/RfiMap";
import RfiControlPanel from "@/components/rfi/RfiControlPanel";

// RF Intelligence Engine — in-app nationwide RF map (USGS tiles). All controls
// (overlays + carrier/band/technology filters) live in the left panel so nothing
// floats over the map edge.
export default function RfiEngine() {
  const [overlays, setOverlays] = useState({ sites: true, rings: true });
  const [filters, setFilters] = useState({
    carriers: new Set(["ATT", "VZW", "TMO", "DISH", "OTHER"]),
    bands: new Set(["Low-Band", "Mid-Band", "C-Band", "mmWave"]),
    techs: new Set(["5G NR", "LTE", "UMTS", "GSM", "CDMA"]),
  });
  const [layers, setLayers] = useState({ towers: true, coverage: true, deadzones: true, copernicus: false });
  const [satelliteMode, setSatelliteMode] = useState("true_color");
  const [drawing, setDrawing] = useState(false);
  const drawCoverageRef = useRef(null);

  const registerDrawCoverage = useCallback((fn) => { drawCoverageRef.current = fn; }, []);
  const handleDrawCoverage = useCallback(() => { drawCoverageRef.current?.(); }, []);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)] min-h-[560px]">
        <RfiControlPanel
          overlays={overlays} setOverlays={setOverlays}
          filters={filters} setFilters={setFilters}
          layers={layers} setLayers={setLayers}
          onDrawCoverage={handleDrawCoverage} drawing={drawing}
          satelliteMode={satelliteMode} setSatelliteMode={setSatelliteMode}
        />
        <div className="relative flex-1 rounded-2xl overflow-hidden border border-white/10 shadow-sm">
          <RfiMap
            overlays={overlays}
            filters={filters}
            layers={layers}
            onRegisterDrawCoverage={registerDrawCoverage}
            onDrawingChange={setDrawing}
            satelliteMode={satelliteMode}
          />
        </div>
      </div>
    </div>
  );
}