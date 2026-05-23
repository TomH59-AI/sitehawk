import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ScanResultsSidebar from "../components/scan/ScanResultsSidebar";
import ScanResultsMap from "../components/scan/ScanResultsMap";
import HeadlineSatelliteMap from "../components/scan/HeadlineSatelliteMap";
import HeadlineMapErrorBoundary from "../components/scan/HeadlineMapErrorBoundary";
import AIChatPanel from "../components/search/AIChatPanel";
import { applyFiltersAndSort } from "../components/scan/ResultsFilterSort";
import { FEATURE_LEAFLET_MAP } from "@/lib/featureFlags";
import { getEffectiveTier, hasUnlimitedAccess } from "@/lib/testAccess";

const DEFAULT_FILTERS = {
  minScore: 0, maxScore: 100,
  minAcres: 0, maxAcres: 200,
  maxAirportDist: 999,
  zoningTypes: [], ownerTypes: [],
  femaFilter: "any",
};

export default function ScanResults() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [userTier, setUserTier] = useState(null);
  const [freeTrialUsed, setFreeTrialUsed] = useState(false);
  const [contactCache, setContactCache] = useState({});
  const [sortKey, setSortKey] = useState("match_score_desc");
  const [displayedResults, setDisplayedResults] = useState(null);
  const flyToRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUserTier(hasUnlimitedAccess(u) ? "hawkeye_apex" : getEffectiveTier(u));
      setFreeTrialUsed(!!u?.free_trial_used);
    });
  }, []);

  useEffect(() => {
    if (!state?.results) navigate("/search");
    else setDisplayedResults(state.results);
  }, [state, navigate]);

  if (!state?.results) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Returning you to Site Search...</p>
        </div>
      </div>
    );
  }

  const { results, ordinance, searchCenter, searchId, usage, plan, searchParams } = state;
  const shown = displayedResults ?? results;

  const handleContactFound = (candidateId, data) => {
    setContactCache(prev => ({ ...prev, [candidateId]: data }));
  };

  const handleSelectCandidate = (idx) => {
    setSelectedIndex(idx);
    flyToRef.current?.(shown[idx]);
  };

  const handlePinClick = (idx) => setSelectedIndex(idx);

  const handleFiltered = (filtered) => {
    setDisplayedResults(filtered);
    setSelectedIndex(null);
  };

  const handleSortChange = (newSort) => {
    setSortKey(newSort);
    setDisplayedResults(applyFiltersAndSort(results, DEFAULT_FILTERS, newSort));
  };

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "#0a0e17", fontFamily: "'Rajdhani', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        .font-mono-data { font-family: 'Space Mono', monospace; }
        .font-rajdhani { font-family: 'Rajdhani', sans-serif; }
      `}</style>

      {/* HEADLINE Mapbox GL JS satellite map — full-width, top of page */}
      <div className="w-full h-[300px] md:h-[480px] flex-shrink-0 border-b border-[#1e293b]">
        <HeadlineMapErrorBoundary>
          <HeadlineSatelliteMap
            results={shown}
            searchCenter={searchCenter}
            onCandidateClick={handleSelectCandidate}
          />
        </HeadlineMapErrorBoundary>
      </div>

      {/* Working area — Leaflet map (feature-flagged) + sidebar */}
      <div className="flex flex-col md:flex-row flex-1 min-h-[600px]">
        {FEATURE_LEAFLET_MAP && (
          <div className="w-full md:w-[65%] h-[55vh] md:h-auto md:min-h-[600px] flex-shrink-0">
            <ScanResultsMap
              results={shown}
              searchCenter={searchCenter}
              selectedIndex={selectedIndex}
              onPinClick={handlePinClick}
              flyToRef={flyToRef}
            />
          </div>
        )}

        <div className={`w-full ${FEATURE_LEAFLET_MAP ? "md:w-[35%]" : ""} flex-1 min-h-[600px] overflow-hidden`}>
          <ScanResultsSidebar
            results={shown}
            allResults={results}
            ordinance={ordinance}
            searchCenter={searchCenter}
            searchParams={searchParams}
            selectedIndex={selectedIndex}
            onSelectCandidate={handleSelectCandidate}
            onOpenChat={() => setChatOpen(true)}
            onNewScan={() => navigate("/search")}
            userTier={userTier}
            contactCache={contactCache}
            onContactFound={handleContactFound}
            searchId={searchId}
            usage={usage}
            plan={plan}
            sortKey={sortKey}
            onSortChange={handleSortChange}
            onFiltered={handleFiltered}
            freeTrialUsed={freeTrialUsed}
          />
        </div>
      </div>

      <AIChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        searchId={searchId}
        candidates={results}
        ordinance={ordinance}
      />
    </div>
  );
}