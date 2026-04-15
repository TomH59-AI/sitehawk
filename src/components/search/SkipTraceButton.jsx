import { useState, useEffect } from "react";
import { Phone, Mail, Building2, Copy, CheckCircle, Loader2, ChevronDown, ChevronUp, Clock, AlertCircle } from "lucide-react";
import { skipTraceBatch } from "@/functions/skipTraceBatch";
import { base44 } from "@/api/base44Client";
import DirectMailButton from "./DirectMailButton";

export async function runSkipTrace({ owner_name, mailing_address, candidate_id, search_id }) {
  const res = await skipTraceBatch({ owner_name, mailing_address, candidate_id, search_id, mode: "single" });
  return res.data;
}

// ── Contact detail sub-components ───────────────────────────

function PhoneList({ phones }) {
  if (!phones?.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-teal-400 font-bold flex items-center gap-1"><Phone className="w-3 h-3" /> Phones</p>
      {phones.map((p, i) => (
        <div key={i} className="flex items-center gap-2 pl-1">
          <a href={`tel:${p.number}`} className="text-xs font-semibold text-emerald-400 hover:underline">{p.number}</a>
          {p.type && <span className="text-[10px] text-muted-foreground capitalize">{p.type}</span>}
          {p.confidence === "high" && <CheckCircle className="w-3 h-3 text-emerald-400" />}
        </div>
      ))}
    </div>
  );
}

function EmailList({ emails }) {
  if (!emails?.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-blue-400 font-bold flex items-center gap-1"><Mail className="w-3 h-3" /> Emails</p>
      {emails.map((e, i) => (
        <div key={i} className="flex items-center gap-2 pl-1">
          <a href={`mailto:${e.address}`} className="text-xs font-semibold text-blue-400 hover:underline truncate">{e.address}</a>
          {e.type && <span className="text-[10px] text-muted-foreground capitalize">{e.type}</span>}
          {e.confidence === "high" && <CheckCircle className="w-3 h-3 text-blue-400" />}
        </div>
      ))}
    </div>
  );
}

function LLCList({ llcs }) {
  if (!llcs?.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-purple-400 font-bold flex items-center gap-1"><Building2 className="w-3 h-3" /> Associated Entities</p>
      {llcs.map((l, i) => (
        <div key={i} className="pl-1 space-y-0.5">
          <p className="text-xs font-semibold text-foreground">{l.name} {l.state && <span className="text-muted-foreground font-normal">· {l.state}</span>}</p>
          {l.status && <p className="text-[10px] text-muted-foreground">Status: {l.status}</p>}
          {l.registered_agent && <p className="text-[10px] text-muted-foreground">Agent: {l.registered_agent}</p>}
        </div>
      ))}
    </div>
  );
}

// ── History panel ────────────────────────────────────────────

function SkipTraceHistory({ candidateId }) {
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!open) return;
    setLoading(true);
    const logs = await base44.entities.SkipTraceLog.filter({ candidate_id: candidateId }, "-created_date", 10);
    setHistory(logs || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [open]);

  const statusColor = { found: "text-emerald-400", partial: "text-yellow-400", not_found: "text-muted-foreground", error: "text-red-400" };
  const statusIcon = { found: <CheckCircle className="w-3 h-3" />, partial: <AlertCircle className="w-3 h-3" />, not_found: <Clock className="w-3 h-3" />, error: <AlertCircle className="w-3 h-3" /> };

  return (
    <div className="border-t border-teal-500/20 pt-2 mt-2">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
        <Clock className="w-3 h-3" />
        Attempt History
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {loading && <p className="text-[10px] text-muted-foreground">Loading…</p>}
          {!loading && history.length === 0 && <p className="text-[10px] text-muted-foreground italic">No previous attempts.</p>}
          {history.map((log, i) => (
            <div key={i} className="rounded-md bg-secondary/40 px-2 py-1.5 space-y-0.5">
              <div className={`flex items-center gap-1 text-[10px] font-bold ${statusColor[log.status] || "text-muted-foreground"}`}>
                {statusIcon[log.status]}
                Attempt #{log.attempt_number || i + 1} — {log.status}
                <span className="ml-auto text-muted-foreground font-normal">{new Date(log.created_date).toLocaleDateString()}</span>
              </div>
              {log.phones?.length > 0 && <p className="text-[10px] text-muted-foreground">{log.phones.length} phone(s) · {log.emails?.length || 0} email(s)</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────

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
        {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Tracing…</> : <><Phone className="w-3.5 h-3.5" /> Skip Trace</>}
      </button>
    );
  }

  const hasContact = result.phones?.length > 0 || result.emails?.length > 0 || result.phone || result.email;

  // Normalize legacy single-field results
  const phones = result.phones?.length ? result.phones : (result.phone ? [{ number: result.phone, type: "primary", confidence: "high" }] : []);
  const emails = result.emails?.length ? result.emails : (result.email ? [{ address: result.email, type: "primary", confidence: "high" }] : []);
  const llcs = result.associated_llcs || (result.registered_agent ? [{ name: result.company || "Entity", registered_agent: result.registered_agent, status: result.entity_status || "" }] : []);

  return (
    <div className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/5 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-bold text-teal-400">Skip Trace Results</span>
        {result.sunbiz_verified && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
            <CheckCircle className="w-3 h-3" /> Sunbiz Verified
          </span>
        )}
        <span className={`ml-auto text-[10px] font-bold ${hasContact ? "text-emerald-400" : "text-muted-foreground"}`}>
          {hasContact ? "Contact Found" : "No Contact Found"}
        </span>
      </div>

      {hasContact ? (
        <>
          <PhoneList phones={phones} />
          <EmailList emails={emails} />
          <LLCList llcs={llcs} />
        </>
      ) : (
        <div className="space-y-3">
          {result.tip && <p className="text-xs text-muted-foreground">{result.tip}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleCopy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary text-xs font-medium text-foreground hover:bg-secondary/80 transition-all">
              {copied ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy for Skip Trace"}
            </button>
            <DirectMailButton candidate={candidate} searchId={searchId} />
          </div>
          <p className="text-[10px] text-muted-foreground italic">Can't reach them digitally? We'll mail professional acquisition letters directly to the owner.</p>
        </div>
      )}

      {candidate?.id && <SkipTraceHistory candidateId={candidate.id} />}
    </div>
  );
}