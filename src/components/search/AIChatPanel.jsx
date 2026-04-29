import { useState, useRef, useEffect } from "react";
import { X, Send } from "lucide-react";
import HawkIcon from "../HawkIcon";
import { siteChat } from "@/functions/siteChat";
const QUICK_ACTIONS = [
  "Which parcel is best?",
  "Explain zoning requirements",
  "What permits do I need?",
  "Setback requirements?",
];

export default function AIChatPanel({ open, onClose, searchId, candidates, ordinance }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "👋 I'm SiteHawk Vision, your AI site acquisition consultant. I've analyzed your scan results and I'm ready to help. Ask me anything about the candidates, zoning, permits, or site acquisition strategy.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);
    try {
      const res = await siteChat({
        message: msg,
        context: { search_id: searchId, candidates, ordinance },
      });
      const data = res.data;
      setMessages((prev) => [...prev, { role: "assistant", text: data.response || data.message || "Sorry, I couldn't get a response. Please try again." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Connection error. Please check your network and try again." }]);
    }
    setLoading(false);
  };

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[380px] max-w-full z-50 flex flex-col bg-card border-l border-border shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar">
        <div className="flex items-center gap-2">
          <HawkIcon size={32} />
          <div>
            <h3 className="font-heading font-bold text-foreground text-sm">SiteHawk Vision</h3>
            <p className="text-[10px] text-muted-foreground">Expert site acquisition consultant</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Context badge */}
      {candidates?.length > 0 && (
        <div className="px-4 py-2 bg-primary/5 border-b border-border">
          <p className="text-[11px] text-primary font-medium">
            📍 Analyzing {candidates.length} candidate parcel{candidates.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <HawkIcon size={24} className="mr-1.5 mt-0.5 shrink-0" />
            )}
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
      {candidates?.length > 0 && messages.length <= 2 && !loading && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Quick Actions</p>
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
            placeholder="Ask about parcels, zoning, permits..."
            className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground mt-2">Powered by SkyWave AI</p>
      </div>
    </div>
  );
}