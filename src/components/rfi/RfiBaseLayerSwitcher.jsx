import { BASE_LAYERS } from "./rfiConfig";

// Base-map switcher for the RFI Engine — flips the base between Mapbox Dark and
// the free USGS National Map raster services. RF layers always stay on top.
export default function RfiBaseLayerSwitcher({ baseLayer, onChange }) {
  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-xl border border-white/10 bg-slate-900/85 backdrop-blur text-white p-2 shadow-2xl">
      <div className="font-heading font-bold text-[10px] tracking-wide uppercase text-white/60 px-1 mb-1.5">
        Base Map
      </div>
      <div className="flex flex-col gap-1">
        {BASE_LAYERS.map((b) => (
          <button
            key={b.id}
            onClick={() => onChange(b.id)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-left transition-colors"
            style={
              baseLayer === b.id
                ? { background: "#8B5CF6", color: "#fff" }
                : { background: "transparent", color: "rgba(255,255,255,0.7)" }
            }
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}