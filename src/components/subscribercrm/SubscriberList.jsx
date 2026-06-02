import { Search, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { SEGMENTS, inSegment } from "@/lib/subscriberCrm";

const RISK_DOT = { low: "bg-emerald-500", medium: "bg-amber-500", high: "bg-red-500", unknown: "bg-slate-300" };
const TIER_TONE = {
  Trial: "bg-secondary text-secondary-foreground",
  "Hawk Vision": "bg-blue-500/10 text-blue-700",
  "Hawk Site": "bg-indigo-500/10 text-indigo-700",
  "Hawk Enterprise": "bg-purple-500/10 text-purple-700",
  Canceled: "bg-red-500/10 text-red-700",
  Unknown: "bg-secondary text-muted-foreground",
};

// Segment filter + searchable subscriber table.
export default function SubscriberList({ contacts, segment, setSegment, search, setSearch, onSelect }) {
  const filtered = contacts
    .filter((c) => inSegment(c, segment))
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [c.name, c.email, c.company].some((v) => (v || "").toLowerCase().includes(q));
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, company…"
            className="w-full text-sm rounded-lg border border-border pl-9 pr-3 py-2 bg-background" />
        </div>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className="text-sm rounded-lg border border-border px-3 py-2 bg-background">
          {SEGMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-bold border-b border-border">
          <div className="col-span-4">Subscriber</div>
          <div className="col-span-2">Tier</div>
          <div className="col-span-2">Usage</div>
          <div className="col-span-2">Last active</div>
          <div className="col-span-2">Risk</div>
        </div>
        {filtered.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground text-center">No subscribers in this segment.</p>}
        {filtered.map((c) => (
          <button key={c.id} onClick={() => onSelect(c)}
            className="w-full grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-4 py-3 text-left border-b border-border last:border-0 hover:bg-secondary/50 items-center">
            <div className="sm:col-span-4 min-w-0">
              <div className="font-medium text-foreground truncate">{c.name || c.email}</div>
              <div className="text-xs text-muted-foreground truncate">{c.email}{c.company ? ` · ${c.company}` : ""}</div>
            </div>
            <div className="sm:col-span-2">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${TIER_TONE[c.subscription_tier] || TIER_TONE.Unknown}`}>{c.subscription_tier}</span>
            </div>
            <div className="sm:col-span-2 text-xs text-muted-foreground">{c.total_scips_created || 0} SCIP · {c.total_mailers_sent || 0} mail</div>
            <div className="sm:col-span-2 text-xs text-muted-foreground">{c.last_active_at ? formatDistanceToNow(new Date(c.last_active_at), { addSuffix: true }) : "—"}</div>
            <div className="sm:col-span-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${RISK_DOT[c.churn_risk] || RISK_DOT.unknown}`} /> {c.churn_risk}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}