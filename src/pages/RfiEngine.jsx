import { useState } from "react";
import RfiMap from "@/components/rfi/RfiMap";
import RfiControlPanel from "@/components/rfi/RfiControlPanel";

// RF Intelligence Engine — in-app nationwide RF map (USGS tiles) with a control
// panel to toggle the user's own site pins and search rings on top of it.
export default function RfiEngine() {
  const [overlays, setOverlays] = useState({ sites: true, rings: true });

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)] min-h-[560px]">
        <RfiControlPanel overlays={overlays} setOverlays={setOverlays} />
        <div className="relative flex-1 rounded-2xl overflow-hidden border border-white/10 shadow-sm">
          <RfiMap overlays={overlays} />
        </div>
      </div>
    </div>
  );
}