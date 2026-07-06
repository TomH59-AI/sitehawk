import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { skipTrace } from "@/functions/skipTrace";
import RFCoveragePanel from "./RFCoveragePanel";
import OwnerMailerCard from "./OwnerMailerCard";
import SiteShowcaseSection from "./SiteShowcaseSection";

const PAID_TIERS = ["hawk_site", "hawkeyes", "hawk_sight", "hawkeye_20", "hawkeye_apex"];

function scoreColor(score) {
  if (score >= 75) return "#22c55e";
  if (score >= 60) return "#00d4ff";
  return "#f59e0b";
}

function Tag({ label, color }) {
  return (
    <span style={{
      background: color + "18", border: `1px solid ${color}33`,
      color, fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
      letterSpacing: "0.04em", fontFamily: "'Space Mono', monospace",
    }}>{label}</span>
  );
}

function ContactSection({ contact }) {
  const hasPhone = contact.phone && contact.phone.trim();
  const hasEmail = contact.email && contact.email.trim();
  const hasNeither = !hasPhone && !hasEmail;

  if (hasNeither) {
    return (
      <div style={{
        marginTop: 8, padding: "8px 10px", borderRadius: 7,
        background: "#1e293b", border: "1px solid #334155",
        display: "flex", alignItems: "center", gap: 7,
      }}>
        <span style={{ fontSize: 14 }}>🔍</span>
        <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'Space Mono', monospace", lineHeight: 1.4 }}>
          Contact info not available — try public records
        </span>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 8, padding: "9px 11px", borderRadius: 7,
      background: "#0f1a2b", border: "1px solid #00d4ff33",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{
          background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44",
          fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
          letterSpacing: "0.06em", fontFamily: "'Space Mono', monospace"
        }}>✓ Contact Found</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <span style={{ color: "#475569", fontFamily: "'Space Mono', monospace", fontSize: 10, minWidth: 16 }}>📞</span>
          {hasPhone
            ? <a href={`tel:${contact.phone}`} style={{ color: "#00d4ff", fontFamily: "'Space Mono', monospace", fontSize: 11, textDecoration: "none", fontWeight: 700 }}
                onMouseOver={e => e.currentTarget.style.textDecoration = "underline"}
                onMouseOut={e => e.currentTarget.style.textDecoration = "none"}
              >{contact.phone}</a>
            : <span style={{ color: "#475569", fontFamily: "'Space Mono', monospace", fontSize: 10, fontStyle: "italic" }}>Not available</span>
          }
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <span style={{ color: "#475569", fontFamily: "'Space Mono', monospace", fontSize: 10, minWidth: 16 }}>✉</span>
          {hasEmail
            ? <a href={`mailto:${contact.email}`} style={{ color: "#00d4ff", fontFamily: "'Space Mono', monospace", fontSize: 11, textDecoration: "none", fontWeight: 700, wordBreak: "break-all" }}
                onMouseOver={e => e.currentTarget.style.textDecoration = "underline"}
                onMouseOut={e => e.currentTarget.style.textDecoration = "none"}
              >{contact.email}</a>
            : <span style={{ color: "#475569", fontFamily: "'Space Mono', monospace", fontSize: 10, fontStyle: "italic" }}>Not available</span>
          }
        </div>
      </div>
    </div>
  );
}

