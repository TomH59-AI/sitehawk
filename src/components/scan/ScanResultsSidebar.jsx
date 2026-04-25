import { useEffect, useRef } from "react";
import CandidateCard from "./CandidateCard";
import HawkIcon from "../HawkIcon";
import DirectMailButton from "../search/DirectMailButton";
import PDFReportButton from "../search/PDFReportButton";
import SearchUsageBar from "./SearchUsageBar";
import BatchSkipTrace from "../search/BatchSkipTrace";
import ResultsFilterSort from "./ResultsFilterSort";
import FreeTrialUpsellBanner from "./FreeTrialUpsellBanner";
import TelecomOrdinanceSummary from "./TelecomOrdinanceSummary";

export default function ScanResultsSidebar({
  results,
  allResults,
  ordinance,
  searchCenter,
  selectedIndex,
  onSelectCandidate,
  onOpenChat,
  onNewScan,
  userTier,
  contactCache,
  onContactFound,
  searchId,
  usage,
  plan,
  sortKey,
  onSortChange,
  onFiltered,
  freeTrialUsed,
}) {
  const cardRefs = useRef([]);
  const scrollRef = useRef(null);

  // Auto-scroll to selected card
  useEffect(() => {
    if (selectedIndex !== null && cardRefs.current[selectedIndex]) {
      cardRefs.current[selectedIndex].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedIndex]);

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "#0a0e17", borderLeft: "1px solid #1e293b", fontFamily: "'Rajdhani', sans-serif" }}
    >
      {/* Header */}
      <div style={{ background: "#111827", borderBottom: "1px solid #1e293b", padding: "14px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HawkIcon size={28} />
            <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 16, letterSpacing: "0.03em" }}>SiteHawk Results</span>
          </div>
          <span style={{
            background: "#00d4ff22", color: "#00d4ff", border: "1px solid #00d4ff44",
            fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
            letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'Space Mono', monospace"
          }}>Scan Complete</span>
        </div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#64748b" }}>
          {searchCenter.lat.toFixed(5)}, {searchCenter.lon.toFixed(5)}
          {ordinance?.jurisdiction && (
            <span style={{ color: "#94a3b8", marginLeft: 8 }}>· {ordinance.jurisdiction}</span>
          )}
        </div>
        {ordinance && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
            {ordinance.ldc_display ? (
              <span style={{
                background: "#06b6d415", border: "1px solid #06b6d433",
                color: "#22d3ee", fontSize: 10, fontWeight: 700,
                padding: "2px 8px", borderRadius: 6,
                letterSpacing: "0.05em", fontFamily: "'Space Mono', monospace"
              }}>LDC {ordinance.ldc_display}</span>
            ) : (
              <span style={{ color: "#475569", fontSize: 10, fontStyle: "italic", fontFamily: "'Space Mono', monospace" }}>LDC Ref Pending</span>
            )}
            {ordinance.height_limit_ft && (
              <Tag label={`↕ ${ordinance.height_limit_ft}ft max`} />
            )}
            {ordinance.permit_type && (
              <Tag label={`📋 ${ordinance.permit_type}`} />
            )}
            {ordinance.collocation_required && (
              <Tag label="Collocate req." color="#f59e0b" />
            )}
            {ordinance.stealth_required && (
              <Tag label="Stealth req." color="#f59e0b" />
            )}
          </div>
        )}
        {ordinance && <TelecomOrdinanceSummary ordinance={ordinance} />}
      </div>

      {/* Filter & Sort */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #1e293b", flexShrink: 0 }}>
        <ResultsFilterSort
          results={allResults || results}
          onFiltered={onFiltered}
          currentSort={sortKey || "match_score_desc"}
          onSortChange={onSortChange}
        />
      </div>

      {/* Candidate list */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", scrollbarWidth: "thin", scrollbarColor: "#1e293b #0a0e17" }}>
        <FreeTrialUpsellBanner userTier={userTier} freeTrialUsed={freeTrialUsed} />
        {results.map((result, idx) => (
          <div
            key={result.id || idx}
            ref={(el) => (cardRefs.current[idx] = el)}
            onClick={() => onSelectCandidate(idx)}
          >
            <CandidateCard
              result={result}
              rank={idx + 1}
              isSelected={selectedIndex === idx}
              userTier={userTier}
              contactCache={contactCache}
              onContactFound={onContactFound}
            />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        background: "#111827", borderTop: "1px solid #1e293b",
        padding: "12px 16px", flexShrink: 0,
        display: "flex", flexDirection: "column", gap: 8
      }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onOpenChat}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 8,
              background: "#00d4ff22", border: "1px solid #00d4ff44",
              color: "#00d4ff", fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              transition: "background 0.15s"
            }}
            onMouseOver={e => e.currentTarget.style.background = "#00d4ff33"}
            onMouseOut={e => e.currentTarget.style.background = "#00d4ff22"}
          >
            <HawkIcon size={18} />
            Ask Double Vision
          </button>
          <button
            onClick={onNewScan}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 8,
              background: "#1e293b", border: "1px solid #334155",
              color: "#94a3b8", fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              transition: "background 0.15s"
            }}
            onMouseOver={e => e.currentTarget.style.background = "#334155"}
            onMouseOut={e => e.currentTarget.style.background = "#1e293b"}
          >
            + New Scan
          </button>
        </div>

        {/* Usage indicator */}
        <SearchUsageBar usage={usage} plan={plan} />

        {/* Batch skip trace */}
        {(allResults || results)?.length > 0 && (
          <BatchSkipTrace candidates={allResults || results} />
        )}

        {/* PDF Download */}
        <PDFReportButton
          results={results}
          extraResults={[]}
          ordinance={ordinance}
          searchCenter={searchCenter}
          mapImageGetterRef={null}
          skipTraceResults={{}}
        />

        {/* Direct Mail — for selected candidate if it has a mailing address */}
        {results[selectedIndex]?.owner_mailing_address && (
          <DirectMailButton
            candidate={results[selectedIndex]}
            searchId={searchId}
          />
        )}
        <div style={{ textAlign: "center", fontSize: 9, color: "#334155", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "'Space Mono', monospace" }}>
          Powered by SkyWave AI
        </div>
      </div>
    </div>
  );
}

function Tag({ label, color = "#00d4ff" }) {
  return (
    <span style={{
      background: color + "15", border: `1px solid ${color}33`,
      color, fontSize: 9, fontWeight: 600, padding: "1px 7px", borderRadius: 12,
      letterSpacing: "0.05em", fontFamily: "'Rajdhani', sans-serif"
    }}>{label}</span>
  );
}