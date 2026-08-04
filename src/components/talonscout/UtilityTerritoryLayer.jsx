import { useEffect, useState } from "react";
import { GeoJSON, Tooltip } from "react-leaflet";
import { base44 } from "@/api/base44Client";

// HIFLD utility-type → color (matches the Section 7 / UtilityRow palette)
const TYPE_COLORS = {
  "INVESTOR OWNED": "#3B82F6",
  MUNICIPAL: "#10B981",
  COOPERATIVE: "#F59E0B",
  "POLITICAL SUBDIVISION": "#A855F7",
  FEDERAL: "#EF4444",
  STATE: "#06B6D4",
};
const DEFAULT_COLOR = "#64748B";
const colorFor = (t) => TYPE_COLORS[t] || DEFAULT_COLOR;

const clean = (v) => (v && v !== "NOT AVAILABLE" ? v : null);

// Electric retail service territories (HIFLD) drawn on the scout ring map, so a
// lettered target's covering provider is visible. Nothing is inferred — only the
// polygons HIFLD returns for this ring center are drawn.
export default function UtilityTerritoryLayer({ center, onLoaded }) {
  const [fc, setFc] = useState(null);

  useEffect(() => {
    let alive = true;
    setFc(null);
    base44.functions
      .invoke("electricUtilityTerritory", { lat: center.lat, lon: center.lon })
      .then((res) => {
        const data = res?.data ?? res;
        if (!alive || data?.error) return;
        setFc(data);
        onLoaded?.(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [center.lat, center.lon]);

  if (!fc?.features?.length) return null;

  return fc.features.map((f, i) => {
    const p = f.properties || {};
    const color = colorFor(p.TYPE);
    return (
      <GeoJSON
        key={`${p.NAME || "util"}-${i}`}
        data={f}
        style={{ color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.18 }}
      >
        <Tooltip sticky>
          <div className="text-[11px] leading-tight">
            <div className="font-bold">{p.NAME || "Utility"}</div>
            <div className="opacity-75">{clean(p.TYPE) || "Type not published"}</div>
            {clean(p.TELEPHONE) && <div className="font-mono">{p.TELEPHONE}</div>}
            {clean(p.CNTRL_AREA) && <div className="opacity-75">ISO/Area: {p.CNTRL_AREA}</div>}
          </div>
        </Tooltip>
      </GeoJSON>
    );
  });
}