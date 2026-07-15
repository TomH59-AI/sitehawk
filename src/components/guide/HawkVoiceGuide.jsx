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

  // Scroll the page to the section this stop is narrating
  useEffect(() => {
    const target = TOUR_STOPS[index]?.scrollTo;
    if (!target || !open) return;
    const t = setTimeout(() => {
      document.querySelector(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 900);
    return () => clearTimeout(t);
  }, [index, open]);

  // Click the section's action button for the user (e.g. Run Zoning).
  // Polls until the button exists and is enabled — map suite steps unlock
  // one by one, so the target button may still be locked when we arrive.
  useEffect(() => {
    const selector = TOUR_STOPS[index]?.autoClick;
    if (!selector || !open) return;
    let cancelled = false;
    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      const btn = document.querySelector(selector);
      if (btn && !btn.disabled) { btn.click(); return; }
      if (++tries < 90) setTimeout(attempt, 1000);
    };
    const t = setTimeout(attempt, 1800);
    return () => { cancelled = true; clearTimeout(t); };
  }, [index, open]);

  // Run a full click SEQUENCE (the map suite): click each button in order,
  // scrolling to it first. Each map's completion unlocks the next button, so
  // polling for an enabled button naturally paces the run map-by-map.
  useEffect(() => {
    const seq = TOUR_STOPS[index]?.autoClickSequence;
    if (!seq || !open) return;
    let cancelled = false;
    let i = 0;
    const clickWhenReady = (selector) => {
      let tries = 0;
      const attempt = () => {
        if (cancelled) return;
        const btn = document.querySelector(selector);
        if (btn && !btn.disabled) {
          btn.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => {
            if (cancelled) return;
            btn.click();
            // brief pause, then start waiting for the next map's button
            setTimeout(next, 2000);
          }, 800);
          return;
        }
        // Maps can take a while — keep polling generously (up to ~10 min each).
        if (++tries < 600) setTimeout(attempt, 1000);
      };
      attempt();
    };
    const next = () => {
      if (cancelled || i >= seq.length) return;
      clickWhenReady(seq[i++]);
    };
    const t = setTimeout(next, 1800);
    return () => { cancelled = true; clearTimeout(t); };
  }, [index, open]);

  // Timed scroll WALKTHROUGH (map suite recap): once narration starts playing,
  // scroll from map to map on the script's schedule while the narrator explains
  // each one. Stops immediately if the user hits Stop or leaves the stop.
  useEffect(() => {
    const seq = TOUR_STOPS[index]?.autoScrollSequence;
    if (!seq || !open || !playing) return;
    let cancelled = false;
    let i = 0;
    const step = () => {
      if (cancelled || i >= seq.length) return;
      const { selector, dwellMs = 12000 } = seq[i++];
      document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(step, dwellMs);
    };
    step();
    return () => { cancelled = true; };
  }, [index, open, playing]);

  if (!stop || stop.path !== location.pathname) return null;

  const handlePlay = async () => {
    if (playing) return stopAudio();
    setLoading(true);
    setError("");
    try {
      // Bring the section into view first — don't start talking until it's visible.
      if (stop.scrollTo) {
        document.querySelector(stop.scrollTo)?.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise((r) => setTimeout(r, 1000));
      }
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
    // Moving forward off a stop with demo data: fill the form + run the scan for the user
    if (dir > 0 && stop.autoFill) {
      window.dispatchEvent(new CustomEvent("hawk-tour-fill", { detail: stop.autoFill }));
    }
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