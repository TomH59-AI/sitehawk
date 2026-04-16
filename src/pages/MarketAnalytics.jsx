import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { BarChart2, TrendingUp, Loader2, MapPin, AlertTriangle, CheckCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { marketDemandAnalytics } from "@/functions/marketDemandAnalytics";

const MARKET_TYPES = [
  { id: "urban", label: "🏙️ Urban Dense", desc: "Downtown, high-density metro" },
  { id: "suburban", label: "🏘️ Suburban", desc: "Residential suburbs, strip malls" },
  { id: "rural", label: "🌾 Rural", desc: "Agricultural, low-density areas" },
  { id: "highway", label: "🛣️ Highway Corridor", desc: "Interstate, major road corridors" },
  { id: "industrial", label: "🏭 Industrial", desc: "Warehouses, logistics, factories" },
];

const TIER_COLORS = {
  "Very High": "#16A34A",
  "High": "#22D3EE",
  "Moderate": "#D97706",
  "Low": "#F97316",
  "Very Low": "#DC2626",
};

const SATURATION_CONFIG = {
  "Undersupplied": { color: "text-green-400", icon: "📈", badge: "bg-green-500/10 border-green-500/20" },
  "Balanced": { color: "text-blue-400", icon: "⚖️", badge: "bg-blue-500/10 border-blue-500/20" },
  "Oversupplied": { color: "text-red-400", icon: "📉", badge: "bg-red-500/10 border-red-500/20" },
};

function StatCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p style={{ color }} className="text-2xl font-bold font-mono">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function MarketAnalytics() {
  const { toast } = useToast();
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [radius, setRadius] = useState("5");
  const [marketType, setMarketType] = useState("suburban");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleAnalyze = async () => {
    if (!lat || !lon) {
      toast({ title: "Coordinates required", description: "Enter lat/lon to analyze a market.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await marketDemandAnalytics({
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        radius_miles: parseFloat(radius) || 5,
        market_type: marketType,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data.analytics);
    } catch (err) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const demandColor = result ? (TIER_COLORS[result.demand_tier] || "#94a3b8") : "#94a3b8";
  const satConfig = result ? (SATURATION_CONFIG[result.market_saturation] || SATURATION_CONFIG.Balanced) : null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Market Demand Analytics</h1>
          <p className="text-muted-foreground text-sm">AI-powered predictive analysis of cell site demand, revenue potential, and 5-year market forecasts</p>
        </div>
      </div>

      {/* Input Panel */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="font-heading font-semibold text-sm text-foreground uppercase tracking-wider">Market Parameters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Latitude *</label>
            <input
              type="number"
              placeholder="e.g. 42.3601"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Longitude *</label>
            <input
              type="number"
              placeholder="e.g. -71.0589"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Radius (miles)</label>
            <input
              type="number"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAnalyze} disabled={loading} className="w-full gap-2 font-heading font-semibold">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><BarChart2 className="w-4 h-4" /> Analyze Market</>}
            </Button>
          </div>
        </div>

        {/* Market Type */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Market Type</label>
          <div className="flex flex-wrap gap-2">
            {MARKET_TYPES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMarketType(m.id)}
                title={m.desc}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  marketType === m.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card/50 text-muted-foreground hover:border-primary/40"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border border-border bg-card p-12 text-center space-y-3">
          <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto" />
          <p className="font-heading font-semibold text-foreground">Running predictive market analysis...</p>
          <p className="text-xs text-muted-foreground">Querying internet for latest telecom trends & market data</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Demand Score"
              value={result.demand_score || "—"}
              sub={result.demand_tier}
              color={demandColor}
            />
            <StatCard
              label="3-Year Growth"
              value={result.projected_growth_3yr_pct != null ? `+${result.projected_growth_3yr_pct}%` : "—"}
              sub="Projected demand increase"
              color="#22D3EE"
            />
            <StatCard
              label="Revenue Potential"
              value={result.revenue_potential_low_k && result.revenue_potential_high_k
                ? `$${result.revenue_potential_low_k}K–$${result.revenue_potential_high_k}K`
                : "—"}
              sub="Estimated annual range"
              color="#A78BFA"
            />
            <StatCard
              label="Confidence"
              value={result.confidence_level || "—"}
              sub="Analysis confidence"
              color={result.confidence_level === "High" ? "#16A34A" : result.confidence_level === "Medium" ? "#D97706" : "#DC2626"}
            />
          </div>

          {/* Summary + Saturation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 rounded-xl border border-border bg-card p-4">
              <h4 className="font-heading font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Market Summary</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>
            </div>
            {satConfig && (
              <div className={`rounded-xl border p-4 flex flex-col items-center justify-center text-center gap-2 ${satConfig.badge}`}>
                <span className="text-3xl">{satConfig.icon}</span>
                <p className={`font-bold text-sm ${satConfig.color}`}>{result.market_saturation}</p>
                <p className="text-xs text-muted-foreground">Market saturation status</p>
              </div>
            )}
          </div>

          {/* 5-Year Forecast Chart */}
          {result.five_year_forecast?.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h4 className="font-heading font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-4">5-Year Demand Forecast</h4>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={result.five_year_forecast} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#f8fafc" }}
                  />
                  <Area type="monotone" dataKey="demand_index" stroke="#22D3EE" fill="url(#demandGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Drivers & Risks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.demand_drivers?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <h4 className="font-heading font-semibold text-xs uppercase tracking-wider text-green-400 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Demand Drivers
                </h4>
                {result.demand_drivers.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-green-400 mt-0.5">✓</span>{d}
                  </div>
                ))}
              </div>
            )}
            {result.risk_factors?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <h4 className="font-heading font-semibold text-xs uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Risk Factors
                </h4>
                {result.risk_factors.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-amber-400 mt-0.5">!</span>{r}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tech Trends + Tower Types */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.technology_trends?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <h4 className="font-heading font-semibold text-xs uppercase tracking-wider text-muted-foreground">Technology Trends</h4>
                <div className="flex flex-wrap gap-2">
                  {result.technology_trends.map((t, i) => (
                    <span key={i} className="px-2 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {result.recommended_tower_types?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <h4 className="font-heading font-semibold text-xs uppercase tracking-wider text-muted-foreground">Recommended Tower Types</h4>
                <div className="flex flex-wrap gap-2">
                  {result.recommended_tower_types.map((t, i) => (
                    <span key={i} className="px-2 py-1 rounded-full border border-accent/30 bg-accent/10 text-accent text-xs">📡 {t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-16 text-center">
          <TrendingUp className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-heading font-semibold text-muted-foreground">Enter coordinates to generate a market demand report</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Analysis uses real-time web data and AI-powered forecasting</p>
        </div>
      )}
    </div>
  );
}