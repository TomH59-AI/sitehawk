import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { DollarSign, Calendar, AlertTriangle, CheckCircle2, TrendingUp, ArrowRight } from "lucide-react";

function StatCard({ icon: IconComp, label, value, sub, color = "primary" }) {
  const Icon = IconComp;
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="font-heading font-bold text-2xl text-foreground">{value}</div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function HawkLeaseDashboard() {
  const [sites, setSites] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.HawkLeaseSite.list(),
      base44.entities.HawkLeaseEvent.list("-event_date", 50),
    ]).then(([s, e]) => {
      setSites(Array.isArray(s) ? s : []);
      setEvents(Array.isArray(e) ? e : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const active = sites.filter(s => s.status === "Active" || s.status === "Executed");
  const totalMonthly = active.reduce((sum, s) => sum + (s.base_monthly_rent || 0), 0);

  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const upcomingOptions = sites.filter(s => {
    if (!s.next_option_date) return false;
    const d = new Date(s.next_option_date);
    return d >= now && d <= in90;
  });

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const milestonesThisWeek = events.filter(e => {
    const d = new Date(e.event_date);
    return d >= weekStart && d <= weekEnd;
  });

  const recentEvents = events.slice(0, 8);

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

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={CheckCircle2} label="Active Leases" value={active.length} sub="Executed or Active status" color="green" />
        <StatCard icon={Calendar} label="Options (90 days)" value={upcomingOptions.length} sub="Upcoming option dates" color="amber" />
        <StatCard icon={AlertTriangle} label="Milestones This Week" value={milestonesThisWeek.length} sub="Events logged this week" color="primary" />
        <StatCard icon={DollarSign} label="$/Month Under Mgmt" value={`$${totalMonthly.toLocaleString()}`} sub="Active + executed only" color="blue" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Events */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-foreground">Recent Activity</h2>
            <Link to="/hawk-lease/sites" className="text-xs text-primary flex items-center gap-1 hover:underline">
              All Sites <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events logged yet.</p>
          ) : (
            <div className="space-y-2">
              {recentEvents.map(e => (
                <div key={e.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{e.event_type?.replace(/_/g, " ")}</div>
                    {e.notes && <div className="text-xs text-muted-foreground truncate">{e.notes}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {e.event_date ? new Date(e.event_date).toLocaleDateString() : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Options */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-foreground">Upcoming Option Dates</h2>
            <span className="text-xs text-muted-foreground">Next 90 days</span>
          </div>
          {upcomingOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No option dates in the next 90 days.</p>
          ) : (
            <div className="space-y-2">
              {upcomingOptions.map(s => (
                <Link key={s.id} to={`/hawk-lease/sites/${s.id}`} className="flex items-center gap-3 py-2 border-b border-border last:border-0 hover:bg-secondary/30 rounded-lg px-2 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{s.site_name}</div>
                    <div className="text-xs text-muted-foreground">{s.carrier} · {s.city}, {s.state}</div>
                  </div>
                  <div className="text-xs font-medium text-amber-600 dark:text-amber-400 shrink-0">
                    {new Date(s.next_option_date).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* All Sites Quick List */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold text-foreground">All Lease Sites ({sites.length})</h2>
          <Link to="/hawk-lease/sites" className="text-xs text-primary flex items-center gap-1 hover:underline">
            Full List <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {sites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lease sites yet. Add your first site from the Lease Sites tab.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4">Site</th>
                  <th className="text-left py-2 pr-4">Carrier</th>
                  <th className="text-left py-2 pr-4">State</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-right py-2">$/Mo</th>
                </tr>
              </thead>
              <tbody>
                {sites.slice(0, 10).map(s => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                    <td className="py-2 pr-4">
                      <Link to={`/hawk-lease/sites/${s.id}`} className="font-medium text-primary hover:underline">{s.site_name}</Link>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.carrier || "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.state}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status] || "bg-secondary text-secondary-foreground"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {s.base_monthly_rent ? `$${s.base_monthly_rent.toLocaleString()}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}