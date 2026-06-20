import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const REGION_OPTS = ["All", "West", "Northeast", "Southeast", "Midwest", "South_Central", "Mountain"];
const DENSITY_OPTS = ["All", "Rural", "Suburban", "Urban", "Major_Metro"];
const LEASE_TYPE_OPTS = ["All", "ground", "rooftop", "tower_mod"];
const CARRIER_OPTS = ["All", "Verizon", "AT&T", "T-Mobile", "DISH", "AMT", "CCI", "SBA", "Tillman", "Vertical_Bridge", "Generic_Carrier", "Generic_Tower_Co"];

export default function HawkLeaseComps() {
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState("All");
  const [densityFilter, setDensityFilter] = useState("All");
  const [leaseTypeFilter, setLeaseTypeFilter] = useState("All");
  const [carrierFilter, setCarrierFilter] = useState("All");

  useEffect(() => {
    base44.entities.HawkLeaseComp.list("-effective_date", 200).then(data => {
      setComps(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = comps.filter(c => {
    if (regionFilter !== "All" && c.region !== regionFilter) return false;
    if (densityFilter !== "All" && c.density_tier !== densityFilter) return false;
    if (leaseTypeFilter !== "All" && c.lease_type !== leaseTypeFilter) return false;
    if (carrierFilter !== "All" && c.carrier !== carrierFilter) return false;
    return true;
  });

  const densityColor = {
    Rural: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    Suburban: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    Urban: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    Major_Metro: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading font-semibold text-foreground mb-1">Rent Comps Library</h2>
        <p className="text-sm text-muted-foreground">National tower lease rent comparables by region, density, and carrier.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          {REGION_OPTS.map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={densityFilter} onChange={e => setDensityFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          {DENSITY_OPTS.map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={leaseTypeFilter} onChange={e => setLeaseTypeFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          {LEASE_TYPE_OPTS.map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={carrierFilter} onChange={e => setCarrierFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          {CARRIER_OPTS.map(o => <option key={o}>{o}</option>)}
        </select>
        <span className="text-xs text-muted-foreground self-center">{filtered.length} comp{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">No comps match your filters.</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 border-b border-border">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3">Region</th>
                  <th className="text-left px-4 py-3">Market</th>
                  <th className="text-left px-4 py-3">Density</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Carrier</th>
                  <th className="text-right px-4 py-3">Low/Mo</th>
                  <th className="text-right px-4 py-3">Mid/Mo</th>
                  <th className="text-right px-4 py-3">High/Mo</th>
                  <th className="text-right px-4 py-3">Esc %</th>
                  <th className="text-left px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-2.5 text-muted-foreground">{c.region?.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.metro_market || c.state || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${densityColor[c.density_tier] || "bg-secondary text-secondary-foreground"}`}>
                        {c.density_tier}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.lease_type}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.carrier?.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400">${c.rent_low_monthly?.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-foreground">${c.rent_mid_monthly?.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-amber-600 dark:text-amber-400">${c.rent_high_monthly?.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{c.escalation_pct_typical ? `${c.escalation_pct_typical}%` : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">{c.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}