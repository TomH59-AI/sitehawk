import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { MapPin, Zap, Plus, ChevronRight } from "lucide-react";
import MessageBubble from "@/components/agent/MessageBubble";
import ParcelScoutMap from "@/components/parcelScout/ParcelScoutMap";

const QUICK_PROMPTS = [
  "Add a 2.3-acre agricultural parcel at 36.1540, -95.9928 in Tulsa County, OK",
  "Evaluate this parcel: 1500 Rural Rd, Broken Arrow OK, C-2 zoning, 1.8 acres",
  "I have 3 parcels to add — where do I start?",
  "What makes a parcel score above 80?",
];

export default function ParcelScout() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [searchResults, setSearchResults] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    init();
    loadSearchResults();

    const unsubscribe = base44.entities.SearchResult.subscribe((event) => {
      if (event.type === "create") {
        setSearchResults((prev) => [event.data, ...prev]);
      } else if (event.type === "update") {
        setSearchResults((prev) => prev.map((r) => r.id === event.id ? event.data : r));
      } else if (event.type === "delete") {
        setSearchResults((prev) => prev.filter((r) => r.id !== event.id));
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadSearchResults = async () => {
    const me = await base44.auth.me();
    const data = await base44.entities.SearchResult.filter({ created_by: me.email }, "-created_date", 250);
    setSearchResults(data);
  };

  const init = async () => {
    try {
      const conv = await base44.agents.createConversation({
        agent_name: "parcel_scout",
        metadata: { name: "Parcel Scout Session" },
      });
      setConversation(conv);

      const unsubscribe = base44.agents.subscribeToConversation(conv.id, (data) => {
        setMessages(data.messages || []);
      });

      setInitializing(false);
      return () => unsubscribe();
    } catch (err) {
      console.error("Failed to initialize Parcel Scout:", err);
      setInitializing(false);
    }
  };

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading || !conversation) return;
    setInput("");
    setLoading(true);
    try {
      await base44.agents.addMessage(conversation, { role: "user", content: msg });
    } catch (err) {
      console.error("Failed to send message:", err);
    }
    setLoading(false);
  };

  if (initializing) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm">Starting Parcel Scout…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <MapPin className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground">Parcel Scout</h1>
          <p className="text-xs text-muted-foreground">AI-powered buildable parcel analysis &amp; SearchResult creation</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-400 font-medium">Active</span>
        </div>
      </div>

      <div className="mb-5">
        <ParcelScoutMap results={searchResults} />
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-6">
            <div className="text-center">
              <Zap className="w-10 h-10 text-primary mx-auto mb-3 opacity-60" />
              <p className="text-muted-foreground text-sm max-w-sm">
                Describe a parcel, paste land data, or ask Parcel Scout to evaluate a site. It will score the lot and create a <span className="text-primary font-medium">SearchResult</span> entry automatically.
              </p>
            </div>
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="text-left text-xs px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-secondary/50 text-foreground transition-all flex items-start gap-2"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {loading && (
          <div className="flex justify-start items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <MapPin className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border pt-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Paste parcel data or describe the site…"
            className="flex-1 bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || !conversation}
            className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center gap-1.5 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Scout
          </button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground mt-2">Powered by SkyWave AI · Results written directly to SearchResult database</p>
      </div>
    </div>
  );
}