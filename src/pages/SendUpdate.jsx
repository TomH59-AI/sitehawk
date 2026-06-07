import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { sendUpdateNotify } from "@/functions/sendUpdateNotify";
import { notifyAdmin } from "@/functions/notifyAdmin";
import HawkIcon from "../components/HawkIcon";

const ADMIN_EMAIL = "hodges.thomas@gmail.com";
const SITEHAWK_INBOX = "tomhodges@onairs.org";

const PAID_TIERS = ["hawk_site", "hawkeyes", "hawkeye_apex"];

const TIER_OPTIONS = [
  { label: "All paid subscribers", value: null },
  { label: "Hawk Site only", value: "hawk_site" },
  { label: "Hawkeyes only", value: "hawkeyes" },
  { label: "Hawkeye Apex only", value: "hawkeye_apex" },
];

export default function SendUpdate() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tierFilter, setTierFilter] = useState(null);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [result, setResult] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    async function init() {
      const me = await base44.auth.me();
      if (!me || (me.email !== ADMIN_EMAIL && me.role !== "admin")) { navigate("/dashboard"); return; }
      setUser(me);

      // Count paid subscribers
      const allUsers = await base44.entities.User.list();
      const paid = allUsers.filter(u => PAID_TIERS.includes(u.tier));
      setSubscriberCount(paid.length);
    }
    init();
  }, []);

  const callNotify = async (testOnly) => {
    const payload = {
      subject,
      body,
      test_only: testOnly,
      ...(testOnly ? {} : { tier_filter: tierFilter }),
    };
    const res = await sendUpdateNotify(payload);
    return res.data;
  };

  const handleTestSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    setTestSending(true);
    setResult(null);
    // Send a branded SiteHawk test email straight to the SiteHawk inbox.
    const res = await notifyAdmin({ subject, body, from_label: "SiteHawk" });
    setResult({ ...(res.data || {}), isTest: true });
    setTestSending(false);
  };

  const handleSendAll = async () => {
    setShowConfirm(false);
    setSending(true);
    setResult(null);
    const data = await callNotify(false);
    setResult({ ...data, isTest: false });
    setSending(false);
  };

  const filteredCount = tierFilter
    ? (tierFilter === "monthly" ? subscriberCount : subscriberCount)
    : subscriberCount;

  if (!user) return null;

  return (
    <div style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');`}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.18em", color: "#00d4ff", fontFamily: "'Space Mono', monospace", textTransform: "uppercase" }}>Admin Only</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#f8fafc", margin: 0, letterSpacing: "0.02em" }}>Send Update</h1>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 4, fontFamily: "'Space Mono', monospace" }}>
          Broadcast to {subscriberCount} paid subscriber{subscriberCount !== 1 ? "s" : ""}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
        {/* Left: Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Subject */}
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Interactive parcel maps are live"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8, boxSizing: "border-box",
                background: "#111827", border: "1px solid #1e293b", color: "#f8fafc",
                fontSize: 14, fontFamily: "'Rajdhani', sans-serif", outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = "#00d4ff55"}
              onBlur={e => e.target.style.borderColor = "#1e293b"}
            />
          </div>

          {/* Body */}
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Your scan results now show candidates on satellite imagery with scored pins. Click a card, fly to the parcel."
              rows={6}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8, boxSizing: "border-box",
                background: "#111827", border: "1px solid #1e293b", color: "#f8fafc",
                fontSize: 13, fontFamily: "'Rajdhani', sans-serif", outline: "none", resize: "vertical",
                lineHeight: 1.6, transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = "#00d4ff55"}
              onBlur={e => e.target.style.borderColor = "#1e293b"}
            />
          </div>

          {/* Tier filter */}
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>Audience</label>
            <select
              value={tierFilter ?? ""}
              onChange={e => setTierFilter(e.target.value || null)}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8, boxSizing: "border-box",
                background: "#111827", border: "1px solid #1e293b", color: "#f8fafc",
                fontSize: 13, fontFamily: "'Rajdhani', sans-serif", outline: "none", cursor: "pointer",
              }}
            >
              {TIER_OPTIONS.map(opt => (
                <option key={opt.label} value={opt.value ?? ""}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              onClick={handleTestSend}
              disabled={testSending || !subject.trim() || !body.trim()}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 8, cursor: "pointer",
                background: "transparent", border: "1px solid #334155",
                color: testSending ? "#00d4ff" : "#94a3b8",
                fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700,
                letterSpacing: "0.06em", transition: "all 0.15s",
                opacity: (!subject.trim() || !body.trim()) ? 0.4 : 1,
              }}
            >
              {testSending ? "Sending..." : "🧪 Test Send"}
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={sending || !subject.trim() || !body.trim()}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 8, cursor: "pointer",
                background: "#00d4ff22", border: "1px solid #00d4ff44",
                color: "#00d4ff",
                fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700,
                letterSpacing: "0.06em", transition: "all 0.15s",
                opacity: (!subject.trim() || !body.trim()) ? 0.4 : 1,
              }}
            >
              {sending ? "Sending..." : "📡 Send to All"}
            </button>
          </div>

          {/* Result panel */}
          {result && (
            <div style={{
              padding: "14px 16px", borderRadius: 8,
              background: result.error ? "#2d1212" : "#0f2d1a",
              border: `1px solid ${result.error ? "#7f1d1d" : "#166534"}`,
            }}>
              {result.error ? (
                <p style={{ color: "#f87171", fontFamily: "'Space Mono', monospace", fontSize: 11, margin: 0 }}>
                  ✗ {result.error}
                </p>
              ) : (
                <>
                  <p style={{ color: "#22c55e", fontFamily: "'Space Mono', monospace", fontSize: 11, margin: "0 0 6px 0", fontWeight: 700 }}>
                    {result.isTest ? `✓ Branded test email sent to ${SITEHAWK_INBOX}` : "✓ Broadcast complete"}
                  </p>
                  {!result.isTest && (
                    <div style={{ display: "flex", gap: 20 }}>
                      {result.sent != null && <Stat label="Sent" value={result.sent} color="#22c55e" />}
                      {result.failed != null && <Stat label="Failed" value={result.failed} color="#f87171" />}
                      {result.total != null && <Stat label="Total" value={result.total} color="#94a3b8" />}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: Live Preview */}
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Space Mono', monospace", marginBottom: 10 }}>Live Preview</label>
          <div style={{
            background: "#0a0e17", border: "1px solid #1e293b", borderRadius: 12,
            overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}>
            {/* Email header */}
            <div style={{ background: "#111827", padding: "20px 24px", borderBottom: "1px solid #1e293b", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                <HawkIcon size={48} />
              </div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 18, color: "#f8fafc", letterSpacing: "0.2em" }}>SITEHAWK</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#00d4ff", letterSpacing: "0.2em", marginTop: 3 }}>WE GOT OUR EYES ON YOU</div>
            </div>
            {/* Email body */}
            <div style={{ padding: "24px", minHeight: 120 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc", marginBottom: 12, fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.3 }}>
                {subject || <span style={{ color: "#334155" }}>Your subject line will appear here</span>}
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, fontFamily: "'Rajdhani', sans-serif", whiteSpace: "pre-wrap" }}>
                {body || <span style={{ color: "#1e293b" }}>Your message will appear here...</span>}
              </div>
            </div>
            {/* Email footer */}
            <div style={{ background: "#111827", borderTop: "1px solid #1e293b", padding: "14px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#334155", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                POWERED BY SKYWAVE AI · UNSUBSCRIBE
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            style={{
              background: "#111827", border: "1px solid #1e293b", borderRadius: 12,
              padding: "28px 32px", maxWidth: 380, width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc", marginBottom: 8, fontFamily: "'Rajdhani', sans-serif" }}>
              Confirm Broadcast
            </div>
            <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 20, fontFamily: "'Rajdhani', sans-serif" }}>
              Send this update to <span style={{ color: "#00d4ff", fontWeight: 700 }}>{subscriberCount} subscriber{subscriberCount !== 1 ? "s" : ""}</span>?
              This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer",
                  background: "transparent", border: "1px solid #334155",
                  color: "#94a3b8", fontFamily: "'Space Mono', monospace", fontSize: 11,
                }}
              >Cancel</button>
              <button
                onClick={handleSendAll}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer",
                  background: "#00d4ff22", border: "1px solid #00d4ff",
                  color: "#00d4ff", fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700,
                }}
              >Send Now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#475569", fontFamily: "'Space Mono', monospace", letterSpacing: "0.08em" }}>{label.toUpperCase()}</div>
    </div>
  );
}