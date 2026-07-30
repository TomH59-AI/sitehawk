import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Zap, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import MessageBubble from "@/components/agent/MessageBubble";
import HawkBoltComposer from "@/components/hawkbolt/HawkBoltComposer";
import HawkBoltEmptyState from "@/components/hawkbolt/HawkBoltEmptyState";

// HawkBolt — conversation surface for the orchestration superagent.
export default function HawkBolt() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      const last = data.messages?.[data.messages.length - 1];
      if (last?.role === "assistant" && !last.tool_calls?.some((t) => ["pending", "running", "in_progress"].includes(t.status))) {
        setBusy(false);
      }
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text) => {
    setBusy(true);
    let convo = conversation;
    if (!convo) {
      convo = await base44.agents.createConversation({
        agent_name: "hawkbolt",
        metadata: { name: text.slice(0, 60), description: "HawkBolt site qualification" },
      });
      setConversation(convo);
    }
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    await base44.agents.addMessage(convo, { role: "user", content: text });
  };

  const reset = () => { setConversation(null); setMessages([]); setBusy(false); };

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-4xl flex-col p-4">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="font-heading text-lg font-bold text-foreground">HawkBolt</h1>
          <span className="text-xs text-muted-foreground">Orchestration superagent</span>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> New site
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0
            ? <HawkBoltEmptyState onPick={send} />
            : messages.map((m, i) => <MessageBubble key={i} message={m} />)}
        </div>
        <HawkBoltComposer onSend={send} busy={busy} />
      </div>

      <p className="pt-2 text-[11px] text-muted-foreground">
        Screening tool only — ordinance readings and fit grades are not a substitute for a PE-stamped
        drawing or the jurisdiction's own determination.
      </p>
    </div>
  );
}