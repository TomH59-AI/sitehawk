import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import HawkIcon from "../components/HawkIcon";
import ScanResultsSidebar from "../components/scan/ScanResultsSidebar";
import ScanResultsMap from "../components/scan/ScanResultsMap";
import AIChatPanel from "../components/search/AIChatPanel";

export default function ScanResults() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [userTier, setUserTier] = useState(null);
  const [contactCache, setContactCache] = useState({});
  const flyToRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => setUserTier(u?.tier || "blind"));
  }, []);

  const handleContactFound = (candidateId, data) => {
    setContactCache(prev => ({ ...prev, [candidateId]: data }));
  };

  // If navigated here without state, go back to search
  useEffect(() => {
    if (!state?.results) navigate("/search");
  }, [state, navigate]);

  if (!state?.results) return null;

  const { results, ordinance, searchCenter, searchId } = state;

  const handleSelectCandidate = (idx) => {
    setSelectedIndex(idx);
    flyToRef.current?.(results[idx]);
  };

  const handlePinClick = (idx) => {
    setSelectedIndex(idx);
  };

  return (
    <div
      className="fixed inset-0 flex flex-col md:flex-row overflow-hidden"
      style={{ background: "#0a0e17", fontFamily: "'Rajdhani', sans-serif" }}
    >
      {/* Load fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        .font-mono-data { font-family: 'Space Mono', monospace; }
        .font-rajdhani { font-family: 'Rajdhani', sans-serif; }
      `}</style>

      {/* MAP — 65% wide on desktop, 55% tall on mobile */}
      <div className="w-full md:w-[65%] h-[55vh] md:h-full flex-shrink-0">
        <ScanResultsMap
          results={results}
          searchCenter={searchCenter}
          selectedIndex={selectedIndex}
          onPinClick={handlePinClick}
          flyToRef={flyToRef}
        />
      </div>

      {/* SIDEBAR — 35% wide on desktop, 45% tall on mobile */}
      <div className="w-full md:w-[35%] h-[45vh] md:h-full flex-shrink-0 overflow-hidden">
        <ScanResultsSidebar
          results={results}
          ordinance={ordinance}
          searchCenter={searchCenter}
          selectedIndex={selectedIndex}
          onSelectCandidate={handleSelectCandidate}
          onOpenChat={() => setChatOpen(true)}
          onNewScan={() => navigate("/search")}
          userTier={userTier}
          contactCache={contactCache}
          onContactFound={handleContactFound}
          searchId={searchId}
        />
      </div>

      {/* AI Chat Panel */}
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