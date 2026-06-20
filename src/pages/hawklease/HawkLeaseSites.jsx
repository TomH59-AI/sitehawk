import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";

const STATUS_OPTS = ["All", "Pre-LOI", "LOI Sent", "LOI Executed", "Drafted", "In Negotiation", "Executed", "Active", "Terminated"];
const CARRIER_OPTS = ["All", "Verizon", "AT&T", "T-Mobile", "DISH", "Tower_Co", "Other"];

const statusColors = {
  "Pre-LOI": "bg-slate-500/10 text-slate-600",
  "LOI Sent": "bg-blue-500/10 text-blue-600",
  "LOI Executed": "bg-cyan-500/10 text-cyan-600",
  "Drafted": "bg-violet-500/10 text-violet-600",
  "In Negotiation": "bg-amber-500/10 text-amber-600",
  "Executed": "bg-emerald-500/10 text-emerald-600",
  "Active": "bg-green-500/10 text-green-600",
  "Terminated": "bg-red-500/10 text-red-600",
};

export default function HawkLeaseSites() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("All");

  useEffect(() => {
    base44.entities.HawkLeaseSite.list("-updated_date", 200).then(data => {
      setSites(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = sites.filter(s => {
    if (search && !`${s.site_name} ${s.property_address} ${s.city}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "All" && s.status !== statusFilter) return false;
    if (stateFilter && s.state?.toLowerCase() !== stateFilter.toLowerCase()) return false;
    if (carrierFilter !== "All" && s.carrier !== carrierFilter) return false;
    return true;
  });

  const states = [...new Set(sites.map(s => s.state).filter(Boolean))].sort();

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sites…" className="pl-9" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          {STATUS_OPTS.map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          <option value="">All States</option>
          {states.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={carrierFilter} onChange={e => setCarrierFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground">
          {CARRIER_OPTS.map(o => <option key={o}>{o}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} site{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">No lease sites match your filters.</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 border-b border-border">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3">Site Name</th>
                  <th className="text-left px-4 py-3">Address</th>
                  <th className="text-left px-4 py-3">City</th>
                  <th className="text-left px-4 py-3">State</th>
                  <th className="text-left px-4 py-3">Carrier</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">$/Mo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/hawk-lease/sites/${s.id}`} className="font-medium text-primary hover:underline">{s.site_name}</Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{s.property_address}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.city}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.state}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.carrier || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status] || "bg-secondary text-secondary-foreground"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {s.base_monthly_rent ? `$${s.base_monthly_rent.toLocaleString()}` : "—"}
                    </td>
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