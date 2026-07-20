import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import MessageBubble from "@/components/agent/MessageBubble";
import { Send, Loader2, ShieldCheck } from "lucide-react";

const QUICK_PROMPTS = [
  "Will a 199 ft tower work at 28.3199, -80.7301?",
  "Verify zoning at 28.3199, -80.7301",
  "What are the cell tower rules for Brevard County, FL?",
];

// Hawk Zoning Verifier — chat UI for the zoning_verifier in-app agent.
export default function ZoningVerifier() {
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
          agent_name: "zoning_verifier",
          metadata: { name: "Zoning Verification", description: "Hawk Zoning Verifier session" },
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
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-xl text-foreground">Hawk Zoning Verifier</h1>
          <p className="text-xs text-muted-foreground">
            Verifies zoning districts, future land use & telecom ordinance rules against official sources — never guesses.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center pt-10 space-y-4">
            <p className="text-sm text-muted-foreground">
              Give me coordinates, a jurisdiction, or a zoning determination to verify.
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
          placeholder="e.g. Verify RH zoning at 28.3199, -80.7301 in Rockledge, FL…"
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
      <p className="text-[10px] text-muted-foreground/70 text-center pt-2">
        Verification aid only — final zoning determinations must be confirmed in writing with the local planning department.
      </p>
    </div>
  );
}