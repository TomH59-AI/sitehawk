import { ChevronLeft, ChevronRight, Play, Pause, Loader2, Maximize, Repeat, X } from "lucide-react";
import { Link } from "react-router-dom";

// Bottom control bar for the pitch deck — navigation, Brian playback, autoplay.
export default function DeckControls({
  index, total, onPrev, onNext, onGoTo,
  playing, loading, onTogglePlay,
  autoAdvance, onToggleAuto,
}) {
  const goFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  return (
    <div className="shrink-0 px-6 md:px-12 py-4 flex items-center gap-4 border-t border-white/10 bg-black/30 backdrop-blur">
      <button
        onClick={onTogglePlay}
        disabled={loading}
        className="w-12 h-12 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center transition-colors disabled:opacity-60"
        title={playing ? "Pause Brian" : "Play Brian"}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
      </button>

      <div className="flex items-center gap-1">
        <button onClick={onPrev} disabled={index === 0} className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30" title="Previous slide">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-slate-400 text-sm font-mono w-16 text-center">{index + 1} / {total}</span>
        <button onClick={onNext} disabled={index === total - 1} className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30" title="Next slide">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex items-center gap-1.5 justify-center">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            onClick={() => onGoTo(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-cyan-400" : "w-1.5 bg-white/25 hover:bg-white/50"}`}
            title={`Slide ${i + 1}`}
          />
        ))}
      </div>

      <button
        onClick={onToggleAuto}
        className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${autoAdvance ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:bg-white/10"}`}
        title="Auto-advance to the next slide when Brian finishes"
      >
        <Repeat className="w-3.5 h-3.5" /> Auto
      </button>
      <button onClick={goFullscreen} className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10" title="Fullscreen">
        <Maximize className="w-4 h-4" />
      </button>
      <Link to="/dashboard" className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10" title="Exit presentation">
        <X className="w-4 h-4" />
      </Link>
    </div>
  );
}