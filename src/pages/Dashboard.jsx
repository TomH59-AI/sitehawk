import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import UsageBar from "../components/dashboard/UsageBar";
import StatsCards from "../components/dashboard/StatsCards";
import SearchHistoryTable from "../components/dashboard/SearchHistoryTable";

const TIER_LIMITS = { blind: 0, free: 0, monthly: 50, annual: 50, pro: 50 };

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [searches, setSearches] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const me = await base44.auth.me();
      setUser(me);
      const [searchData, resultData] = await Promise.all([
        base44.entities.SearchHistory.filter({ created_by: me.email }, "-created_date", 50),
        base44.entities.SearchResult.filter({ created_by: me.email }, "-match_score", 100),
      ]);
      setSearches(searchData);
      setResults(resultData);
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

  const tier = user?.tier || "free";
  const limit = TIER_LIMITS[tier] || 1;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlySearches = searches.filter(s => new Date(s.created_date) >= monthStart).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground">
            Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">When you need the AI vision</p>
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary border border-border text-xs font-medium text-foreground">
            <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
            {monthlySearches} of {TIER_LIMITS[tier] ?? 0} searches used this month
            <span className="text-muted-foreground capitalize">· {tier === "monthly" ? "20/20 Vision" : tier === "annual" ? "20/4 Vision" : tier === "blind" ? "Blind Vision" : tier} plan</span>
          </div>
        </div>
        <Link to="/search">
          <Button className="gap-2 font-heading font-semibold">
            <Search className="w-4 h-4" />
            New Scan
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {/* Usage */}
      <UsageBar used={monthlySearches} limit={limit} tier={tier} />

      {/* Stats */}
      <StatsCards searches={searches} results={results} />

      {/* History */}
      <div>
        <h2 className="font-heading font-semibold text-lg text-foreground mb-4">Recent Searches</h2>
        <SearchHistoryTable searches={searches.slice(0, 10)} />
      </div>
    </div>
  );
}