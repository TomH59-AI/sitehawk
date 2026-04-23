import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getMailOrders } from "@/functions/getMailOrders";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Mail, DollarSign, TrendingUp, CheckCircle, Clock, Printer, Package, AlertCircle } from "lucide-react";

const STATUS_COLORS = {
  pending:   "#f59e0b",
  printing:  "#3b82f6",
  mailed:    "#8b5cf6",
  delivered: "#22c55e",
};

const STATUS_ICONS = {
  pending:   Clock,
  printing:  Printer,
  mailed:    Mail,
  delivered: CheckCircle,
};

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">{label}</p>
        <p className="text-2xl font-heading font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function MailAnalytics() {
  const [orders, setOrders] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function load() {
      const user = await base44.auth.me();
      if (user?.role !== "admin") { setLoading(false); return; }
      setIsAdmin(true);

      const [ordersRes, dealsData] = await Promise.all([
        getMailOrders({}),
        base44.entities.CRMDeal.list(),
      ]);

      setOrders(ordersRes?.data?.orders || []);
      setDeals(dealsData || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground">Admin access required to view mail analytics.</p>
      </div>
    );
  }

  // ── Derived metrics ──────────────────────────────────────────────
  const totalOrders = orders.length;
  const totalInvestment = orders.reduce((s, o) => s + (o.amount || 0), 0) / 100;
  const totalLetters = orders.reduce((s, o) => s + (parseInt(o.letters) || 0), 0);

  // Status breakdown
  const statusCounts = { pending: 0, printing: 0, mailed: 0, delivered: 0 };
  orders.forEach(o => { if (statusCounts[o.fulfillment_status] !== undefined) statusCounts[o.fulfillment_status]++; });
  const statusChartData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  // Delivery rate = delivered / total
  const deliveredCount = statusCounts.delivered;
  const deliveryRate = totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0;

  // Cross-reference: how many mail order owner names appear as CRM deals
  const orderOwnerNames = new Set(orders.map(o => o.owner_name?.toLowerCase().trim()).filter(Boolean));
  const convertedLeads = deals.filter(d => orderOwnerNames.has(d.owner_name?.toLowerCase().trim()));
  const conversionRate = totalOrders > 0 ? Math.round((convertedLeads.length / totalOrders) * 100) : 0;

  // Monthly investment chart
  const monthlyMap = {};
  orders.forEach(o => {
    const d = new Date(o.created * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    if (!monthlyMap[key]) monthlyMap[key] = { month: label, investment: 0, campaigns: 0 };
    monthlyMap[key].investment += (o.amount || 0) / 100;
    monthlyMap[key].campaigns++;
  });
  const monthlyData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

  // Plan breakdown
  const planMap = {};
  orders.forEach(o => {
    const plan = o.plan || "unknown";
    if (!planMap[plan]) planMap[plan] = { plan, count: 0, investment: 0 };
    planMap[plan].count++;
    planMap[plan].investment += (o.amount || 0) / 100;
  });
  const planData = Object.values(planMap);

  // CRM stage breakdown for converted leads
  const stageMap = {};
  convertedLeads.forEach(d => {
    stageMap[d.stage] = (stageMap[d.stage] || 0) + 1;
  });
  const stageData = Object.entries(stageMap).map(([name, value]) => ({ name, value }));

  const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading font-bold text-3xl text-foreground">Mail Campaign Analytics</h1>
        <p className="text-muted-foreground mt-1 text-sm">Performance metrics for all direct mail campaigns</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Mail} label="Total Campaigns" value={totalOrders} sub={`${totalLetters} letters sent`} />
        <StatCard icon={DollarSign} label="Total Investment" value={`$${totalInvestment.toLocaleString()}`} sub="across all campaigns" color="text-accent" />
        <StatCard icon={CheckCircle} label="Delivery Rate" value={`${deliveryRate}%`} sub={`${deliveredCount} of ${totalOrders} delivered`} color="text-green-500" />
        <StatCard icon={TrendingUp} label="Lead Conversion" value={`${conversionRate}%`} sub={`${convertedLeads.length} owners in CRM`} color="text-purple-400" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fulfillment Status Pie */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-heading font-semibold text-base text-foreground mb-4">Fulfillment Status Breakdown</h2>
          {totalOrders === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No campaigns yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                  {statusChartData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}

          {/* Status badges */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {Object.entries(statusCounts).map(([status, count]) => {
              const Icon = STATUS_ICONS[status];
              return (
                <div key={status} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40">
                  <Icon className="w-4 h-4" style={{ color: STATUS_COLORS[status] }} />
                  <span className="text-xs text-muted-foreground capitalize">{status}</span>
                  <span className="ml-auto text-xs font-bold text-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly Investment Bar Chart */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-heading font-semibold text-base text-foreground mb-4">Monthly Investment ($)</h2>
          {monthlyData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v) => [`$${v}`, "Investment"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="investment" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Breakdown */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-heading font-semibold text-base text-foreground mb-4">Campaigns by Plan</h2>
          {planData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={planData} layout="vertical" margin={{ left: 16, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis dataKey="plan" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={80} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} name="Campaigns" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="mt-4 space-y-2">
            {planData.map(p => (
              <div key={p.plan} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{p.plan.replace(/_/g, " ")}</span>
                <span className="text-foreground font-semibold">${p.investment.toFixed(0)} invested · {p.count} sent</span>
              </div>
            ))}
          </div>
        </div>

        {/* Converted Leads CRM Stage */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-heading font-semibold text-base text-foreground mb-1">Owner Response Pipeline</h2>
          <p className="text-xs text-muted-foreground mb-4">CRM stage breakdown for mail-contacted owners</p>
          {stageData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <TrendingUp className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">No CRM leads matched to mail campaigns yet</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={stageData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                    {stageData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {stageData.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-muted-foreground capitalize">{s.name}</span>
                    <span className="ml-auto font-semibold text-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-heading font-semibold text-base text-foreground mb-4">All Campaigns</h2>
        {orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No mail campaigns found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Date", "Owner", "Parcel Address", "Plan", "Letters", "Investment", "Status"].map(h => (
                    <th key={h} className="pb-3 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map(o => {
                  const Icon = STATUS_ICONS[o.fulfillment_status] || Clock;
                  return (
                    <tr key={o.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                        {new Date(o.created * 1000).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4 font-medium text-foreground">{o.owner_name || "—"}</td>
                      <td className="py-3 pr-4 text-muted-foreground max-w-[180px] truncate">{o.parcel_address || "—"}</td>
                      <td className="py-3 pr-4 capitalize text-foreground">{(o.plan || "—").replace(/_/g, " ")}</td>
                      <td className="py-3 pr-4 text-center text-foreground">{o.letters || "—"}</td>
                      <td className="py-3 pr-4 text-foreground font-semibold">${((o.amount || 0) / 100).toFixed(0)}</td>
                      <td className="py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ background: STATUS_COLORS[o.fulfillment_status] + "22", color: STATUS_COLORS[o.fulfillment_status] }}>
                          <Icon className="w-3 h-3" />
                          {o.fulfillment_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}