import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { DECK_SLIDES, DECK_VOICE_ID } from "@/components/presentation/presentationScript";
import DeckSlide from "@/components/presentation/DeckSlide";
import DeckControls from "@/components/presentation/DeckControls";

// SiteHawk Pitch Deck — full-screen presentation narrated by Brian.
// Audio is generated once per slide via the shared ElevenLabs cache
// (hawkTourAudio), so replays cost zero credits for every user.
export default function Presentation() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [error, setError] = useState("");
  const audioRef = useRef(null);
  const urlCache = useRef({});
  const autoRef = useRef(true);
  const indexRef = useRef(0);
  autoRef.current = autoAdvance;
  indexRef.current = index;

  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(false);
  };

  const fetchUrl = async (slide) => {
    if (urlCache.current[slide.key]) return urlCache.current[slide.key];
    const res = await base44.functions.invoke("hawkTourAudio", {
      page_key: slide.key,
      text: slide.narration,
      voice_id: DECK_VOICE_ID,
    });
    const url = res?.data?.audio_url || res?.audio_url;
    if (!url) throw new Error("No audio returned");
    urlCache.current[slide.key] = url;
    return url;
  };

  const playSlide = useCallback(async (i) => {
    const slide = DECK_SLIDES[i];
    if (!slide) return;
    stopAudio();
    setError("");
    setLoading(true);
    try {
      const url = await fetchUrl(slide);
      // User may have moved on while audio was generating
      if (indexRef.current !== i) return;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlaying(false);
        if (autoRef.current && i < DECK_SLIDES.length - 1) {
          setIndex(i + 1);
          playSlide(i + 1);
        }
      };
      await audio.play();
      setPlaying(true);
    } catch (e) {
      setError(e.message || "Brian couldn't speak just now");
    } finally {
      setLoading(false);
    }
  }, []);

  const goTo = (i, andPlay = playing) => {
    if (i < 0 || i >= DECK_SLIDES.length) return;
    stopAudio();
    setIndex(i);
    if (andPlay) playSlide(i);
  };

  const togglePlay = () => {
    if (playing) stopAudio();
    else playSlide(index);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") goTo(indexRef.current + 1);
      if (e.key === "ArrowLeft") goTo(indexRef.current - 1);
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index]);

  useEffect(() => () => stopAudio(), []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-slate-950 via-[#0b1a2e] to-slate-900 overflow-hidden">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-3xl" />

      <div className="flex-1 flex overflow-hidden relative">
        <AnimatePresence mode="wait">
          <DeckSlide key={DECK_SLIDES[index].key} slide={DECK_SLIDES[index]} index={index} />
        </AnimatePresence>
      </div>

      {error && (
        <p className="text-center text-sm text-red-400 pb-2">{error}</p>
      )}

      <DeckControls
        index={index}
        total={DECK_SLIDES.length}
        onPrev={() => goTo(index - 1)}
        onNext={() => goTo(index + 1)}
        onGoTo={(i) => goTo(i)}
        playing={playing}
        loading={loading}
        onTogglePlay={togglePlay}
        autoAdvance={autoAdvance}
        onToggleAuto={() => setAutoAdvance((a) => !a)}
      />
    </div>
  );
}