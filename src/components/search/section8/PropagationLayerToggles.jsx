// Section 8 — floating layer control panel for the propagation map.
// Per-carrier visibility toggles, overlay opacity, 3D terrain and base style.
import { Satellite, Mountain, Eye, EyeOff } from "lucide-react";

export const CARRIER_COLORS = ["#4ADE80", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#f87171"];

export default function PropagationLayerToggles({
  coverages, visible, onToggle, activeCarrier, onSelect,
  opacity, onOpacity, terrain3D, onTerrain, base, onBase,
}) {
  return (
    <div className="rounded-lg bg-[#0C1B2E]/90 backdrop-blur border border-[#628C83]/40 p-2.5 text-white w-56 space-y-2.5">
      <div className="text-[10px] font-mono tracking-[0.2em] text-[#628C83]">RF LAYERS</div>

      {/* Carrier layer toggles */}
      <div className="space-y-1">
        {coverages.map((c, i) => {
          const disabled = !c.png_url;
          const on = !!visible[c.carrier_name];
          const isActive = c.carrier_name === activeCarrier;
          return (
            <div
              key={c.carrier_name}
              className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${disabled ? "opacity-40" : ""} ${isActive ? "bg-white/10" : ""}`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CARRIER_COLORS[i % CARRIER_COLORS.length] }} />
              <button
                onClick={() => !disabled && onSelect(c.carrier_name)}
                disabled={disabled}
                className="flex-1 text-left text-[11px] font-semibold truncate hover:text-white/80"
                title={`${c.carrier_name} · ${c.band} · ${c.frequency_mhz} MHz`}
              >
                {c.carrier_name} <span className="text-white/40 font-normal">{c.band}</span>
              </button>
              <button
                onClick={() => !disabled && onToggle(c.carrier_name)}
                disabled={disabled}
                className="shrink-0 p-0.5 rounded hover:bg-white/10"
                title={on ? "Hide layer" : "Show layer"}
              >
                {on ? <Eye className="w-3.5 h-3.5 text-[#4ADE80]" /> : <EyeOff className="w-3.5 h-3.5 text-white/40" />}
              </button>
            </div>
          );
        })}
      </div>

      {/* Opacity */}
      <div>
        <div className="flex justify-between text-[10px] font-mono tracking-wider text-[#628C83] mb-1">
          <span>OPACITY</span><span>{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range" min="10" max="100" value={Math.round(opacity * 100)}
          onChange={(e) => onOpacity(Number(e.target.value) / 100)}
          className="w-full accent-[#4ADE80] h-1.5"
        />
      </div>

      {/* 3D terrain + base style */}
      <div className="flex gap-1.5">
        <button
          onClick={() => onTerrain(!terrain3D)}
          className="flex-1 px-2 py-1 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 border"
          style={terrain3D
            ? { background: "#4ADE80", color: "#064E3B", borderColor: "#4ADE80" }
            : { color: "#cbd5e1", borderColor: "#334155" }}
        >
          <Mountain className="w-3 h-3" /> 3D
        </button>
        {["satellite", "streets"].map((b) => (
          <button
            key={b} onClick={() => onBase(b)}
            className="flex-1 px-2 py-1 rounded-md text-[11px] font-semibold capitalize flex items-center justify-center gap-1 border"
            style={base === b
              ? { background: "#4ADE80", color: "#064E3B", borderColor: "#4ADE80" }
              : { color: "#cbd5e1", borderColor: "#334155" }}
          >
            {b === "satellite" ? <Satellite className="w-3 h-3" /> : null}
            {b === "satellite" ? "Sat" : "Streets"}
          </button>
        ))}
      </div>
    </div>
  );
}