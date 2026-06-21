/**
 * CameraControlBar — camera preset buttons for the Photo3D viewer
 */
import { Navigation, RotateCcw, Video, Camera, Play, Pause } from "lucide-react";

const PRESETS = [
  { id: "overhead", label: "Top", icon: "↑" },
  { id: "north", label: "N", icon: "N" },
  { id: "south", label: "S", icon: "S" },
  { id: "east", label: "E", icon: "E" },
  { id: "west", label: "W", icon: "W" },
  { id: "hero", label: "Hero", icon: "★" },
];

export default function CameraControlBar({ onPreset, autoOrbit, onToggleOrbit, onScreenshot }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRESETS.map(p => (
        <button
          key={p.id}
          onClick={() => onPreset(p.id)}
          className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors border border-white/15 flex items-center justify-center"
          title={p.label}
        >
          {p.icon}
        </button>
      ))}

      <div className="w-px h-6 bg-white/20 mx-1" />

      <button
        onClick={onToggleOrbit}
        className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5
          ${autoOrbit ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/10 border-white/15 text-white/70 hover:bg-white/20"}`}
        title="Auto-orbit"
      >
        {autoOrbit ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        Orbit
      </button>

      <button
        onClick={onScreenshot}
        className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-xs font-medium border border-white/15 transition-colors flex items-center gap-1.5"
        title="Save screenshot"
      >
        <Camera className="w-3 h-3" /> PNG
      </button>
    </div>
  );
}