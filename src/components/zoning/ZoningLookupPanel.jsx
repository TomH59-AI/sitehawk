import { useState } from "react";
import { checkZoning, runZoningFeasibility } from "@/api/zoningEngine";
import { MapPin, Loader2, Search, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";

// ZoningLookupPanel — instant zoning district lookup backed by the live
// SiteHawk Zoning Engine (Supabase Edge Function → cache → GIS → ordinance).
// Address or "lat, lng" in → district + jurisdiction out, ~2s live / <1s cached.
export default function ZoningLookupPanel() {
  const [query, setQuery] = useState("");
  const [proposedUse, setProposedUse] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [feasibility, setFeasibility] = useState(null);
  const [error, setError] = useState(null);

  const parseInput = (raw) => {
    const m = raw.trim().match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    return { address: raw.trim() };
  };

  const lookup = async (e) => {
    e?.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setFeasibility(null);
    try {
      const input = parseInput(query);
      const zone = await checkZoning(input);
      setResult(zone);
      if (proposedUse.trim() && input.address) {
        try {
          const feas = await runZoningFeasibility({ address: input.address, proposedUse: proposedUse.trim() });
          setFeasibility(feas);
        } catch {
          // Feasibility needs ordinance data; district lookup alone is still a win.
        }
      }
    } catch (err) {
      setError(err.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const StatusIcon = feasibility
    ? { permitted: CheckCircle2, conditional: AlertTriangle, prohibited: XCircle }[feasibility.status] ?? HelpCircle
    : null;
  const statusColor = feasibility
    ? { permitted: "text-green-500", conditional: "text-amber-500", prohibited: "text-red-500" }[feasibility.status] ?? "text-muted-foreground"
    : "";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary" />
        <h2 className="font-heading font-semibold text-sm text-foreground">Instant District Lookup</h2>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">LIVE</span>
      </div>

      <form onSubmit={lookup} className="space-y-2">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={'Address or "lat, lng" — e.g. 1100 Atlantic St, Milford, MI 48381'}
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center justify-center px-4 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>
        <input
          value={proposedUse}
          onChange={(e) => setProposedUse(e.target.value)}
          placeholder="Optional: proposed use for feasibility (e.g. telecommunications tower)"
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </form>

      {error && (
        <div className="text-xs text-red-500 border border-red-500/20 bg-red-500/5 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-background p-3 space-y-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-heading font-bold text-2xl text-foreground">{result.districtCode}</span>
            <span className="text-sm text-muted-foreground">{result.districtName}</span>
            {result._fromCache && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">cached</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {result.jurisdiction}
            {result.fips?.state ? ` · FIPS ${result.fips.state}-${result.fips.county}` : ""}
            {typeof result.lat === "number" ? ` · ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}` : ""}
          </p>
          {result.source && (
            <p className="text-[10px] text-muted-foreground/60 truncate">
              Source: {result.source.startsWith("arcgis:") ? "Official GIS zoning layer" : result.source}
            </p>
          )}
          {result._notice && (
            <p className="text-[10px] text-amber-500">{result._notice}</p>
          )}
        </div>
      )}

      {feasibility && StatusIcon && (
        <div className="rounded-lg border border-border bg-background p-3 space-y-1">
          <div className={`flex items-center gap-2 text-sm font-semibold ${statusColor}`}>
            <StatusIcon className="w-4 h-4" />
            <span className="uppercase">{feasibility.status}</span>
            <span className="text-xs font-normal text-muted-foreground">— {proposedUse}</span>
          </div>
          {(feasibility.conditions ?? []).map((c, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {c}</p>
          ))}
          {(feasibility.flags ?? []).map((f, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {f}</p>
          ))}
        </div>
      )}
    </div>
  );
}
