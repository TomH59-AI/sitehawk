import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ArrowRight } from "lucide-react";
import { searchDestinations } from "@/lib/appDestinations";

/**
 * AppSearch — the compact top-bar quick search. Clicking a suggestion jumps
 * straight to that page; pressing Enter opens the full Search page (/find)
 * with the query pre-filled so the user sees complete results.
 */
export default function AppSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef(null);

  const results = useMemo(() => searchDestinations(query).slice(0, 6), [query]);

  const close = () => { setQuery(""); setOpen(false); setActive(0); };

  const go = (path) => { close(); navigate(path); };

  const openFullPage = () => {
    const q = query.trim();
    close();
    navigate(q ? `/find?q=${encodeURIComponent(q)}` : "/find");
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); openFullPage(); return; }
    if (e.key === "Escape") { setOpen(false); return; }
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
  };

  return (
    <div className="relative ml-auto w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        onKeyDown={onKeyDown}
        placeholder="Search SiteHawk…"
        aria-label="Search the app"
        className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
      {query && (
        <button
          type="button"
          onClick={close}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-muted-foreground">No matching page</div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.path}
                type="button"
                onMouseDown={() => { clearTimeout(blurTimer.current); go(r.path); }}
                onMouseEnter={() => setActive(i)}
                className={`block w-full px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  i === active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                }`}
              >
                {r.label}
              </button>
            ))
          )}
          <button
            type="button"
            onMouseDown={() => { clearTimeout(blurTimer.current); openFullPage(); }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-xs font-semibold text-primary hover:bg-primary/5"
          >
            <ArrowRight className="h-3.5 w-3.5" /> See all results on the Search page
          </button>
        </div>
      )}
    </div>
  );
}