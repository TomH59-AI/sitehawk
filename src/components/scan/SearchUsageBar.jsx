import { Link } from "react-router-dom";

const NEXT_TIER = {
  hawk_site: "Hawkeyes",
  hawkeyes: "Hawkeye Apex",
};

export default function SearchUsageBar({ usage, plan }) {
  if (!usage) return null;

  const { searches_used_today, daily_search_limit } = usage;
  const limitReached = searches_used_today >= daily_search_limit;
  const pct = Math.min((searches_used_today / daily_search_limit) * 100, 100);
  const nextTier = NEXT_TIER[plan?.id] || "Hawkeye Apex";

  return (
    <div style={{
      background: limitReached ? "#1a0f0a" : "#0f1a1f",
      border: `1px solid ${limitReached ? "#ef444433" : "#00d4ff22"}`,
      borderRadius: 10,
      padding: "10px 14px",
      marginBottom: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 10,
          color: limitReached ? "#f87171" : "#00d4ff",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          {limitReached ? "Daily Limit Reached" : "Target Searches"}
        </span>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 11,
          color: limitReached ? "#f87171" : "#f8fafc",
          fontWeight: 700,
        }}>
          {searches_used_today} of {daily_search_limit} used today
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ background: "#1e293b", borderRadius: 4, height: 5, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: limitReached ? "#ef4444" : pct >= 80 ? "#f59e0b" : "#00d4ff",
          borderRadius: 4,
          transition: "width 0.3s ease",
        }} />
      </div>

      {limitReached && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 11, color: "#94a3b8" }}>
            Upgrade to <span style={{ color: "#f59e0b", fontWeight: 700 }}>{nextTier}</span> for more searches
          </span>
          <Link
            to="/pricing"
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              color: "#f59e0b",
              fontWeight: 700,
              textDecoration: "none",
              border: "1px solid #f59e0b44",
              background: "#f59e0b11",
              padding: "3px 10px",
              borderRadius: 20,
              letterSpacing: "0.05em",
            }}
          >
            Upgrade →
          </Link>
        </div>
      )}
    </div>
  );
}