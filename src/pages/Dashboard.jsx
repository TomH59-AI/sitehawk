import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import UsageBar from "../components/dashboard/UsageBar";
import StatsCards from "../components/dashboard/StatsCards";
import SearchHistoryTable from "../components/dashboard/SearchHistoryTable";
import WelcomeModal from "../components/onboarding/WelcomeModal";
import OnboardingChecklist from "../components/onboarding/OnboardingChecklist";
import ReferralPanel from "../components/referral/ReferralPanel";
import FieldConnectCard from "../components/dashboard/FieldConnectCard";
import RecentParcelsMap from "../components/dashboard/RecentParcelsMap";
import ParcelEvaluationSummary from "../components/dashboard/ParcelEvaluationSummary";
import { getEffectiveTier } from "@/lib/testAccess";

const TIER_LIMITS = {
  blind: 0,
  free: 0,
  hawk_site: 30,
  hawkeyes: 150,
  hawk_sight: 150,
  hawkeye_20: 600,
  hawkeye_apex: 9999,
};

const TIER_LABELS = {
  blind: "Blind",
  free: "Free Trial",
  hawk_site: "Hawk Site",
  hawkeyes: "Hawkeyes",
  hawk_sight: "Hawk Sight",
  hawkeye_20: "Hawkeye 20/20",
  hawkeye_apex: "Hawkeye Apex",
};

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [searches, setSearches] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);

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
      // Show welcome modal on first visit
      const seen = localStorage.getItem("sitehawk_welcome_seen");
      if (!seen) {
        setShowWelcome(true);
        localStorage.setItem("sitehawk_welcome_seen", "1");
      }
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

  const tier = getEffectiveTier(user);
  const limit = TIER_LIMITS[tier] || 1;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlySearches = searches.filter(s => new Date(s.created_date) >= monthStart).length;

  const hasSkipTrace = results.some(r => r.phone || r.email);

  return (
    <div className="space-y-8">
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground">
            Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">"When you need AI Hawk Vision"™</p>
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary border border-border text-xs font-medium text-foreground">
            <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
            {monthlySearches} of {TIER_LIMITS[tier] ?? 0} searches used this month
            <span className="text-muted-foreground">· {TIER_LABELS[tier] || "Blind"} plan</span>
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

      {/* Onboarding Checklist */}
      <OnboardingChecklist searches={searches.length} hasSkipTrace={hasSkipTrace} tier={tier} />

      {/* Usage */}
      <UsageBar used={monthlySearches} limit={limit} tier={tier} />

      {/* Stats */}
      <StatsCards searches={searches} results={results} />

      {/* Parcel Evaluation Summary — zoning + feasibility breakdown */}
      <ParcelEvaluationSummary results={results} />

      {/* Top Parcels Map */}
      <RecentParcelsMap results={results} />

      {/* Field Connect — WhatsApp */}
      <FieldConnectCard tier={tier} />

      {/* History */}
      <div>
        <h2 className="font-heading font-semibold text-lg text-foreground mb-4">Recent Searches</h2>
        <SearchHistoryTable searches={searches.slice(0, 10)} />
      </div>

      {/* Referral */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <ReferralPanel />
      </div>
    </div>
  );
}