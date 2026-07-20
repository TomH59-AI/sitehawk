// One AnthemNet SCIP section table — dark header bar, label/value rows.
// Blank values render as an empty fill-in cell so the printed form stays usable.
export default function AnthemNetTable({ title, rows }) {
  return (
    <table className="w-full" style={{ borderCollapse: "collapse", fontSize: "9pt", marginBottom: 10 }}>
      <thead>
        <tr>
          <th
            colSpan={2}
            className="text-left"
            style={{
              padding: "6px 8px", color: "#fff", background: "#111827",
              border: "1px solid #cbd5e1", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.05em", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
            }}
          >
            {title}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ padding: "5px 8px", width: "42%", color: "#111827", fontWeight: 600, border: "1px solid #cbd5e1", verticalAlign: "top", background: "#f8fafc" }}>
              {label}
            </td>
            <td style={{ padding: "5px 8px", color: value ? "#111827" : "#94a3b8", border: "1px solid #cbd5e1", verticalAlign: "top" }}>
              {value || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}