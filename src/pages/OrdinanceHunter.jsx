import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import MessageBubble from "@/components/agent/MessageBubble";
import { Send, Loader2, Crosshair } from "lucide-react";

const QUICK_PROMPTS = [
  "Get the telecom tower ordinance for Rockledge, FL",
  "Hunt the tower & antenna code for Karnes County, TX",
  "Ordinance rules at 28.3199, -80.7301 — refresh from the source",
];

// Ordinance Hunter — chat UI for the ordinance_hunter in-app agent.
// Registry-first recall → OxyLabs scrape → extraction → registry save → Notion archive.
export default function OrdinanceHunter() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    try {
      let conv = conversation;
      if (!conv) {
        conv = await base44.agents.createConversation({
          agent_name: "ordinance_hunter",
          metadata: { name: "Ordinance Hunt", description: "Ordinance Hunter session" },
        });
        setConversation(conv);
      }
      setMessages((prev) => [...prev, { role: "user", content }]);
      await base44.agents.addMessage(conv, { role: "user", content });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Crosshair className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-xl text-foreground">Ordinance Hunter</h1>
          <p className="text-xs text-muted-foreground">
            Hunts the telecom tower & antenna sections of any local ordinance — instant recall from the registry, deep scrape when it's new, archived to Notion.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center pt-10 space-y-4">
            <p className="text-sm text-muted-foreground">
              Give me a jurisdiction (city/county + state) or site coordinates.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="px-3 py-1.5 rounded-full text-xs border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex items-center gap-2 pt-3 border-t border-border"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Get the wireless tower ordinance for Brevard County, FL…"
          className="flex-1 px-4 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
      <p className="text-[10px] text-muted-foreground/70 text-2 text-center pt-2">
        Extracted from the published municipal code — confirm final requirements with the local planning department.
      </p>
    </div>
  );
}