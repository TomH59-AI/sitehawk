import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Loader2, ShieldCheck } from "lucide-react";
import { SKYWAVE } from "@/lib/skywave";
import MessageBubble from "@/components/agent/MessageBubble";

const QUICK_PROMPTS = [
  "Run the full pre-print audit",
  "Is this SCIP ready for carrier submittal?",
  "What sections are stale for the current target?",
];

// SCIP Quality Auditor agent — pre-print quality gate. Checks the SCIP against
// its source data (blank fields, stale sections, missing exhibits, coordinate
// mismatches) before the user prints or submits.
export default function ScipQualityAuditor({ record }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      const last = data.messages?.[data.messages.length - 1];
      if (last?.role === "assistant" && last.content) setBusy(false);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  const sendMessage = async (text) => {
    const content = String(text || "").trim();
    if (!content || busy) return;
    setBusy(true);
    setInput("");
    try {
      let conv = conversation;
      if (!conv) {
        conv = await base44.agents.createConversation({
          agent_name: "scip_quality_auditor",
          metadata: { name: `Audit — ${record.site_name}`, description: `Pre-print audit for SCIP ${record.id}` },
        });
        setConversation(conv);
        conv = await base44.agents.addMessage(conv, {
          role: "user",
          content: `SCIP record id: ${record.id}\nSite: ${record.site_name}\n\n${content}`,
        });
      } else {
        conv = await base44.agents.addMessage(conv, { role: "user", content });
      }
      setConversation(conv);
      setMessages(conv.messages || []);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-5" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5" style={{ color: SKYWAVE.blue }} />
        <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>SCIP Quality Auditor</h3>
      </div>
      <p className="text-xs mb-4" style={{ color: SKYWAVE.muted }}>
        Pre-print quality gate — checks every section against the source data: blank fields, stale sections from a previous target, missing map exhibits, and mismatched coordinates. Run it before you print.
      </p>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
              disabled={busy}
              className="px-3 py-1.5 rounded-full text-xs font-medium disabled:opacity-50"
              style={{ border: `1.5px solid ${SKYWAVE.blue}`, color: SKYWAVE.blue }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="max-h-[420px] overflow-y-auto space-y-3 mb-3 pr-1">
          {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
          {busy && (
            <div className="flex items-center gap-2 text-xs" style={{ color: SKYWAVE.muted }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Auditing the SCIP…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='e.g. "Audit this SCIP before I print it"'
          className="flex-1 px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: SKYWAVE.line, color: SKYWAVE.ink }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: SKYWAVE.blue }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </form>
    </div>
  );
}