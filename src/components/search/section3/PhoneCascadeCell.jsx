/**
 * PhoneCascadeCell — renders the resolved phone for one Target column with a
 * source badge ([Enformion] / [Spokeo] / [WhitePages] / [Aggregated: N sources]),
 * a hover popup listing ALL phones found with their sources, and a "Try again"
 * action when nothing was found.
 *
 * Editable: the resolved number drops into the same textarea the rest of the
 * grid uses, so the user can still hand-edit / type a different one.
 */
import { useState } from "react";
import { Phone, RefreshCw, ChevronDown, Mail, Copy } from "lucide-react";

const BADGE_COLORS = {
  Enformion: "#0e7490",
  Spokeo: "#7c3aed",
  WhitePages: "#b45309",
  TruthFinder: "#be123c",
};

function badgeStyle(source) {
  if (!source) return { background: "#64748b" };
  if (source.startsWith("Aggregated")) return { background: "#628C83" };
  return { background: BADGE_COLORS[source] || "#475569" };
}

export default function PhoneCascadeCell({ result, loading, value, onChange, onPick, onRetry }) {
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Tracing across sources…
      </div>
    );
  }

  // Entity owner
  if (result?.is_entity_owner) {
    return <div className="px-4 py-2 text-sm text-amber-700 dark:text-amber-300 italic">Entity owner — manual lookup required</div>;
  }

  // No match after all sources
  if (result && !result.phone && (!result.phones || result.phones.length === 0)) {
    return (
      <div className="px-4 py-2 text-sm">
        <span className="text-muted-foreground italic">No match across 4 sources — manual lookup needed.</span>
        <button onClick={onRetry} className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-[#628C83] hover:underline">
          <RefreshCw className="w-3 h-3" /> Try again
        </button>
      </div>
    );
  }

  const phones = result?.phones || [];
  const source = result?.source;
  const emails = result?.emails || [];
  const topEmail = result?.email;

  return (
    <div className="relative">
      <textarea
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-full px-4 py-2 pr-8 text-sm bg-transparent outline-none resize-y text-foreground focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
      />
      {source && (
        <div className="px-4 pb-2 -mt-1 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded" style={badgeStyle(source)}>
            <Phone className="w-2.5 h-2.5" /> {source}
          </span>
          {phones.length > 0 && (
            <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
              {phones.length} found <ChevronDown className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {topEmail && (
        <div className="px-4 pb-2 -mt-1 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded" style={{ background: "#0e7490" }}>
            <Mail className="w-2.5 h-2.5" /> Email
          </span>
          <a href={`mailto:${topEmail}`} className="text-[11px] font-medium text-foreground hover:underline truncate max-w-[150px]" title={topEmail}>
            {topEmail}
          </a>
          <button
            onClick={() => navigator.clipboard?.writeText(topEmail)}
            title="Copy email"
            className="text-muted-foreground hover:text-foreground"
          >
            <Copy className="w-3 h-3" />
          </button>
          {emails.length > 1 && (
            <span className="text-[10px] text-muted-foreground">+{emails.length - 1} more</span>
          )}
        </div>
      )}

      {open && phones.length > 0 && (
        <div className="absolute z-20 left-3 top-full -mt-1 w-64 rounded-lg border border-border bg-popover shadow-lg p-2 text-sm">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 pb-1">All phones found</div>
          {phones.map((p) => (
            <button
              key={p.phone}
              onClick={() => { onPick(p.display); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between gap-2"
            >
              <span className="font-medium">{p.display}</span>
              <span className="flex items-center gap-1 flex-wrap justify-end">
                {p.mobile && <span className="text-[9px] text-green-600 font-semibold">MOBILE</span>}
                {p.sources.map((s) => (
                  <span key={s} className="text-[9px] text-white px-1 py-0.5 rounded" style={badgeStyle(s)}>{s}</span>
                ))}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}