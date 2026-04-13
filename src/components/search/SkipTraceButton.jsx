import { useState } from "react";
import { Phone, Mail, User, Copy, CheckCircle, Loader2 } from "lucide-react";

const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrcHhlb3V2aWt6Z3NhdXJrb2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI5MzcxNDgsImV4cCI6MjA1ODUxMzE0OH0.GMm2u8HJeCv8vboySM8CNgIAdbCS27-wrCnMmlRzFCY";

export async function runSkipTrace({ owner_name, mailing_address, candidate_id, search_id }) {
  const res = await fetch("https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-skip-trace", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ owner_name, mailing_address, candidate_id, search_id }),
  });
  return res.json();
}

export default function SkipTraceButton({ candidate, searchId, result, onResult }) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleTrace = async () => {
    setLoading(true);
    const data = await runSkipTrace({
      owner_name: candidate.owner_name,
      mailing_address: candidate.owner_mailing_address,
      candidate_id: candidate.id,
      search_id: searchId,
    });
    onResult(data);
    setLoading(false);
  };

  const handleCopy = () => {
    const text = `Owner: ${candidate.owner_name}, Address: ${candidate.owner_mailing_address || "N/A"}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!result) {
    return (
      <button
        onClick={handleTrace}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 text-xs font-semibold transition-all disabled:opacity-60"
      >
        {loading ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Tracing...</>
        ) : (
          <><Phone className="w-3.5 h-3.5" /> Skip Trace</>
        )}
      </button>
    );
  }

  const hasContact = result.phone || result.email;

  return (
    <div className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-bold text-teal-400">Skip Trace Results</span>
        {result.sunbiz_verified && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
            <CheckCircle className="w-3 h-3" /> Sunbiz Verified
          </span>
        )}
      </div>

      {result.phone && (
        <div className="flex items-center gap-2">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs text-muted-foreground">Phone:</span>
          <a href={`tel:${result.phone}`} className="text-xs font-bold text-emerald-400 hover:underline">
            {result.phone}
          </a>
        </div>
      )}

      {result.email && (
        <div className="flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-xs text-muted-foreground">Email:</span>
          <a href={`mailto:${result.email}`} className="text-xs font-bold text-blue-400 hover:underline truncate">
            {result.email}
          </a>
        </div>
      )}

      {result.registered_agent && (
        <div className="flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="text-xs text-muted-foreground">Registered Agent:</span>
          <span className="text-xs font-bold text-foreground">{result.registered_agent}</span>
        </div>
      )}

      {!hasContact && result.tip && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{result.tip}</p>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary text-xs font-medium text-foreground hover:bg-secondary/80 transition-all"
          >
            {copied ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied!" : "Copy for Skip Trace"}
          </button>
        </div>
      )}
    </div>
  );
}