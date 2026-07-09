import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Search, ArrowRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatsCards from "../components/dashboard/StatsCards";
import SearchHistoryTable from "../components/dashboard/SearchHistoryTable";
import WelcomeModal from "../components/onboarding/WelcomeModal";
import OnboardingChecklist from "../components/onboarding/OnboardingChecklist";
import HowToUseInstructions from "../components/dashboard/HowToUseInstructions";
import WorkflowIndex from "../components/dashboard/WorkflowIndex";
import TargetASummaryTable from "../components/dashboard/TargetASummaryTable";
import ReferralBanner from "../components/referral/ReferralBanner";
import DemoInviteCampaign from "../components/dashboard/DemoInviteCampaign";
import { getEffectiveTier } from "@/lib/testAccess";

const TIER_LIMITS = {
  free: 0,
  hawk_site: 15,
  hawk_site_law: 15,
  hawk_vision: 30,
  hawk_vision_law: 30,
  hawk_command: 9999,
  // legacy
  hawkeyes: 40,
  hawkeye_apex: 9999,
};

const TIER_LABELS = {
  free: "Free",
  hawk_site: "🦅 HawkSite Solo",
  hawk_site_law: "HawkSite + Hawk Law",
  hawk_vision: "🚀 HawkVision Pro",
  hawk_vision_law: "HawkVision + Hawk Law",
  hawk_command: "Hawk Enterprise",
  // legacy
  hawkeyes: "Hawkeyes",
  hawkeye_apex: "Hawkeye Apex",
};

// Build one summary row per SCIP record (its active Target A), joining the
// pipeline stage from ScipCRMDeal and the compliance shot clock from ComplianceCheck.
function buildTargetRows(scips, scipDeals, compliance) {
  const dealByScip = new Map(scipDeals.map((d) => [d.scip_record_id, d]));
  const complianceByScip = new Map(compliance.map((c) => [c.scipRecordId, c]));
  return scips.map((s) => {
    const idx = s.active_target_index || 0;
    const targetA = (s.parcel_targets || [])[idx] || null;
    const enrichment = s.rf_enrichment?.[String(idx)] || s.rf_enrichment?.[idx] || null;
    return {
      id: s.id,
      siteName: s.site_name || "Untitled SCIP",
      owner: targetA?.owner_name || "",
      stage: dealByScip.get(s.id)?.stage || "scip_generated",
      compliance: complianceByScip.get(s.id) || null,
      hasCoverage: !!enrichment?.coverage?.png_url,
    };
  });
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [searches, setSearches] = useState([]);
  const [results, setResults] = useState([]);
  const [deals, setDeals] = useState([]);
  const [targetRows, setTargetRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    async function load() {
      const me = await base44.auth.me();
      setUser(me);
      const [searchData, resultData, dealData, scipData, scipDeals, complianceData] = await Promise.all([
        base44.entities.SearchHistory.filter({ created_by: me.email }, "-created_date", 50),
        base44.entities.SearchResult.filter({ created_by: me.email }, "-match_score", 100),
        base44.entities.CRMDeal.filter({ created_by: me.email }, "-created_date", 100).catch(() => []),
        base44.entities.ScipRecord.filter({ created_by: me.email }, "-created_date", 100).catch(() => []),
        base44.entities.ScipCRMDeal.filter({ created_by: me.email }, "-created_date", 200).catch(() => []),
        base44.entities.ComplianceCheck.filter({ created_by: me.email }, "-created_date", 200).catch(() => []),
      ]);
      setSearches(searchData);
      setResults(resultData);
      setDeals(dealData);
      setTargetRows(buildTargetRows(scipData, scipDeals, complianceData));
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
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlySearches = searches.filter(s => new Date(s.created_date) >= monthStart).length;

  const hasSkipTrace = results.some(r => r.phone || r.email);
  const isNewUser = searches.length === 0;

  return (
    <div className="space-y-8">
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}

      {/* How to Use — only for brand-new users */}
      {isNewUser && <HowToUseInstructions />}

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
          <Button size="lg" className="gap-3 font-heading font-bold text-base md:text-lg h-14 px-8 uppercase tracking-wide">
            <Search className="w-5 h-5" />
            Start Your Journey Here
            <ArrowRight className="w-5 h-5" />
          </Button>
        </Link>
      </div>

      {/* Refer & earn — give 5 / get 5 growth loop */}
      <ReferralBanner />

      {/* ADMIN — 3-day demo campaign invites with personal letter */}
      {user?.role === "admin" && <DemoInviteCampaign />}

      {/* Schedule a call with Tom */}
      <a
        href="https://calendly.com/hodges-thomas"
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors px-5 py-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-foreground text-sm">Need help or have questions?</div>
              <div className="text-xs text-muted-foreground mt-0.5">Schedule a free 15-minute call with Tom — SiteHawk founder & site acquisition expert.</div>
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary/10 whitespace-nowrap font-semibold pointer-events-none">
            <CalendarDays className="w-3.5 h-3.5" />
            Schedule a Call
          </Button>
        </div>
      </a>

      {/* SiteHawk capabilities index — read-only directory of everything SiteHawk does */}
      <WorkflowIndex />

      {/* Active Target A summary — stage · shot clock · coverage */}
      <div>
        <h2 className="font-heading font-semibold text-lg text-foreground mb-4">Active Target A Sites</h2>
        <TargetASummaryTable rows={targetRows} />
      </div>

      {/* Onboarding Checklist — only for brand-new users */}
      {isNewUser && (
        <OnboardingChecklist searches={searches.length} hasSkipTrace={hasSkipTrace} tier={tier} />
      )}

      {/* Stats */}
      <StatsCards searches={searches} results={results} />

      {/* History */}
      <div>
        <h2 className="font-heading font-semibold text-lg text-foreground mb-4">Recent Searches</h2>
        <SearchHistoryTable searches={searches.slice(0, 10)} results={results} />
      </div>
    </div>
  );
}