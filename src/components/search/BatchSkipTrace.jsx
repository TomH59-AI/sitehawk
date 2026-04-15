import { useState } from "react";
import { Phone, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronUp, Zap, Clock } from "lucide-react";
import { skipTraceBatch } from "@/functions/skipTraceBatch";

const STATUS_STYLE = {
  found: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", icon: <CheckCircle className="w-3.5 h-3.5" />, label: "Found" },
  partial: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: <AlertCircle className="w-3.5 h-3.5" />, label: "Partial" },
  not_found: { color: "text-muted-foreground", bg: "bg-secondary border-border", icon: <Clock className="w-3.5 h-3.5" />, label: "Not Found" },
  error: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: <AlertCircle className="w-3.5 h-3.5" />, label: "Error" },
};

function ResultRow({ item }) {
  const [open, setOpen] = useState(false);
  const s = STATUS_STYLE[item.status] || STATUS_STYLE.not_found;

  return (
    <div className={`rounded-lg border p-3 ${s.bg} space-y-2`}>
      <div className="flex items-center gap-2">
        <span className={`${s.color}`}>{s.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{item.owner_name}</p>
          {item.error && <p className="text-[10px] text-red-400">{item.error}</p>}
        </div>
        <span className={`text-[10px] font-bold ${s.color}`}>{s.label}</span>
        {(item.phones?.length > 0 || item.emails?.length > 0) && (
          <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground">
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {open && (
        <div className="pl-2 space-y-2 border-t border-border/40 pt-2">
          {item.phones?.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <Phone className="w-3 h-3 text-teal-400" />
              <a href={`tel:${p.number}`} className="text-xs font-semibold text-emerald-400 hover:underline">{p.number}</a>
              <span className="text-[10px] text-muted-foreground capitalize">{p.type}</span>
            </div>
          ))}
          {item.emails?.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-3 h-3 text-blue-400 text-[10px] font-bold">@</span>
              <a href={`mailto:${e.address}`} className="text-xs font-semibold text-blue-400 hover:underline truncate">{e.address}</a>
            </div>
          ))}
          {item.associated_llcs?.map((l, i) => (
            <div key={i} className="text-[10px] text-purple-400">{l.name} {l.state && `· ${l.state}`}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BatchSkipTrace({ candidates }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [done, setDone] = useState(false);

  const eligible = candidates.filter(c => c.owner_name && c.owner_mailing_address);

  const toggleAll = () => {
    if (selected.size === eligible.length) setSelected(new Set());
    else setSelected(new Set(eligible.map(c => c.id)));
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runBatch = async () => {
    const batch = eligible.filter(c => selected.has(c.id));
    if (!batch.length) return;
    setRunning(true);
    setDone(false);
    setResults([]);
    const res = await skipTraceBatch({ mode: "batch", candidates: batch });
    setResults(res.data?.results || []);
    setDone(true);
    setRunning(false);
  };

  const foundCount = results.filter(r => r.status === "found" || r.status === "partial").length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-teal-400" /> Batch Skip Trace
          </h3>
          <p className="text-[11px] text-muted-foreground">{eligible.length} traceable candidates</p>
        </div>
        {done && results.length > 0 && (
          <span className="text-xs text-emerald-400 font-semibold">{foundCount}/{results.length} contacts found</span>
        )}
      </div>

      {/* Candidate selector */}
      {!done && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.size === eligible.length && eligible.length > 0}
              onChange={toggleAll}
              className="rounded border-border"
              id="select-all"
            />
            <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer">Select all ({eligible.length})</label>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
            {eligible.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleOne(c.id)}
                  className="rounded border-border shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{c.owner_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.owner_mailing_address}</p>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={runBatch}
            disabled={selected.size === 0 || running}
            className="w-full py-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {running ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running batch trace…</>
            ) : (
              <><Phone className="w-3.5 h-3.5" /> Trace {selected.size} Selected</>
            )}
          </button>
        </div>
      )}

      {/* Results */}
      {done && results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => <ResultRow key={i} item={r} />)}
          <button
            onClick={() => { setDone(false); setResults([]); }}
            className="w-full py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          >
            Run Another Batch
          </button>
        </div>
      )}
    </div>
  );
}