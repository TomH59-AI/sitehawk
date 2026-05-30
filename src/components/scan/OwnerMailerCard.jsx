import { useState } from "react";
import { sendOwnerMailer } from "@/functions/sendOwnerMailer";

const MAILER_PRICE = "$15";
const BLUE = "#0066FF";
const GOLD = "#FFB800";

// Fallback postcard mailer — shown when skip-trace returned no usable phone.
export default function OwnerMailerCard({ result }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(
    result.mailer_sent
      ? { mode: result.mailer_mode, lob_id: result.mailer_lob_id }
      : null
  );
  const [error, setError] = useState("");

  const handleSend = async () => {
    setSending(true);
    setError("");
    const res = await sendOwnerMailer({
      reviewRecordId: result.id,
      recordType: "SearchResult",
      confirmed: true,
    });
    const data = res.data || {};
    setSending(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    setSent({ mode: data.mode, lob_id: data.lob_id, expected: data.expected_delivery_date });
    setOpen(false);
  };

  if (sent) {
    return (
      <div style={{ marginTop: 8, padding: "8px 11px", borderRadius: 7, background: "#0f1a2b", border: `1px solid ${GOLD}44` }}>
        <span style={{ fontSize: 10, color: GOLD, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
          📬 Mailer sent ✓ {sent.mode === "TEST" ? "(TEST — no real mail)" : ""}
        </span>
        {sent.lob_id && (
          <div style={{ fontSize: 9, color: "#64748b", fontFamily: "'Space Mono', monospace", marginTop: 3 }}>
            {sent.lob_id}{sent.expected ? ` · expected ${sent.expected}` : ""}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ padding: "8px 11px", borderRadius: 7, background: "#1e293b", border: "1px solid #334155" }}>
        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.4, marginBottom: 7 }}>
          📬 No phone found for <b style={{ color: "#f8fafc" }}>{result.owner_name || "this owner"}</b>. Send a postcard to their mailing address — additional fee applies.
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            width: "100%", padding: "7px 10px", borderRadius: 7, cursor: "pointer",
            background: GOLD, border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <span style={{ fontSize: 12 }}>📮</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", fontFamily: "'Space Mono', monospace" }}>
            Send Postcard ({MAILER_PRICE})
          </span>
        </button>
        {error && (
          <div style={{ fontSize: 10, color: "#ef4444", fontFamily: "'Space Mono', monospace", marginTop: 6 }}>{error}</div>
        )}
      </div>

      {open && (
        <div
          onClick={() => !sending && setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#0f1a2b", border: `1px solid ${BLUE}55`, borderRadius: 12, padding: 20, maxWidth: 380, width: "100%", fontFamily: "'Rajdhani', sans-serif" }}
          >
            <h3 style={{ color: "#f8fafc", fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>Confirm Postcard</h3>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
              <div><b style={{ color: "#f8fafc" }}>{result.owner_name || "Property Owner"}</b></div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{result.owner_mailing_address || "No mailing address on file"}</div>
              <div style={{ marginTop: 10 }}>Fee: <b style={{ color: GOLD }}>{MAILER_PRICE}</b></div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>This sends a real postcard via Lob. In TEST mode no real mail is sent.</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => setOpen(false)}
                disabled={sending}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 7, background: "transparent", border: "1px solid #334155", color: "#94a3b8", cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 7, background: GOLD, border: "none", color: "#1a1a1a", fontWeight: 700, cursor: sending ? "default" : "pointer", fontFamily: "'Space Mono', monospace", fontSize: 12 }}
              >
                {sending ? "Sending…" : "Confirm & Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}