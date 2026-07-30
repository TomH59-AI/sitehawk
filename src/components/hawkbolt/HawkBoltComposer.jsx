import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// HawkBolt message composer — Enter sends, Shift+Enter adds a line.
export default function HawkBoltComposer({ onSend, busy }) {
  const [value, setValue] = useState("");

  const send = () => {
    const text = value.trim();
    if (!text || busy) return;
    setValue("");
    onSend(text);
  };

  return (
    <div className="flex items-end gap-2 border-t border-border bg-card p-3">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder="Address, coordinates, or a question about a site…"
        rows={2}
        className="min-h-[52px] resize-none bg-secondary text-sm"
      />
      <Button onClick={send} disabled={busy || !value.trim()} size="icon" className="h-[52px] w-11 shrink-0">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
}