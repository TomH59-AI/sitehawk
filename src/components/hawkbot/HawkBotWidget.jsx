import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, Send, MessageCircle, FileText } from "lucide-react";
import HawkIcon from "../HawkIcon";
import { siteChat } from "@/functions/siteChat";

const QUICK_ACTIONS = [
  "How do I use SiteHawk?",
  "Build a SCIP for my top candidate",
  "Which candidate has the best fiber + zoning combo?",
  "What's the FAA risk for the top candidate?",
  "Run a 199-ft tower compliance check",
  "Explain the CloudRF propagation results",
  "What's in the new SCIP Page 1 format?",
];

const SCIP_CONTEXT = `You are HawkBot, the SiteHawk AI consultant. The platform produces a Site Candidate Information Package (SCIP) using this exact Page 1 format (in order):
1. SITE ACQUISITION — agent name, phone, email, submittal date
2. SEARCH RING INFORMATION — site name, lat/lon, search radius, SARF height, tower type, compound size
3. SARF MAP — Mapbox satellite with 0.5 + 1.0 mi rings
4. SITE INFORMATION + OWNER INFORMATION — auto-filled via findBestParcelForTower (Notion zoning + Realie parcels + Enformion skip-trace)
5. EXISTING CONDITIONS — FEMA flood, NWI wetlands, HIFLD power utility, FCC broadband, OSM public-safety
6. SITE NOTES — LLM-generated development concerns
7. ZONING / TOWER SPECIFICS / SITE PLAN / BUILDING PERMIT — pulled from Notion ordinance DB
8. MAPS — Target A aerial / topo / FEMA / zoning / FLUM / wetlands / parcel maps plus proximity and infrastructure maps
9. SCIP MAPS — Aerial / Topo / Flood / Zoning / FLU / Wetlands / Parcel / Wind / Airport
10. CANDIDATES SUMMARY — Targets A/B/C with skip-traced phones + SARF map with numbered waypoints
11. RF PROPAGATION ANALYSIS — CloudRF composite footprint + N/E/S/W directional sectors + auto-calculated coverage metrics

If the user asks to "build a SCIP" or "generate a SCIP", tell them to click the "Generate SCIP" button on the Scan Results page, or use the "Build SCIP →" shortcut at the top of this chat. Answer technical questions about each section using real industry knowledge (ITM/Longley-Rice, ASCE 7-22, FAA Part 77, FCC ASR, etc.).`;

const WELCOME = "👋 I'm HawkBot, your SiteHawk AI consultant. I know the new SCIP format inside-out — Page 1 (Site Acquisition → SARF → Site/Owner → Zoning → Maps → Candidates A/B/C → CloudRF propagation). Ask me anything, or click \"Build SCIP →\" to jump to your top candidate.";

// Curated, instant answer for "How do I use SiteHawk?" — served locally so the
// first-question experience is always this polished walkthrough.
const HOW_TO_QUESTION = "How do I use SiteHawk?";
const HOW_TO_ANSWER = `Welcome to SiteHawk! I'm HawkBot, your AI consultant.

SiteHawk is designed to streamline your site acquisition process by generating comprehensive Site Candidate Information Packages (SCIPs).

Here's the general workflow:

1.  **Input your search criteria:** Define your search ring information, including site name, latitude/longitude, search radius, SARF height, tower type, and desired compound size.
2.  **Run a scan:** SiteHawk will analyze various data sources (Notion, Realie, Enformion, etc.) to identify potential parcels and gather critical information.
3.  **Review Scan Results:** Once the scan is complete, you'll see a summary of potential candidates.
4.  **Generate a SCIP:** To compile all the detailed information into a comprehensive report, simply click the **"Generate SCIP" button** on the Scan Results page, or use the **"Build SCIP →" shortcut** at the top of this chat.

The SCIP will then be assembled with the following sections, providing you with a complete picture for each candidate:

1.  SITE ACQUISITION
2.  SEARCH RING INFORMATION
3.  SARF MAP
4.  SITE INFORMATION + OWNER INFORMATION
5.  EXISTING CONDITIONS
6.  SITE NOTES
7.  ZONING / TOWER SPECIFICS / SITE PLAN / BUILDING PERMIT
8.  MAPS (various types)
9.  SCIP MAPS (various types)
10. CANDIDATES SUMMARY
11. RF PROPAGATION ANALYSIS

Feel free to ask me any technical questions about the platform or specific sections of the SCIP!`;

export default function HawkBotWidget() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", text: WELCOME }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  // Detect "build/generate a SCIP" intent and route the user to /scip with whatever
  // candidate context is already available (from ScanResults state, if present).
  const handleScipIntent = () => {
    const fromResults = location.state?.results?.[0] || location.state?.candidate;
    if (fromResults) {
      navigate("/scip", {
        state: {
          candidate: fromResults,
          ordinance: location.state?.ordinance,
          searchCenter: location.state?.searchCenter,
          allResults: location.state?.results,
        },
      });
    } else {
      navigate("/search");
    }
    setOpen(false);
  };

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    // "How do I use SiteHawk?" — serve the curated walkthrough instantly.
    if (msg === HOW_TO_QUESTION) {
      setMessages((prev) => [...prev, { role: "user", text: msg }, { role: "assistant", text: HOW_TO_ANSWER }]);
      setInput("");
      return;
    }

    // SCIP shortcut — if the user explicitly asks to build/generate one
    if (/\b(build|generate|create|make|run)\b.*\bscip\b/i.test(msg)) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text: msg },
        { role: "assistant", text: "🦅 Routing you to the SCIP generator with your top candidate loaded. The new Page 1 format auto-fills via Notion zoning + Realie parcels + Enformion skip-trace + CloudRF propagation." },
      ]);
      setInput("");
      setTimeout(handleScipIntent, 800);
      return;
    }

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);
    try {
      const res = await siteChat({
        message: msg,
        context: { source: "hawkbot_global", scip_format: SCIP_CONTEXT },
      });
      const data = res.data;
      const reply = data?.response || data?.message || data?.error || "Sorry, I couldn't get a response. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Connection error. Please check your network and try again." }]);
    }
    setLoading(false);
  };

  return (
    <>
      {/* Floating launcher button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open HawkBot"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/30 hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="font-heading font-bold text-sm hidden sm:inline">Ask HawkBot</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(440px,calc(100vw-2.5rem))] h-[min(680px,calc(100vh-6rem))] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar">
            <div className="flex items-center gap-2">
              <HawkIcon size={32} />
              <div>
                <h3 className="font-heading font-bold text-foreground text-sm">HawkBot</h3>
                <p className="text-[10px] text-muted-foreground">Parcels · Zoning · SCIP</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleScipIntent}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-500 text-[#0C1B2E] hover:bg-cyan-400 text-[11px] font-bold tracking-wider transition-all"
                aria-label="Build SCIP"
              >
                <FileText className="w-3 h-3" /> Build SCIP →
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all" aria-label="Close HawkBot">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && <HawkIcon size={24} className="mr-1.5 mt-0.5 shrink-0" />}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start items-center gap-2">
                <HawkIcon size={24} />
                <div className="bg-secondary rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick actions */}
          {messages.length <= 1 && !loading && (
            <div className="px-4 pb-3">
              <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Quick Questions</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action}
                    onClick={() => sendMessage(action)}
                    className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-all font-medium"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-border bg-card">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ask about parcels, zoning, SCIP..."
                className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-all"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground mt-2">Powered by SkyWave AI · Real data only</p>
          </div>
        </div>
      )}
    </>
  );
}