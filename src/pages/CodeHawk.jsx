import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import MessageBubble from "@/components/agent/MessageBubble";
import RegistryHealth from "@/components/codehawk/RegistryHealth";
import ReviewQueue from "@/components/codehawk/ReviewQueue";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Send, Loader2, Radar, Activity, ClipboardCheck } from "lucide-react";

const QUICK_PROMPTS = [
  "Get the telecom tower ordinance for Rockledge, FL",
  "Hunt the tower & antenna code for Karnes County, TX",
  "Ordinance rules at 28.3199, -80.7301 — refresh from the source",
];

// CodeHawk — the reconnected Ordinance Hunter. The chat tab coordinates the
// in-app agent; the agent delegates every scrape, extraction, and write to the
// codehawk* backend functions so nothing lands in the registry uncited.
function HuntChat() {
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
          metadata: { name: "CodeHawk Hunt", description: "CodeHawk ordinance session" },
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
    <div className="flex h-[calc(100vh-16rem)] min-h-[420px] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="space-y-4 pt-8 text-center">
            <p className="text-sm text-muted-foreground">Give me a jurisdiction (city or county + state) or site coordinates.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="mx-auto max-w-md text-[11px] leading-relaxed text-muted-foreground/80">
              CodeHawk checks the SiteHawk registry first and answers instantly if we already have it. On a miss it finds the official code,
              reads it, and saves every rule with its own quote and section number.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2 border-t border-border pt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Get the wireless tower ordinance for Brevard County, FL…"
          className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
      <p className="pt-2 text-center text-[10px] text-muted-foreground/70">
        Extracted from the published municipal code — confirm final requirements with the local planning department.
      </p>
    </div>
  );
}

export default function CodeHawk() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState("hunt");

  useEffect(() => {
    base44.auth
      .me()
      .then((user) => setIsAdmin(user?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
          <Radar className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">Ordinance Intelligence</div>
          <h1 className="font-heading text-2xl font-bold leading-tight">CodeHawk</h1>
          <p className="text-sm text-muted-foreground">
            Registry-first ordinance recall, and a coordinated hunt when we don&rsquo;t have it yet — every value cited to its code section.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="hunt">
            <Radar className="mr-1.5 h-4 w-4" /> Hunt
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="health">
              <Activity className="mr-1.5 h-4 w-4" /> Registry Health
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="review">
              <ClipboardCheck className="mr-1.5 h-4 w-4" /> Review Queue
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="hunt">
          <HuntChat />
        </TabsContent>
        <TabsContent value="health">
          <RegistryHealth isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="review">
          <ReviewQueue isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
