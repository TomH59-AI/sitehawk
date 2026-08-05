import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";

// Every destination a subscriber can jump to, with the words they're likely to type.
const DESTINATIONS = [
  { path: "/dashboard", label: "Dashboard", keywords: "home start overview stats" },
  { path: "/search", label: "Site Search", keywords: "sarf search ring scan parcels pipeline scip candidate" },
  { path: "/talonfit", label: "TalonFit® — Ordinance Intelligence", keywords: "talonfit ordinance height setback fall zone scout ten target buildable" },
  { path: "/hawk-tracker", label: "Hawk Tracker", keywords: "tracker sites progress milestones pipeline status" },
  { path: "/follow-up-tracker", label: "Follow-Up Tracker", keywords: "follow up reminders tasks callbacks" },
  { path: "/skip-trace", label: "Skip-Trace", keywords: "skip trace owner phone email contact landowner" },
  { path: "/crm", label: "AI Time Savers", keywords: "crm deals contacts postcards mailers time savers outreach" },
  { path: "/hawk-lease", label: "HawkLease", keywords: "lease rent comps hawklease revenue" },
  { path: "/hawk-law", label: "Hawk Law", keywords: "law legal lease review redline clauses" },
  { path: "/hawk-vision", label: "HawkVision", keywords: "vision photo render tower visualization 3d image" },
  { path: "/zoning-verifier", label: "Zoning Verifier", keywords: "zoning verify accuracy check ordinance" },
  { path: "/rfi-engine", label: "RF Intelligence Engine", keywords: "rf radio coverage propagation towers map colocation" },
  { path: "/fiber-operators", label: "Local Services Directory", keywords: "fiber power utility police fire 911 psap backhaul operators directory" },
  { path: "/hawk-fill", label: "HawkFill", keywords: "hawkfill upload template fill my document" },
  { path: "/hawk-forms", label: "Hawk Forms", keywords: "forms fcc faa 7460 asr paperwork" },
  { path: "/hawk-docs", label: "Document Intelligence", keywords: "documents scan extract analyze pdf" },
  { path: "/pricing", label: "Pricing & Plans", keywords: "pricing plans subscription upgrade tiers cost" },
  { path: "/billing", label: "Billing", keywords: "billing invoice payment card subscription manage" },
  { path: "/about", label: "About SiteHawk", keywords: "about company info help" },
];

export default function AppSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return DESTINATIONS.filter(
      (d) => d.label.toLowerCase().includes(q) || d.keywords.includes(q)
    ).slice(0, 7);
  }, [query]);

  const go = (path) => {
    setQuery("");
    setOpen(false);
    navigate(path);
  };

  const onKeyDown = (e) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[active].path); }
    else if (e.key === "Escape") { setOpen(false); }
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
          onClick={() => { setQuery(""); setOpen(false); }}
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
        </div>
      )}
    </div>
  );
}