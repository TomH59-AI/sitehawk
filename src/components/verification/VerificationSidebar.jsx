import { Layers, MapPin } from "lucide-react";
import { THEME, OVERLAY_LABELS, BASEMAPS } from "./verificationConfig";

// Layer control / candidate data sidebar for SiteHawkVerificationMap.
// Dark Midnight Hawk styling — checkboxes for overlays, basemap radios,
// raster opacity slider, and click-to-fly candidate cards.
export default function VerificationSidebar({
  layers, setLayers, opacity, setOpacity, basemap, setBasemap,
  candidateSites = [], onFlyTo, busy = {},
}) {
  const toggle = (id) => setLayers((p) => ({ ...p, [id]: !p[id] }));
  const anyRaster = layers.wetlands || layers.hydro || layers.nlcd;

  return (
    <div
      className="w-full md:w-[35%] p-4 space-y-5 overflow-y-auto md:max-h-[560px] text-sm"
      style={{ background: THEME.panel, borderLeft: `1px solid ${THEME.border}` }}
    >
      {/* Basemap */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] mb-2" style={{ color: THEME.accent }}>
          Basemap
        </div>
        <div className="space-y-1.5">
          {BASEMAPS.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-slate-200 cursor-pointer">
              <input
                type="radio" name="verif-basemap" checked={basemap === b.id}
                onChange={() => setBasemap(b.id)} className="accent-cyan-400"
              />
              {b.label}
            </label>
          ))}
        </div>
      </div>

      {/* Overlays */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] mb-2 flex items-center gap-1.5" style={{ color: THEME.accent }}>
          <Layers className="w-3 h-3" /> Overlays
        </div>
        <div className="space-y-1.5">
          {Object.keys(OVERLAY_LABELS).map((id) => (
            <label key={id} className="flex items-center gap-2 text-slate-200 cursor-pointer">
              <input type="checkbox" checked={!!layers[id]} onChange={() => toggle(id)} className="accent-cyan-400" />
              {OVERLAY_LABELS[id]}
              {busy[id] && <span className="text-[10px] animate-pulse" style={{ color: THEME.accent }}>loading…</span>}
            </label>
          ))}
        </div>
        {anyRaster && (
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Overlay opacity</span><span>{opacity}%</span>
            </div>
            <input
              type="range" min={0} max={100} value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>
        )}
      </div>

      {/* Candidate sites — click the map instead of sidebar cards */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] mb-2 flex items-center gap-1.5" style={{ color: THEME.accent }}>
          <MapPin className="w-3 h-3" /> Candidate Sites
        </div>
        <div
          className="rounded-lg p-3 text-slate-300 text-xs"
          style={{ background: THEME.bg, border: `1px solid ${THEME.border}` }}
        >
          Click The Map To Check Other Potential Siting
        </div>
      </div>
    </div>
  );
}