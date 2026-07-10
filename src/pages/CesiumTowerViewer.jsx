/**
 * CesiumTowerViewer — legacy in-app route kept for old links.
 * The interactive scene is now served directly by the
 * generateCesiumTowerViewer backend function as a full HTML page,
 * so this route simply forwards renderId/runId to it.
 */
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function CesiumTowerViewer() {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const renderId = urlParams.get("renderId") || urlParams.get("render_id");
    const runId = urlParams.get("runId") || urlParams.get("run_id");
    const qs = new URLSearchParams();
    if (renderId) qs.set("renderId", renderId);
    if (runId) qs.set("runId", runId);
    window.location.replace(`/functions/generateCesiumTowerViewer?${qs.toString()}`);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-white/60">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
        <span className="text-sm">Opening 3D Tower Exhibit…</span>
      </div>
    </div>
  );
}