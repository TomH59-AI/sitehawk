import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ScanResultsSidebar from "../components/scan/ScanResultsSidebar";
import ScanResultsMap from "../components/scan/ScanResultsMap";
import HeadlineSatelliteMap from "../components/scan/HeadlineSatelliteMap";
import HeadlineMapErrorBoundary from "../components/scan/HeadlineMapErrorBoundary";
import HeadlineMapSidebar from "../components/scan/HeadlineMapSidebar";
import AIChatPanel from "../components/search/AIChatPanel";
import SiteHawkVerificationMap from "@/components/verification/SiteHawkVerificationMap";
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
  const [contactCache, setContactCache] = useState({});
  const [sortKey, setSortKey] = useState("match_score_desc");
  const [displayedResults, setDisplayedResults] = useState(null);
  const flyToRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUserTier(hasUnlimitedAccess(u) ? "hawkeye_apex" : getEffectiveTier(u));
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

      {/* HEADLINE Mapbox GL JS satellite map + parcel info sidebar */}
      <div className="w-full flex flex-col md:flex-row h-auto md:h-[480px] flex-shrink-0 border-b border-[#1e293b]">
        <div className="flex-1 h-[300px] md:h-full">
          <HeadlineMapErrorBoundary>
            <HeadlineSatelliteMap
              results={shown}
              searchCenter={searchCenter}
              onCandidateClick={handleSelectCandidate}
            />
          </HeadlineMapErrorBoundary>
        </div>
        <HeadlineMapSidebar
          searchCenter={searchCenter}
          candidate={selectedIndex != null ? shown[selectedIndex] : shown?.[0]}
          rank={selectedIndex != null ? selectedIndex + 1 : (shown?.[0] ? 1 : null)}
        />
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
          />
        </div>
      </div>

      {/* VERY BOTTOM — SiteHawk Verification Map for the selected search result */}
      {(() => {
        const selectedSearchResult = selectedIndex != null ? shown[selectedIndex] : shown?.[0];
        if (!selectedSearchResult) return null;
        return (
          <div className="p-4 border-t border-[#1e293b]">
            <SiteHawkVerificationMap
              key={selectedSearchResult.id || `${selectedSearchResult.latitude},${selectedSearchResult.longitude}`}
              targetLat={selectedSearchResult.latitude}
              targetLon={selectedSearchResult.longitude}
              targetLabel={selectedSearchResult.site_name}
              searchRadiusMiles={selectedSearchResult.radius_miles || searchParams?.radius_miles || 0.5}
              parcelGeometry={selectedSearchResult.parcel_geometry}
              candidateSites={(shown || []).map((c) => ({
                lat: c.latitude, lon: c.longitude, score: c.match_score,
                site_name: c.site_name, owner: c.owner_name,
                zoning: c.zoning_classification, parcel_id: c.parcel_id,
              }))}
            />
          </div>
        );
      })()}

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