import { MapPin, Circle, Radio, SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import RfiFilters from "./RfiFilters";

function ToggleRow({ icon: Icon, color, label, hint, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{label}</p>
          {hint && <p className="text-[11px] leading-tight text-white/50 truncate">{hint}</p>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// Side control panel next to the RF map — the user's own overlays (site pins,
// search rings) plus the RF layer / carrier / band / technology filters.
export default function RfiControlPanel({
  overlays, setOverlays,
  filters, setFilters,
  layers, setLayers,
  onDrawCoverage, drawing,
  satelliteMode, setSatelliteMode,
  environmentalData,
}) {
  const set = (key) => (val) => setOverlays((prev) => ({ ...prev, [key]: val }));

  return (
    <aside className="w-full lg:w-72 shrink-0 rounded-2xl border border-white/10 bg-slate-900 text-white shadow-sm overflow-hidden flex flex-col">
      <div className="h-1.5 w-full bg-gradient-to-r from-primary to-emerald-500" />
      <div className="p-4 overflow-y-auto min-h-0">
        <div
          data-drag-handle
          className="flex cursor-grab items-center gap-2 mb-1 active:cursor-grabbing"
          title="Drag this panel when the map is expanded"
        >
          <Radio className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base">Siting IQ™ — Patent Pending</h2>
        </div>
        <p className="text-xs leading-relaxed text-white/50 mb-4">
          The industry’s first unified environmental, RF, and airspace siting engine.
        </p>

        <div className="space-y-2">
          <ToggleRow
            icon={MapPin}
            color="#22c55e"
            label="Site Pins"
            hint="Your saved site candidates"
            checked={overlays.sites}
            onChange={set("sites")}
          />
          <ToggleRow
            icon={Circle}
            color="#8B5CF6"
            label="Search Rings"
            hint="1-mile rings around your searches"
            checked={overlays.rings}
            onChange={set("rings")}
          />
        </div>

        <div className="mt-5 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-base">Siting IQ™ Layers</h2>
          </div>
          <RfiFilters
            filters={filters} setFilters={setFilters}
            layers={layers} setLayers={setLayers}
            onDrawCoverage={onDrawCoverage} drawing={drawing}
            satelliteMode={satelliteMode} setSatelliteMode={setSatelliteMode}
            environmentalData={environmentalData}
          />
        </div>
      </div>
    </aside>
  );
}