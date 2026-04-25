export default function TelecomOrdinanceSummary({ ordinance }) {
  const sections = ordinance?.telecom_sections || [];
  if (!ordinance) return null;

  return (
    <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "#0d1829", border: "1px solid #00d4ff33" }}>
      <div style={{ color: "#00d4ff", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", fontFamily: "'Space Mono', monospace", marginBottom: 5 }}>
        TELECOM ORDINANCE
      </div>
      {sections.length > 0 ? sections.slice(0, 3).map((section, i) => (
        <div key={i} style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.45, marginTop: i ? 5 : 0 }}>
          <span style={{ color: "#f8fafc", fontWeight: 700 }}>{section.section_ref || "Section"}</span>
          {section.section_title ? ` — ${section.section_title}` : ""}
        </div>
      )) : (
        <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.45 }}>
          {ordinance.extraction_notes || "No verified telecom tower/antenna clauses found yet."}
        </div>
      )}
    </div>
  );
}