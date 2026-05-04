import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Compass, Lock, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TowerPlacementPanel from "@/components/tower/TowerPlacementPanel";

const ALLOWED_TIERS = ["hawkeye_20", "hawkeye_apex"];

export default function TowerPlacement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searches, setSearches] = useState([]);
  const [results, setResults] = useState([]);
  const [selectedSearchId, setSelectedSearchId] = useState("");
  const [selectedParcelId, setSelectedParcelId] = useState("");

  useEffect(() => {
    async function init() {
      const me = await base44.auth.me().catch(() => null);
      setUser(me);
      if (me && ALLOWED_TIERS.includes(me.tier)) {
        const hist = await base44.entities.SearchHistory.filter({ created_by: me.email }, "-created_date", 50);
        setSearches(hist);
      }
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (!selectedSearchId) { setResults([]); setSelectedParcelId(""); return; }
    base44.entities.SearchResult.filter({ search_id: selectedSearchId }, "-match_score", 20).then(r => {
      setResults(r);
      if (r.length) setSelectedParcelId(r[0].id);
    });
  }, [selectedSearchId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !ALLOWED_TIERS.includes(user.tier)) {
    return (
      <div className="max-w-2xl mx-auto rounded-xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
        <Lock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h2 className="font-heading font-bold text-xl text-foreground">Tower Placement is a premium feature</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Tower Placement Analysis is available on <span className="font-semibold text-foreground">Hawkeye 20/20</span> and <span className="font-semibold text-foreground">Hawkeye Apex</span> plans.
          Generate professional, PE-ready site plan PDFs with setback math, fall-zone analysis, and compliance documentation.
        </p>
        <Link to="/pricing" className="inline-block mt-4 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">
          View Plans
        </Link>
      </div>
    );
  }

  const selectedParcel = results.find(r => r.id === selectedParcelId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground flex items-center gap-3">
          <Compass className="w-7 h-7 text-primary" />
          Tower Placement Analysis
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pick a parcel from a previous scan, enter your tower specs, and generate a PE-ready site plan PDF with fall-zone math and compliance documentation.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="font-heading font-semibold text-sm text-foreground">Select a Parcel</h3>
        {searches.length === 0 ? (
          <div className="rounded-lg border border-border bg-secondary/40 p-6 text-center">
            <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">You don't have any past scans yet.</p>
            <Link to="/search" className="inline-block mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
              Run a Site Scan
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Past Scan</label>
              <Select value={selectedSearchId} onValueChange={setSelectedSearchId}>
                <SelectTrigger><SelectValue placeholder="Choose a scan..." /></SelectTrigger>
                <SelectContent>
                  {searches.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.search_label || `Scan @ ${s.latitude?.toFixed(4)}, ${s.longitude?.toFixed(4)}`} · {new Date(s.created_date).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Candidate Parcel</label>
              <Select value={selectedParcelId} onValueChange={setSelectedParcelId} disabled={results.length === 0}>
                <SelectTrigger><SelectValue placeholder="Choose a parcel..." /></SelectTrigger>
                <SelectContent>
                  {results.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.site_name || r.parcel_address || `Parcel ${r.parcel_id}`} · {r.match_score}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {selectedParcel && (
        <TowerPlacementPanel parcel={selectedParcel} />
      )}
    </div>
  );
}