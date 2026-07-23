import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Mic, Square, X, Loader2, Send, MicOff, Volume2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { elevenLabsSpeech } from "@/functions/elevenLabsSpeech";
import { GUIDE_VOICE_ID } from "./hawkTourScript";

// "Brian" — the SiteHawk voice guide, now interactive. Users speak a question
// (browser Web Speech API), the LLM answers as Brian, and the answer is spoken
// aloud with Brian's ElevenLabs voice. Falls back to a typed question when the
// browser has no speech recognition (Firefox / older Safari).

const BRIAN_CTX = `You are "Brian", the SiteHawk voice guide — a calm, confident American telecom site-acquisition expert speaking out loud to the user. SiteHawk produces a Site Candidate Information Package (SCIP) for cell-tower siting: a search ring with a SARF map, ranked Target A/B/C parcels, zoning & permitting, FEMA flood, USFWS wetlands, HIFLD power utility, FCC fiber, CloudRF RF propagation, a Document Studio report, plus Hawk Law, Hawk Lease, skip-trace, and the Hawk Tracker. Keep spoken answers SHORT (2–4 sentences), warm, conversational, and jargon-light — you are talking, not writing. If a question is outside SiteHawk or telecom site acquisition, say so briefly and steer back.`;

const PAGE_HINTS = [
  ["/dashboard", "Dashboard"], ["/search", "Site Search"], ["/scip", "SCIP detail"],
  ["/hawk-tracker", "Hawk Tracker"], ["/skip-trace", "Skip-Trace"], ["/hawk-law", "Hawk Law"],
  ["/hawk-lease", "Hawk Lease"], ["/pricing", "Pricing & Plans"], ["/billing", "Billing"],
  ["/crm", "Time Savers"], ["/rfi-engine", "RF Intelligence Engine"],
];

function pageFor(pathname) {
  return PAGE_HINTS.find(([p]) => pathname.startsWith(p))?.[1] || "SiteHawk";
}

export default function HawkVoiceAssistant() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [turns, setTurns] = useState([]);
  const [textInput, setTextInput] = useState("");
  const recRef = useRef(null);
  const audioRef = useRef(null);
  const supported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopAudio = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } setSpeaking(false); };

  useEffect(() => () => { stopAudio(); try { recRef.current?.abort(); } catch {} }, []);

  const speak = async (text) => {
    if (muted || !text?.trim()) return;
    stopAudio();
    setThinking(true);
    setError("");
    try {
      const res = await elevenLabsSpeech({ text, voice_id: GUIDE_VOICE_ID });
      const b64 = res?.data?.audio_base64;
      if (!b64) throw new Error("no audio returned");
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
      audioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      await audio.play();
      setSpeaking(true);
    } catch (e) {
      setError(e.message || "Brian couldn't speak just now");
    } finally {
      setThinking(false);
    }
  };

  const ask = async (question) => {
    const q = (question || "").trim();
    if (!q) return;
    setError("");
    setThinking(true);
    let answer = "";
    try {
      const prompt = `${BRIAN_CTX}\n\nThe user is currently on the "${pageFor(location.pathname)}" page. Answer their spoken question briefly and conversationally.\n\nQuestion: ${q}`;
      const out = await base44.integrations.Core.InvokeLLM({ prompt });
      answer = typeof out === "string" ? out : out?.response || out?.text || out?.output || "";
      if (!answer.trim()) answer = "I'm not sure on that one — try rephrasing.";
    } catch (e) {
      setThinking(false);
      setError(e.message || "Brian couldn't think just now");
      return;
    }
    setThinking(false);
    setTurns((t) => [...t, { q, a: answer }]);
    speak(answer);
  };

  const startListening = () => {
    if (!supported) return;
    setError(""); setInterim("");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false;
    rec.onresult = (e) => {
      let final = "", tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript; else tmp += r[0].transcript;
      }
      if (tmp) setInterim(tmp);
      if (final.trim()) {
        setInterim("");
        recRef.current = null;
        try { rec.stop(); } catch {}
        setListening(false);
        ask(final.trim());
      }
    };
    rec.onerror = (e) => setError(e.error === "not-allowed" ? "Mic blocked — allow microphone access" : "Couldn't hear you");
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };
  const stopListening = () => { try { recRef.current?.stop(); } catch {} setListening(false); setInterim(""); };

  return (
    <div className="fixed right-4 bottom-24 lg:right-6 lg:bottom-6 z-40">
      {open ? (
        <div className="w-80 max-w-[calc(100vw-32px)] rounded-2xl border border-primary/30 bg-card shadow-2xl flex flex-col max-h-[70vh]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary">
                <Volume2 className="w-4 h-4" />
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Ask Brian</div>
                <p className="text-[10px] text-muted-foreground -mt-0.5">Talk — he answers out loud</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMuted((m) => !m)} title={muted ? "Voice off" : "Voice on"} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground">
                {muted ? <MicOff className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button onClick={() => { stopAudio(); stopListening(); setOpen(false); }} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[120px]">
            {turns.length === 0 && !interim && !thinking && (
              <p className="text-xs text-muted-foreground text-center py-6">
                Tap the mic and ask Brian anything about SiteHawk — zoning, parcels, the SCIP, the report…
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-xs">{t.q}</div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-secondary text-foreground px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap">{t.a}</div>
                </div>
              </div>
            ))}
            {interim && <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/70 text-primary-foreground px-3 py-2 text-xs italic">{interim}…</div></div>}
            {(thinking || speaking) && (
              <div className="flex justify-start items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary"><Volume2 className="w-3.5 h-3.5" /></span>
                <div className="bg-secondary rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                  {[0, 1, 2].map((i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
            {error && <p className="text-xs text-destructive text-center">{error}</p>}
          </div>

          <div className="px-4 py-3 border-t border-border flex items-center gap-2">
            {supported ? (
              <button
                onClick={listening ? stopListening : startListening}
                disabled={thinking}
                className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all disabled:opacity-50 ${listening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                title={listening ? "Stop" : "Talk to Brian"}
              >
                {listening ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground shrink-0 w-11 text-center leading-tight">no<br/>mic</span>
            )}
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && textInput.trim()) { const v = textInput; setTextInput(""); ask(v); } }}
              placeholder={supported ? "…or type your question" : "Type your question for Brian"}
              className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button onClick={() => { if (textInput.trim()) { const v = textInput; setTextInput(""); ask(v); } }} disabled={!textInput.trim() || thinking} className="shrink-0 p-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-primary/30 bg-card shadow-xl px-4 py-2.5 text-xs font-heading font-bold text-primary hover:bg-primary/10 transition-colors"
          title="Ask Brian — speak, he answers"
        >
          <Mic className="w-4 h-4" />
          Ask Brian
        </button>
      )}
    </div>
  );
}