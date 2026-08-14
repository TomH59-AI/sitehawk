import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Loader2, FileText, Map as MapIcon, ExternalLink, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { US_STATES } from "@/components/hawkfetch/usStates";
import MessageBubble from "@/components/agent/MessageBubble";

/**
 * PermitFetcherChat — conversation UI for the permit_fetcher agent on
 * Step 12 (HawkDocs). The user enters a jurisdiction + state, and the
 * agent uses Scrapfly to scrape the official website and extract real
 * permit application links and zoning map links.
 */
export default function PermitFetcherChat() {
  const [jurisdiction, setJurisdiction] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  // Subscribe to conversation updates
  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      const hasPending = (data.messages || []).some(
        (m) => m.role === "assistant" && (m.tool_calls || []).some(
          (tc) => tc.status === "pending" || tc.status === "running" || tc.status === "in_progress"
        )
      );
      setThinking(hasPending || (data.messages || []).some((m) => m.role === "assistant" && !m.content && (m.tool_calls || []).length > 0));
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  const startFetch = async () => {
    if (!jurisdiction.trim() || !stateCode) return;
    setThinking(true);
    setMessages([]);

    try {
      const conv = await base44.agents.createConversation({
        agent_name: "permit_fetcher",
        metadata: { name: `Permit Fetch — ${jurisdiction.trim()}, ${stateCode}` },
      });
      setConversation(conv);

      await base44.agents.addMessage(conv, {
        role: "user",
        content: `Find the official permit application forms and zoning map for ${jurisdiction.trim()}, ${stateCode}, USA. Scrape the jurisdiction's official website with Scrapfly and return: (1) direct links to building and zoning permit application forms (PDFs and online portal), (2) the official zoning map URL (GIS viewer or PDF). Only include URLs you actually found on the scraped page — never invent links.`,
      });
    } catch (e) {
      console.error("[PermitFetcherChat]", e);
      setThinking(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 md:p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-heading font-bold text-lg leading-tight">AI Permit &amp; Zoning Map Fetcher</h2>
          <p className="text-xs text-muted-foreground">
            Enter the jurisdiction — the agent scrapes the official website with Scrapfly to extract real permit application links and the official zoning map.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 items-end mb-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Jurisdiction</label>
          <Input
            placeholder="e.g., Pasco County"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startFetch()}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">State</label>
          <select
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-secondary px-2 text-sm"
          >
            <option value="">State</option>
            {US_STATES.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>
        <Button
          onClick={startFetch}
          disabled={!jurisdiction.trim() || !stateCode || thinking}
          className="gap-2 font-heading font-semibold"
        >
          {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Fetch with AI
        </Button>
      </div>

      {(messages.length > 0 || thinking) && (
        <div ref={scrollRef} className="max-h-[500px] overflow-y-auto space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {thinking && messages.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Agent is scraping the jurisdiction website…
            </div>
          )}
        </div>
      )}
    </div>
  );
}