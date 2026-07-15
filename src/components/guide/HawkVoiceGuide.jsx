import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Volume2, Square, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { hawkTourAudio } from "@/functions/hawkTourAudio";
import { TOUR_STOPS, GUIDE_VOICE_ID, stopKey, firstStopIndex } from "./hawkTourScript";

export default function HawkVoiceGuide() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(() => firstStopIndex(location.pathname));
  const audioRef = useRef(null);

  const stop = TOUR_STOPS[index] || null;

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(false);
  };

  // Route change: silence the narrator and jump to that page's first stop
  useEffect(() => {
    setIndex(firstStopIndex(location.pathname));
    return () => stopAudio();
  }, [location.pathname]);

  if (!stop || stop.path !== location.pathname) return null;

  const handlePlay = async () => {
    if (playing) return stopAudio();
    setLoading(true);
    setError("");
    try {
      const res = await hawkTourAudio({
        page_key: stopKey(stop),
        text: stop.narration,
        voice_id: GUIDE_VOICE_ID,
      });
      if (res.data?.error) throw new Error(res.data.error);
      const audio = new Audio(res.data.audio_url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      await audio.play();
      setPlaying(true);
    } catch (e) {
      setError(e.message || "Could not play narration");
    } finally {
      setLoading(false);
    }
  };

  const go = (dir) => {
    stopAudio();
    const next = TOUR_STOPS[index + dir];
    if (!next) return;
    if (next.path !== location.pathname) navigate(next.path);
    else setIndex(index + dir);
  };

  return (
    <div className="fixed left-4 bottom-24 lg:left-72 lg:bottom-6 z-40">
      {open ? (
        <div className="w-80 max-w-[calc(100vw-32px)] rounded-2xl border border-primary/30 bg-card shadow-2xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
                Hawk Guide · Stop {index + 1} of {TOUR_STOPS.length}
              </div>
              <h3 className="font-heading font-bold text-sm text-foreground mt-0.5">{stop.title}</h3>
            </div>
            <button onClick={() => { stopAudio(); setOpen(false); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground max-h-40 overflow-y-auto">{stop.narration}</p>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => go(-1)}
              disabled={index <= 0}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button
              onClick={handlePlay}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-heading font-bold hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {loading ? "Loading…" : playing ? "Stop" : "Play"}
            </button>
            <button
              onClick={() => go(1)}
              disabled={index >= TOUR_STOPS.length - 1}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-primary/30 bg-card shadow-xl px-4 py-2.5 text-xs font-heading font-bold text-primary hover:bg-primary/10 transition-colors"
          title="Hawk Guide — hear how this page works"
        >
          <Volume2 className="w-4 h-4" />
          Hawk Guide
        </button>
      )}
    </div>
  );
}