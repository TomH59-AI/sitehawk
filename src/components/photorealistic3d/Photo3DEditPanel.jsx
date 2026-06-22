/**
 * Photo3DEditPanel — side panel for tower/compound/landscape params
 */
import { Sliders, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOWER_TYPES = [
  { value: "self_support", label: "Self-Support" },
  { value: "monopole", label: "Monopole" },
  { value: "guyed", label: "Guyed" },
];

function Row({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-white/70">{label}</label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, min, max, step = 1 }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full h-8 rounded-md bg-white/10 border border-white/15 text-white text-sm px-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
    />
  );
}

export default function Photo3DEditPanel({ params, onChange, onReset, treeMaturity, setTreeMaturity, landscapeBuffer, hasSitingOverlays }) {
  const set = (key) => (val) => onChange({ ...params, [key]: val });

  return (
    <div className="space-y-4 text-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span className="font-heading font-semibold text-sm">Scene Parameters</span>
        </div>
        <button onClick={onReset} className="text-white/40 hover:text-white/70 transition-colors">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tower */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Tower</p>
        <Row label="Type">
          <select
            value={params.towerType}
            onChange={e => set("towerType")(e.target.value)}
            className="w-full h-8 rounded-md bg-white/10 border border-white/15 text-white text-sm px-2 focus:outline-none"
          >
            {TOWER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Row>
        <Row label={`Height: ${params.heightFt} ft AGL`}>
          <input
            type="range"
            min={50}
            max={300}
            step={5}
            value={params.heightFt}
            onChange={e => set("heightFt")(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
        </Row>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="microwave"
            checked={params.showMicrowave}
            onChange={e => set("showMicrowave")(e.target.checked)}
            className="accent-indigo-500"
          />
          <label htmlFor="microwave" className="text-xs text-white/70">Microwave dishes</label>
        </div>
      </div>

      {/* Compound */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Compound</p>
        <div className="grid grid-cols-2 gap-2">
          <Row label="Width (ft)">
            <NumInput value={params.compoundW} onChange={set("compoundW")} min={30} max={200} />
          </Row>
          <Row label="Depth (ft)">
            <NumInput value={params.compoundD} onChange={set("compoundD")} min={30} max={200} />
          </Row>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="generator"
            checked={params.showGenerator}
            onChange={e => set("showGenerator")(e.target.checked)}
            className="accent-indigo-500"
          />
          <label htmlFor="generator" className="text-xs text-white/70">Generator pad</label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="icebridge"
            checked={params.showIceBridge}
            onChange={e => set("showIceBridge")(e.target.checked)}
            className="accent-indigo-500"
          />
          <label htmlFor="icebridge" className="text-xs text-white/70">Ice bridge</label>
        </div>
      </div>

      {/* Landscape buffer */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Landscape Buffer</p>
        {landscapeBuffer > 0 && (
          <p className="text-xs text-amber-300">
            Ordinance requires ~{landscapeBuffer} ft buffer
          </p>
        )}
        <Row label={`Buffer width: ${params.bufferFt} ft`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={params.bufferFt}
            onChange={e => set("bufferFt")(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
        </Row>
        <div className="flex rounded-lg border border-white/15 overflow-hidden text-xs">
          <button
            onClick={() => setTreeMaturity("initial")}
            className={`flex-1 py-1.5 transition-colors ${treeMaturity === "initial" ? "bg-emerald-600 text-white" : "text-white/60 hover:bg-white/10"}`}
          >
            Initial (8 ft)
          </button>
          <button
            onClick={() => setTreeMaturity("mature")}
            className={`flex-1 py-1.5 transition-colors ${treeMaturity === "mature" ? "bg-emerald-600 text-white" : "text-white/60 hover:bg-white/10"}`}
          >
            5-yr Maturity (25 ft)
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showBuffer"
            checked={params.showBuffer}
            onChange={e => set("showBuffer")(e.target.checked)}
            className="accent-emerald-500"
          />
          <label htmlFor="showBuffer" className="text-xs text-white/70">Show tree ring</label>
        </div>
      </div>

      {/* Siting overlays */}
      {hasSitingOverlays && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-cyan-400/80 uppercase tracking-wider">Siting Overlays</p>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showOverlays"
              checked={params.showOverlays !== false}
              onChange={e => set("showOverlays")(e.target.checked)}
              className="accent-cyan-400"
            />
            <label htmlFor="showOverlays" className="text-xs text-white/70">Show parcel / fall zone / compound</label>
          </div>
          <p className="text-[10px] text-cyan-400/50 leading-relaxed">Layers from TowerSitingRun: parcel boundary (cyan), buildable area (green dashed), compound (blue), fall zone (orange), conflicts (red).</p>
        </div>
      )}

      {/* RF radii */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">RF Radii</p>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="rfradii"
            checked={params.showRFRadii}
            onChange={e => set("showRFRadii")(e.target.checked)}
            className="accent-yellow-400"
          />
          <label htmlFor="rfradii" className="text-xs text-white/70">Show 0.25 / 0.5 / 1.0 mi rings</label>
        </div>
      </div>
    </div>
  );
}