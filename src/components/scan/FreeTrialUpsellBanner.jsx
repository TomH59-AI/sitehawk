import { Link } from "react-router-dom";
import { Zap, X } from "lucide-react";
import { useState } from "react";

export default function FreeTrialUpsellBanner({ userTier, freeTrialUsed }) {
  const [dismissed, setDismissed] = useState(false);

  // Only show for free/blind users who just used their trial
  if (dismissed || !freeTrialUsed || (userTier !== "blind" && userTier !== "free")) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #1e3a5f 0%, #0f2444 100%)",
      border: "1px solid #00d4ff44",
      borderRadius: 10,
      padding: "14px 16px",
      marginBottom: 12,
      position: "relative",
    }}>
      <button
        onClick={() => setDismissed(true)}
        style={{
          position: "absolute", top: 10, right: 10,
          background: "none", border: "none", cursor: "pointer", color: "#64748b",
          padding: 2,
        }}
      >
        <X size={14} />
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: "#00d4ff22", border: "1px solid #00d4ff44",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Zap size={16} color="#00d4ff" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
            color: "#f8fafc", fontSize: 14, marginBottom: 3,
          }}>
            You just used your free trial scan 🎉
          </p>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif", color: "#94a3b8",
            fontSize: 12, lineHeight: 1.5, marginBottom: 10,
          }}>
            Like what you see? Subscribe to unlock unlimited scans, skip traces, AI chat, and full parcel reports.
          </p>
          <Link
            to="/pricing"
            style={{
              display: "inline-block",
              background: "#2563eb", color: "#fff",
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              fontSize: 12, padding: "6px 14px", borderRadius: 7,
              textDecoration: "none", letterSpacing: "0.03em",
            }}
          >
            View Plans →
          </Link>
        </div>
      </div>
    </div>
  );
}