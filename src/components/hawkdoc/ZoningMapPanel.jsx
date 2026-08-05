import { useState } from "react";
import { Map, ExternalLink, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { US_STATES } from "@/components/hawkfetch/usStates";
import { hawkPermitDocFetch } from "@/functions/hawkPermitDocFetch";

// Official zoning map / GIS viewer finder. Links come straight from the
// Oxylabs-sourced results — nothing is inferred or invented.
export default function ZoningMapPanel() {
  const [jurisdiction, setJurisdiction] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!jurisdiction.trim() || !stateCode) return;
    setLoading(true);
    setError(null);
    setItems(null);
    try {
      const res = await hawkPermitDocFetch({ jurisdiction: jurisdiction.trim(), state: stateCode });
      setItems(res.data?.zoning_map || []);
    } catch (e) {
      console.error("[ZoningMapPanel]", e);
      setError("Couldn't retrieve the zoning map. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <Map className="w-5 h-5 text-primary" />
        <div>
          <h2 className="font-heading font-bold text-lg leading-tight">Official Zoning Map</h2>
          <p className="text-xs text-muted-foreground">Find the jurisdiction's official zoning map or GIS viewer.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Jurisdiction</label>
          <Input
            placeholder="e.g., Pasco County"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">State</label>
          <Select value={stateCode} onValueChange={setStateCode}>
            <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {US_STATES.map(([code, name]) => (
                <SelectItem key={code} value={code}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={run} disabled={loading || !jurisdiction.trim() || !stateCode} className="gap-2 font-heading font-semibold">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Find Zoning Map
        </Button>
      </div>

      {error && (
        <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {items && (
        <div className="mt-5 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available (Oxylabs Web Scraper API).</p>
          ) : (
            items.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="text-sm font-medium truncate">{d.title}</span>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => window.open(d.url, "_blank")}>
                  Open <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}
          <p className="text-[11px] text-muted-foreground pt-2">Source: Oxylabs Web Scraper API (Google), official sources only.</p>
        </div>
      )}
    </div>
  );
}