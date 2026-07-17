/**
 * RegridLayerToggle — floating layer visibility panel for the Regrid Zoning/FLUM maps.
 *
 * Renders inside the MapSubStep canvas area and controls visibility of:
 *   - Regrid Zoning color fill + outline
 *   - FLUM / Land Use color fill + outline
 *   - Parcel boundaries (outlines only)
 *   - Target A highlight
 *
 * Talks to the Mapbox map instance via `mapRef.current` (the live map object
 * stored by the parent). Layer IDs match those added by renderRegridZoningMap.
 */

import { useState } from "react";
import { Layers, Eye, EyeOff } from "lucide-react";

const LAYER_GROUPS = [
  {
    key: "fill",
    label: "Zone Fill",
    icon: "🎨",
    layerIds: ["s4-rg-zone-fill"],
    description: "Color-coded zone polygons",
    color: "#628C83",
  },
  {
    key: "outline",
    label: "Parcel Outlines",
    icon: "🔲",
    layerIds: ["s4-rg-zone-line"],
    description: "Parcel boundary lines",
    color: "#94a3b8",
  },
  {
    key: "target",
    label: "Target A",
    icon: "📍",
    layerIds: ["s4-rg-target-line"],
    description: "Target A parcel boundary",
    color: "#22d3ee",
  },
];

export default function RegridLayerToggle({ mapRef, fieldKey = "zoning", zoneInfo }) {
  const [open, setOpen] = useState(true);
  const [visibility, setVisibility] = useState({ fill: true, outline: true, target: true });

  const toggle = (key) => {
    const group = LAYER_GROUPS.find((g) => g.key === key);
    if (!group) return;
    const map = mapRef?.current;
    if (!map) return;
    const newVis = !visibility[key];
    group.layerIds.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", newVis ? "visible" : "none");
      }
    });
    setVisibility((prev) => ({ ...prev, [key]: newVis }));
  };

  return (
    <div className="rounded-xl shadow-lg border border-border/60 bg-card/95 backdrop-blur-sm overflow-hidden" style={{ minWidth: 200 }}>
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 text-white text-xs font-semibold"
      >
        <span className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          {fieldKey === "zoning" ? "Zoning Layers" : "FLUM Layers"}
        </span>
        <span className="opacity-60 text-[10px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="p-2 space-y-1">
          {/* Zone code badge */}
          {zoneInfo && (
            <div className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 mb-2">
              <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 font-semibold">
                {fieldKey === "zoning" ? "Zone:" : "Land Use:"}
              </div>
              <div className="text-[11px] font-bold text-emerald-900 dark:text-emerald-100 truncate">
                {zoneInfo.zone_code || zoneInfo.code || "—"}
              </div>
              {(zoneInfo.zone_name || zoneInfo.name) && (
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 truncate">
                  {zoneInfo.zone_name || zoneInfo.name}
                </div>
              )}
            </div>
          )}

          {LAYER_GROUPS.map((group) => {
            const on = visibility[group.key];
            return (
              <button
                key={group.key}
                onClick={() => toggle(group.key)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                  on
                    ? "bg-slate-100 dark:bg-slate-800 text-foreground"
                    : "bg-transparent text-muted-foreground line-through"
                } hover:bg-slate-200 dark:hover:bg-slate-700`}
              >
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ background: on ? group.color : "#94a3b8" }}
                />
                <span className="text-xs font-medium flex-1">{group.icon} {group.label}</span>
                {on
                  ? <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                }
              </button>
            );
          })}

          <div className="pt-1 border-t border-border/50 text-[9px] text-muted-foreground px-1">
            Source: Realie
          </div>
        </div>
      )}
    </div>
  );
}