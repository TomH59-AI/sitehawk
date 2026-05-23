import { useEffect, useState } from "react";
import { Loader2, MapPin, Phone, Mail, FileText, DollarSign, Clock, RefreshCw } from "lucide-react";
import { notionZoningLookup } from "@/functions/notionZoningLookup";

/**
 * ZoningSummaryCard — pulls jurisdiction, zoning district, and planning
 * contact details DIRECTLY from notionZoningLookup based on the search
 * center coordinates. No reliance on the old SCIP service.
 *
 * Drops into the parcel analysis sidebar.
 */
export default function ZoningSummaryCard({ searchCenter, candidate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const lat = candidate?.latitude ?? searchCenter?.lat;
  const lon = candidate?.longitude ?? searchCenter?.lon;

  async function load() {
    if (!isFinite(lat) || !isFinite(lon)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await notionZoningLookup({ lat, lon });
      const d = res?.data || res;
      setData(d);
      if (!d?.zoning && d?.notion_error) setError(d.notion_error);
    } catch (e) {
      setError(e.message || "Zoning lookup failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  const z = data?.zoning;
  const district = candidate?.zoning_classification || z?.property_zoning_district || "—";
  const jurisdiction = z?.jurisdiction || data?.geocode?.city || data?.geocode?.county || "—";

  return (
    <div style={{
      background: "#111827", border: "1px solid #1e293b", borderRadius: 8,
      padding: "10px 12px", marginBottom: 10, fontFamily: "'Rajdhani', sans-serif"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: "#00d4ff", fontFamily: "'Space Mono', monospace", fontWeight: 700, letterSpacing: "0.1em" }}>
          🏛️ ZONING & PLANNING CONTACT
        </div>
        <button
          onClick={load}
          disabled={loading}
          title="Refresh zoning data"
          style={{
            background: "transparent", border: "1px solid #334155",
            borderRadius: 6, padding: "2px 6px", cursor: loading ? "wait" : "pointer",
            color: "#94a3b8", display: "flex", alignItems: "center", gap: 4,
            fontSize: 10, fontFamily: "'Space Mono', monospace"
          }}
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        </button>
      </div>

      {error && !loading && (
        <div style={{ fontSize: 11, color: "#f87171", marginBottom: 6 }}>{error}</div>
      )}

      <Row icon={<MapPin size={12} />} label="Jurisdiction" value={jurisdiction} />
      <Row icon={<FileText size={12} />} label="Zoning District" value={district} highlight />
      <Row icon={<FileText size={12} />} label="Future Land Use" value={z?.property_future_land_use} />
      <Row icon={<Phone size={12} />} label="Planning Contact" value={z?.zoning_contact} multiline />
      <Row icon={<FileText size={12} />} label="Process" value={z?.zoning_process} multiline />
      <Row icon={<DollarSign size={12} />} label="Fees" value={z?.zoning_fees} />
      <Row icon={<Clock size={12} />} label="Approval Timeframe" value={z?.zoning_approval_timeframe} />

      {z?.source_url && (
        <a
          href={z.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6,
            fontSize: 10, color: "#22d3ee", fontFamily: "'Space Mono', monospace",
            textDecoration: "none", letterSpacing: "0.05em"
          }}
        >
          <Mail size={10} /> View ordinance source →
        </a>
      )}

      {loading && !data && (
        <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <Loader2 size={11} className="animate-spin" /> Looking up jurisdiction…
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, value, multiline, highlight }) {
  const hasValue = value && String(value).trim();
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "16px 110px 1fr",
      gap: 6, padding: "3px 0", alignItems: multiline ? "flex-start" : "center",
      borderBottom: "1px dashed #1e293b"
    }}>
      <span style={{ color: "#64748b", marginTop: multiline ? 2 : 0 }}>{icon}</span>
      <span style={{ color: "#94a3b8", fontSize: 10, fontFamily: "'Space Mono', monospace", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span style={{
        color: hasValue ? (highlight ? "#22d3ee" : "#f8fafc") : "#475569",
        fontSize: 11, fontWeight: highlight ? 700 : 500,
        whiteSpace: multiline ? "pre-wrap" : "nowrap",
        overflow: multiline ? "visible" : "hidden",
        textOverflow: "ellipsis",
        fontStyle: hasValue ? "normal" : "italic"
      }}>
        {hasValue ? value : "—"}
      </span>
    </div>
  );
}