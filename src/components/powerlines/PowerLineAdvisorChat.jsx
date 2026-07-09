/**
 * PowerLineAdvisorChat — chat panel for the power_line_advisor agent.
 * Sits directly below the Power Map. Explains transmission-line proximity
 * implications (NESC clearances, crane safety, induced voltage, ROW, etc.)
 * for tower construction projects.
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MessageBubble from "@/components/agent/MessageBubble";

const SUGGESTIONS = [
  "My tower site is 300 ft from a 230kV line — what should I worry about?",
  "What are the NESC clearance rules near transmission lines?",
  "Does a nearby transmission line help or hurt my site?",
  "Crane safety rules when building near high-voltage lines?",
];

export default function PowerLineAdvisorChat() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      const last = data.messages?.[data.messages.length - 1];
      if (last?.role === "assistant" && last.content) setSending(false);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    setSending(true);
    let conv = conversation;
    if (!conv) {
      conv = await base44.agents.createConversation({
        agent_name: "power_line_advisor",
        metadata: { name: "Power Line Advisor", description: "Transmission line proximity Q&A" },
      });
      setConversation(conv);
    }
    setMessages((prev) => [...prev, { role: "user", content }]);
    await base44.agents.addMessage(conv, { role: "user", content });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-amber-500/15 via-transparent to-transparent border-b border-amber-500/30 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
          <Zap className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <div className="text-[10px] font-mono text-amber-700 tracking-[0.3em]">AI ADVISOR · TRANSMISSION PROXIMITY</div>
          <h2 className="font-heading font-bold text-lg text-foreground leading-tight">Power Line Advisor</h2>
          <p className="text-xs text-muted-foreground">
            Ask what a nearby transmission line means for your tower build — clearances, crane safety, grounding, ROW, and power-service upside.
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="px-5 py-4 space-y-4 max-h-[420px] overflow-y-auto">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={sending}
                  className="text-xs px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/5 hover:bg-amber-500/15 transition-colors text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Advisor is thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/30"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. 500kV line 150 ft from my compound — dealbreaker?"
          className="flex-1"
          disabled={sending}
        />
        <Button type="submit" disabled={!input.trim() || sending} className="gap-1.5">
          <Send className="w-4 h-4" /> Ask
        </Button>
      </form>

      <div className="px-4 pb-3 text-[10px] text-muted-foreground text-center">
        Guidance only — final clearance & safety determinations require the serving utility and a licensed PE.
      </div>
    </div>
  );
}