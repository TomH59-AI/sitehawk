function scoreColor(score) {
  if (score >= 75) return "#22c55e";
  if (score >= 60) return "#00d4ff";
  return "#f59e0b";
}

export default function CandidateCard({ result, rank, isSelected }) {
  const color = scoreColor(result.match_score);

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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Rank badge */}
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
        {/* Score */}
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
        {result.zoning_classification && (
          <Tag label={result.zoning_classification} color="#00d4ff" />
        )}
        {result.fema_risk_factor && (
          <Tag label={`FEMA: ${result.fema_risk_factor}`} color={result.fema_risk_factor?.toLowerCase().includes("x") ? "#22c55e" : "#f59e0b"} />
        )}
        {result.parcel_size_acres && (
          <Tag label={`${result.parcel_size_acres} ac`} color="#94a3b8" />
        )}
        {result.airport_iata && (
          <Tag label={`✈ ${result.airport_iata} ${result.airport_distance_miles ? result.airport_distance_miles.toFixed(1) + "mi" : ""}`} color="#818cf8" />
        )}
      </div>

      {/* Match reason */}
      {result.match_reason && (
        <div style={{
          marginTop: 8, paddingTop: 7, borderTop: "1px solid #1e293b",
          fontSize: 10, color: "#475569", lineHeight: 1.5, fontFamily: "'Rajdhani', sans-serif"
        }}>
          {result.match_reason}
        </div>
      )}
    </div>
  );
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