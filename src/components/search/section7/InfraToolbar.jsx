/**
 * InfraToolbar — floating, always-visible toolbar for the Section 7 interactive
 * infrastructure map. Power/Fiber layer toggles, Streets/Satellite base
 * switcher, zoom in/out, and reset-to-Target-A. Brand-green accent.
 */

import { Zap, Cable, Plus, Minus, Crosshair, Router } from "lucide-react";

const BRAND_GREEN = "#628C83";

function Toggle({ on, color, icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
        on ? "text-white border-transparent" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
      }`}
      style={on ? { background: color } : undefined}
      title={`${label} ${on ? "on" : "off"}`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

export default function InfraToolbar({
  powerOn, fiberOn, carriersOn, base,
  onTogglePower, onToggleFiber, onToggleCarriers, onSwitchBase,
  onZoomIn, onZoomOut, onReset,
}) {
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
      {/* Layer toggles */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/95 backdrop-blur shadow-lg border border-slate-200">
        <Toggle on={powerOn} color="#E60000" icon={Zap} label="Power" onClick={onTogglePower} />
        <Toggle on={fiberOn} color="#FF8C00" icon={Cable} label="Fiber" onClick={onToggleFiber} />
        <Toggle on={carriersOn} color="#16A34A" icon={Router} label="Carriers" onClick={onToggleCarriers} />
      </div>

      {/* Base layer switcher (segmented control) */}
      <div className="inline-flex rounded-lg overflow-hidden shadow-lg border border-slate-200 bg-white/95 backdrop-blur w-fit">
        {["streets", "satellite"].map((b) => (
          <button
            key={b}
            onClick={() => onSwitchBase(b)}
            className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              base === b ? "text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
            style={base === b ? { background: BRAND_GREEN } : undefined}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Zoom + reset */}
      <div className="inline-flex flex-col rounded-lg overflow-hidden shadow-lg border border-slate-200 bg-white/95 backdrop-blur w-fit">
        <button onClick={onZoomIn} className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 border-b border-slate-200" title="Zoom in"><Plus className="w-4 h-4" /></button>
        <button onClick={onZoomOut} className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 border-b border-slate-200" title="Zoom out"><Minus className="w-4 h-4" /></button>
        <button onClick={onReset} className="px-2 py-1.5 hover:bg-slate-50" style={{ color: BRAND_GREEN }} title="Reset to Target A"><Crosshair className="w-4 h-4" /></button>
      </div>
    </div>
  );
}