export default function CandidateCard({ result, rank, isSelected, userTier, contactCache, onContactFound, ordinance, searchCenter, searchParams }) {
  const navigate = useNavigate();
  const color = scoreColor(result.match_score);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showRFCoverage, setShowRFCoverage] = useState(false);
  const isPaid = PAID_TIERS.includes(userTier);
  const cachedContact = contactCache?.[result.id];

  const handleViewSCIP = (e) => {
    e.stopPropagation();
    navigate("/scip", { state: { candidate: result, ordinance, searchCenter, searchParams } });
  };

  const handleGetContact = async (e) => {
    e.stopPropagation();
    if (loading || cachedContact) return;
    setLoading(true);
    const res = await skipTrace({
      owner_name: result.owner_name,
      mailing_address: result.owner_mailing_address,
      candidate_id: result.id,
    });
    const data = res.data || {};
    onContactFound(result.id, { phone: data.phone || null, email: data.email || null });
    setLoading(false);
  };

  return (
    <div
      style={{
        background: isSelected ? "#1e293b" : "#111827",
        border: `1px solid ${isSelected ? color + "66" : "#1e293b"}`,
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 8,
        cursor: "pointer",
        transition: "all 0.15s",
        boxShadow: isSelected ? `0 0 12px ${color}22` : "none",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%",
            background: "#0a0e17", border: `2px solid ${color}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, color,
            flexShrink: 0,
          }}>{rank}</div>
          <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 14, fontFamily: "'Rajdhani', sans-serif" }}>
            {result.site_name || `Candidate ${rank}`}
          </span>
        </div>
        <span style={{
          background: color + "22", color, border: `1px solid ${color}44`,
          fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700,
          padding: "1px 8px", borderRadius: 20, flexShrink: 0,
        }}>{result.match_score}%</span>
      </div>

      {/* Owner */}
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 3, fontFamily: "'Rajdhani', sans-serif" }}>
        {result.owner_name || "—"}
      </div>

      {/* Address */}
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 7, fontFamily: "'Rajdhani', sans-serif" }}>
        {result.parcel_address || "—"}
      </div>

      {/* Tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {result.zoning_classification && <Tag label={result.zoning_classification} color="#00d4ff" />}
        {result.fema_risk_factor && (
          <Tag
            label={`FEMA: ${result.fema_risk_factor}${result.fema_sfha ? " ⚠ SFHA" : ""}`}
            color={result.fema_risk_level === "high" ? "#ef4444" : result.fema_risk_level === "minimal" ? "#22c55e" : "#f59e0b"}
          />
        )}
        {result.parcel_size_acres && <Tag label={`${result.parcel_size_acres} ac`} color="#94a3b8" />}
        {result.airport_iata && (
          <Tag label={`✈ ${result.airport_iata} ${result.airport_distance_miles ? result.airport_distance_miles.toFixed(1) + "mi" : ""}`} color="#818cf8" />
        )}
        {result.has_fiber === true && (
          <Tag label="⚡ Fiber Present" color="#22c55e" />
        )}
        {result.has_fiber === false && (
          <Tag label="No Fiber" color="#64748b" />
        )}
        {result.has_fiber === null && result.fcc_block_geoid && (
          <Tag label="Fiber Unknown" color="#64748b" />
        )}
        {result.fiber_distance_miles != null && (
          <Tag
            label={`Fiber/Telecom: ${result.fiber_distance_miles} mi${result.fiber_operator ? ` · ${result.fiber_operator}` : ""}`}
            color="#22c55e"
          />
        )}
        {result.power_utility && (
          <Tag label={`🔌 ${result.power_utility}`} color="#f59e0b" />
        )}
        {result.transmission_line_distance_miles != null && (
          <Tag
            label={`⚡ TX Line: ${result.transmission_line_distance_miles} mi${result.transmission_line_voltage ? ` · ${result.transmission_line_voltage}` : ""}`}
            color={result.transmission_line_distance_miles <= 1 ? "#22c55e" : result.transmission_line_distance_miles <= 3 ? "#f59e0b" : "#64748b"}
          />
        )}
        {result.wetlands_present === true && (
          <Tag
            label={`🌿 Wetlands${result.wetland_proximity === "on-site" ? " ON SITE" : " Adjacent"}${result.wetland_types?.length ? ` · ${result.wetland_types[0]}` : ""}`}
            color={result.wetland_proximity === "on-site" ? "#ef4444" : "#f59e0b"}
          />
        )}
        {result.wetlands_present === false && (
          <Tag label="✓ No Wetlands (NWI)" color="#22c55e" />
        )}
        {result.wind_speed_mph && (
          <Tag
            label={`💨 Wind: ${result.wind_speed_mph} mph${result.in_hurricane_prone_region ? " ⚠ Hurricane" : ""}${result.in_special_wind_region ? " ⚠ Special" : ""}`}
            color={result.wind_risk_level === "extreme" ? "#ef4444" : result.wind_risk_level === "high" ? "#f59e0b" : result.wind_risk_level === "moderate" ? "#f59e0b" : "#22c55e"}
          />
        )}
      </div>

      {/* Fiber providers detail */}
      {result.fiber_providers && result.fiber_providers.length > 0 && (
        <div style={{
          marginTop: 8, padding: "8px 10px", borderRadius: 7,
          background: "#22c55e0f", border: "1px solid #22c55e22",
        }}>
          <div style={{ fontSize: 9, color: "#22c55e", fontFamily: "'Space Mono', monospace", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>
            FCC FIBER PROVIDERS
          </div>
          {result.fiber_providers.map((fp, i) => (
            <div key={i} style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.6 }}>
              <span style={{ color: "#f8fafc", fontWeight: 600 }}>{fp.provider_name}</span>
              <span style={{ color: "#475569" }}> · {fp.technology}</span>
              {fp.max_download_speed > 0 && (
                <span style={{ color: "#475569" }}> · {fp.max_download_speed} Mbps↓</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Match reason */}
      {result.match_reason && (
        <div style={{
          marginTop: 8, paddingTop: 7, borderTop: "1px solid #1e293b",
          fontSize: 10, color: "#475569", lineHeight: 1.5, fontFamily: "'Rajdhani', sans-serif"
        }}>
          {result.match_reason}
        </div>
      )}

      {/* ── RF Coverage Button ── */}
      {result.latitude && result.longitude && (
        <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowRFCoverage(true)}
            style={{
              width: "100%", padding: "7px 10px", borderRadius: 7, cursor: "pointer",
              background: "#0d1829",
              border: "1px solid #22c55e33",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#22c55e88"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#22c55e33"}
          >
            <span style={{ fontSize: 12 }}>📡</span>
            <span style={{ fontSize: 11, color: "#22c55e", fontFamily: "'Space Mono', monospace" }}>
              RF Coverage Heatmap
            </span>
          </button>
        </div>
      )}

      {/* SCIP is generated once per scan for the BEST candidate (see sidebar header).
          Per-card SCIP button removed to avoid generating 3 SCIPs. */}

      {/* ── Get Owner Contact ── */}
      <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
        {cachedContact ? (
          <>
            <ContactSection contact={cachedContact} />
            {!(cachedContact.phone && cachedContact.phone.trim()) && (
              <OwnerMailerCard result={result} />
            )}
          </>
        ) : !isPaid ? (
          <Link
            to="/pricing"
            style={{ display: "block", textDecoration: "none" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              padding: "7px 10px", borderRadius: 7, cursor: "pointer",
              background: "#1e293b", border: "1px solid #334155",
              display: "flex", alignItems: "center", gap: 7, opacity: 0.7,
            }}>
              <span style={{ fontSize: 12 }}>🔒</span>
              <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'Space Mono', monospace" }}>
                Upgrade to unlock
              </span>
            </div>
          </Link>
        ) : (
          <button
            onClick={handleGetContact}
            disabled={loading}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              width: "100%", padding: "7px 10px", borderRadius: 7, cursor: loading ? "default" : "pointer",
              background: "transparent",
              border: `1px solid ${hovered && !loading ? "#00d4ff" : "#1e293b"}`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              transition: "border-color 0.15s, color 0.15s",
            }}
          >
            {loading ? (
              <>
                <span style={{
                  display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                  background: "#00d4ff",
                  animation: "contactPulse 1s ease-in-out infinite",
                }} />
                <span style={{ fontSize: 11, color: "#00d4ff", fontFamily: "'Space Mono', monospace" }}>Searching...</span>
                <style>{`@keyframes contactPulse { 0%,100%{opacity:0.3;transform:scale(0.85)} 50%{opacity:1;transform:scale(1.15)} }`}</style>
              </>
            ) : (
              <>
                <span style={{ fontSize: 12 }}>📞</span>
                <span style={{
                  fontSize: 11, fontFamily: "'Space Mono', monospace",
                  color: hovered ? "#00d4ff" : "#94a3b8",
                  transition: "color 0.15s",
                }}>Get Owner Contact</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Site Showcase */}
      <SiteShowcaseSection candidate={result} />

      {/* RF Coverage Modal */}
      {showRFCoverage && (
        <RFCoveragePanel
          candidate={result}
          onClose={() => setShowRFCoverage(false)}
        />
      )}

    </div>
  );
}