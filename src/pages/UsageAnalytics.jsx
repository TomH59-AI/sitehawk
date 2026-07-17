import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  BarChart2, Users, Search, FileText, Briefcase, Mail, Scale, Radio,
  Loader2, ShieldAlert, RefreshCw, TrendingUp,
} from "lucide-react";
import { SKYWAVE } from "@/lib/skywave";

const ADMIN_EMAIL = "hodgesthomas@outlook.com";

function daysAgoISO(n) {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
}

// Count records created within a window from an already-fetched list.
function windowCounts(list) {
  const d30 = daysAgoISO(30);
  const d7 = daysAgoISO(7);
  return {
    total: list.length,
    last_30d: list.filter((r) => (r.created_date || "") >= d30).length,
    last_7d: list.filter((r) => (r.created_date || "") >= d7).length,
    most_recent: list[0]?.created_date || null,
  };
}

export default function UsageAnalytics() {
  const [authorized, setAuthorized] = useState(null); // null=checking, true/false
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    base44.auth.me().then((u) => {
      const ok = u?.role === "admin" || u?.email === ADMIN_EMAIL;
      setAuthorized(ok);
      if (ok) load();
      else setLoading(false);
    }).catch(() => setAuthorized(false));
  }, []);

  async function load() {
    setLoading(true);
    const d30 = daysAgoISO(30);
    const d7 = daysAgoISO(7);

    async function grab(entity) {
      try {
        return await base44.entities[entity].list("-created_date", 1000);
      } catch {
        return [];
      }
    }

    const [users, searches, scips, deals, contacts, mail, hawklaw, siting] = await Promise.all([
      grab("User"),
      grab("SearchHistory"),
      grab("ScipRecord"),
      grab("ScipCRMDeal"),
      grab("ScipCRMContact"),
      grab("PostcardMailerOrder"),
      grab("HawkLawSession"),
      grab("TowerSitingRun"),
    ]);

    setData({
      users: {
        total: users.length,
        new_30d: users.filter((u) => (u.created_date || "") >= d30).length,
        active_30d: users.filter((u) => (u.last_active_at || "") >= d30).length,
        active_7d: users.filter((u) => (u.last_active_at || "") >= d7).length,
      },
      recentUsers: [...users]
        .sort((a, b) => (b.last_active_at || "").localeCompare(a.last_active_at || ""))
        .slice(0, 12),
      metrics: [
        { key: "searches", label: "Site Searches", icon: Search, ...windowCounts(searches) },
        { key: "scips", label: "SCIP Records", icon: FileText, ...windowCounts(scips) },
        { key: "deals", label: "CRM Deals", icon: Briefcase, ...windowCounts(deals) },
        { key: "contacts", label: "CRM Contacts", icon: Users, ...windowCounts(contacts) },
        { key: "mail", label: "Postcard Orders", icon: Mail, ...windowCounts(mail) },
        { key: "hawklaw", label: "Hawk Law Sessions", icon: Scale, ...windowCounts(hawklaw) },
        { key: "siting", label: "Tower Siting Runs", icon: Radio, ...windowCounts(siting) },
      ],
    });
    setLoading(false);
  }

  if (authorized === false) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="w-12 h-12 text-muted-foreground mb-3" />
        <h1 className="font-heading text-2xl mb-1">Admins Only</h1>
        <p className="text-sm text-muted-foreground">This usage dashboard is restricted to administrators.</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: SKYWAVE.blue }} />
      </div>
    );
  }

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart2 className="w-7 h-7" style={{ color: SKYWAVE.blue }} />
          <div>
            <h1 className="font-heading text-2xl">Usage Analytics</h1>
            <p className="text-sm text-muted-foreground">Admin-only view of real activity across the app.</p>
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border hover:bg-secondary">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* User summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Users" value={data.users.total} icon={Users} />
        <StatCard label="New (30d)" value={data.users.new_30d} icon={TrendingUp} />
        <StatCard label="Active (30d)" value={data.users.active_30d} icon={Users} accent />
        <StatCard label="Active (7d)" value={data.users.active_7d} icon={Users} accent />
      </div>

      {/* Feature usage table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-heading text-lg">Feature Activity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-4 py-2 font-medium">Feature</th>
                <th className="px-4 py-2 font-medium text-right">All time</th>
                <th className="px-4 py-2 font-medium text-right">Last 30d</th>
                <th className="px-4 py-2 font-medium text-right">Last 7d</th>
                <th className="px-4 py-2 font-medium">Most recent</th>
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((m) => (
                <tr key={m.key} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <m.icon className="w-4 h-4" style={{ color: SKYWAVE.blue }} /> {m.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.total}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{m.last_30d}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{m.last_7d}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{fmtDate(m.most_recent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent users */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-heading text-lg">Users — Last Active</h2>
          <p className="text-xs text-muted-foreground">Login/activity tracking started now; timestamps fill in as users return.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Last active</th>
              </tr>
            </thead>
            <tbody>
              {data.recentUsers.map((u) => (
                <tr key={u.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{u.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-4 py-2.5 capitalize">{u.role || "user"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{fmtDate(u.created_date)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{fmtDate(u.last_active_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <Icon className="w-4 h-4" style={{ color: accent ? SKYWAVE.blue : "hsl(var(--muted-foreground))" }} />
      </div>
      <div className="text-3xl font-heading" style={{ color: accent ? SKYWAVE.blue : undefined }}>{value}</div>
    </div>
  );
}