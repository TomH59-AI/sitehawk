import { useMemo, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";
import { APP_DESTINATIONS, searchDestinations } from "@/lib/appDestinations";

/**
 * SearchHub — the standalone Search page. Fully independent of the SCIP
 * pipeline: it only reads the static destination index and navigates.
 */
export default function SearchHub() {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = new URLSearchParams(location.search).get("q") || "";
  const [query, setQuery] = useState(initial);

  const grouped = useMemo(() => {
    const list = query.trim() ? searchDestinations(query) : APP_DESTINATIONS;
    const map = new Map();
    for (const d of list) {
      if (!map.has(d.group)) map.set(d.group, []);
      map.get(d.group).push(d);
    }
    return Array.from(map.entries());
  }, [query]);

  const flat = grouped.flatMap(([, items]) => items);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && flat.length) navigate(flat[0].path);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground md:text-3xl">Search SiteHawk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find any page or tool by name or by what it does — then jump straight to it.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Try “zoning”, “fiber”, “lease”, “skip trace”, “forms”…"
          aria-label="Search pages and tools"
          className="h-14 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      {flat.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-8 text-center">
          <p className="font-heading font-bold text-foreground">No page matches “{query}”</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a broader word like zoning, tower, lease, fiber, forms, or billing.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([group, items]) => (
            <section key={group}>
              <h2 className="mb-2 text-[11px] font-bold tracking-widest text-muted-foreground">
                {group.toUpperCase()}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((d) => (
                  <Link
                    key={d.path}
                    to={d.path}
                    className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-sm font-bold text-foreground">{d.label}</div>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{d.desc}</p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}