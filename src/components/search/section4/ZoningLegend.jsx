/**
 * ZONING MAP DIAGNOSTIC + LEGEND — 2026-05-31
 * -------------------------------------------
 * Scope: ONLY the Section 4 Zoning Map sub-step (Aerial/Topo/FEMA/Wetlands/Parcel
 * and Sections 1–3,5–9 untouched).
 *
 * WHAT WAS FOUND (the gap):
 *  - The previous renderZoning was HALF-BUILT. It only painted a raster layer
 *    (pointing at the legacy tiles.zoneomics.com host) + a tower marker. There
 *    was NO legend, NO Target A parcel highlight, NO "Target A: <zone>" label,
 *    NO 401/403 handling, NO 404 fallback, and NO diagnostics. The color-coded
 *    legend menu the user asked for had never been implemented.
 *
 * WHAT WAS ADDED:
 *  1. [ZONING MAP DIAG] logs at: button click, zoneDetail call (URL+status+field
 *     count), raster tile URL build, raster layer add, and legend render (N districts).
 *  2. Correct paid-tier raster endpoint api.zoneomics.com/v2/zoneomics_tiles/
 *     {z}/{x}/{y}.png?api_key=… (lib/section4Maps.zoneomicsTileTemplate), probed
 *     with one tile (probeZoneomicsTile) to detect 401/403 (auth) vs 404 (no
 *     coverage) BEFORE adding the layer.
 *  3. Layer order on satellite base: satellite → zoning raster (0.55 opacity) →
 *     Target A parcel boundary highlight → Target A pill label (always on top).
 *  4. Fallback: if tiles 404, render label-only + an amber "No zoning tiles for
 *     this area" banner — the map ALWAYS shows something useful.
 *  5. This collapsible color-coded legend panel (Zoneomics-convention palette,
 *     sorted Residential→Commercial→Industrial→Agricultural→Mixed→Public→Special,
 *     6 shown + "+ N more"). Palette/sort live in lib/zoningPalette.js.
 *  6. Target A pill label "Target A: <Zone Code>" — brand green, white, shadow.
 *  7. 401/403 → "Zoneomics auth failed — verify ZONEOMICS_API_KEY" + Retry.
 *  8. 15s watchdog so the step never spins forever.
 *  9. Legend district list cached per Target A coordinate (re-clicks skip query).
 *
 * ZoningLegend — collapsible color-coded "Zoning Districts" legend panel for the
 * Section 4 Zoning Map sub-step ONLY. Renders swatches in the same Zoneomics-
 * convention palette as the baked raster tiles. Shows 6 districts by default;
 * "+ N more" expands the full sorted list.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";

const DEFAULT_VISIBLE = 6;

export default function ZoningLegend({ districts = [] }) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);

  if (!districts.length) return null;

  const visible = showAll ? districts : districts.slice(0, DEFAULT_VISIBLE);
  const moreCount = districts.length - DEFAULT_VISIBLE;

  return (
    <div className="w-full sm:w-64 sm:max-w-sm rounded-lg shadow-lg border border-black/10 bg-white/95 backdrop-blur overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 text-white"
      >
        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide">
          <Layers className="w-3.5 h-3.5" /> Zoning Districts
          <span className="text-white/50 font-normal">({districts.length})</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="px-3 py-2.5 space-y-2 max-h-64 sm:max-h-[60vh] overflow-y-auto">
          {visible.map((d) => (
            <div key={d.code} className="flex items-start gap-2 text-[11px] leading-tight">
              <span
                className="shrink-0 rounded-sm border border-black/20 mt-0.5"
                style={{ width: 18, height: 18, background: d.color }}
              />
              <span className="text-slate-700">
                <span className="font-bold text-slate-900">{d.code}</span>
                {d.name ? ` — ${d.name}` : ""}
                <span className="text-slate-400"> ({d.type})</span>
              </span>
            </div>
          ))}

          {!showAll && moreCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 pt-0.5"
            >
              + {moreCount} more district{moreCount > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}