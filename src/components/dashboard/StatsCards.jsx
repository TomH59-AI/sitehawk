import { Search, Target, TrendingUp, MapPin } from "lucide-react";

export default function StatsCards({ searches, results }) {
  const totalSearches = searches.length;
  const totalResults = searches.reduce((sum, s) => sum + (s.results_count || 0), 0);
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.match_score || 0), 0) / results.length)
    : 0;
  const completedSearches = searches.filter(s => s.status === "completed").length;

  const cards = [
    { icon: Search, label: "Total Searches", value: totalSearches, color: "text-primary bg-primary/10" },
    { icon: MapPin, label: "Parcels Found", value: totalResults, color: "text-accent bg-accent/10" },
    { icon: Target, label: "Avg Match Score", value: `${avgScore}%`, color: "text-emerald-400 bg-emerald-500/10" },
    { icon: TrendingUp, label: "Completed", value: completedSearches, color: "text-amber-400 bg-amber-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-border bg-card p-5">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${card.color}`}>
            <card.icon className="w-4 h-4" />
          </div>
          <p className="font-heading font-bold text-2xl text-foreground">{card.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
        </div>
      ))}
    </div>
  );
}