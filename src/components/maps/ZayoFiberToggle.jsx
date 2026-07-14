import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { zayoFiberRoutes } from "@/functions/zayoFiberRoutes";

const SRC = "zayo-fiber-routes";
const COLOR = "#f59e0b";
const EMPTY = { type: "FeatureCollection", features: [] };

function addLayers(map, data) {
  if (!map.getSource(SRC)) {
    map.addSource(SRC, { type: "geojson", data });
    map.addLayer({
      id: `${SRC}-line`, type: "line", source: SRC,
      filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
      paint: { "line-color": COLOR, "line-width": 3, "line-opacity": 0.9 },
    });
    map.addLayer({
      id: `${SRC}-point`, type: "circle", source: SRC,
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 5, "circle-color": COLOR, "circle-stroke-color": "#0f172a", "circle-stroke-width": 1.5 },
    });
  } else {
    map.getSource(SRC).setData(data);
  }
}

function removeLayers(map) {
  [`${SRC}-line`, `${SRC}-point`].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource(SRC)) map.removeSource(SRC);
}

// Simple on/off switch for the Zayo fiber route layer. Queries the imported
// Zayo network for the current viewport and refreshes as the user pans.
export default function ZayoFiberToggle({ mapRef }) {
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const onRef = useRef(false);

  const load = async () => {
    const map = mapRef.current;
    if (!map || !onRef.current) return;
    setLoading(true);
    try {
      const b = map.getBounds();
      const res = await zayoFiberRoutes({
        action: "query_layer",
        layer: "zayo_routes",
        bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      });
      const data = res?.data;
      if (onRef.current && mapRef.current && data?.type === "FeatureCollection") {
        addLayers(mapRef.current, data.features?.length ? data : EMPTY);
      }
    } catch {
      // leave the layer as-is on transient failures
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !on;
    onRef.current = next;
    setOn(next);
    if (next) load();
    else removeLayers(map);
  };

  // Refresh on pan/zoom + re-add after basemap switches (setStyle wipes layers).
  useEffect(() => {
    const map = mapRef.current;
    if (!on || !map) return;
    const refresh = () => load();
    map.on("moveend", refresh);
    map.on("style.load", refresh);
    return () => { map.off("moveend", refresh); map.off("style.load", refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold shadow-lg transition-all ${
        on ? "bg-amber-500 border-amber-400 text-slate-900" : "bg-slate-900/85 border-white/15 text-white/80 hover:text-white"
      }`}
      title="Toggle Zayo fiber route layer"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
        <span className={`inline-block w-7 h-4 rounded-full relative transition-colors ${on ? "bg-slate-900/40" : "bg-white/20"}`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
        </span>
      )}
      Zayo Fiber
    </button>
  );
}