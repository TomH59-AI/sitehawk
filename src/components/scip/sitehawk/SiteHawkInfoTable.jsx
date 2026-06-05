import { HAWK } from "../hawkScipBrand";

const EXACT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

// A simple two-column label/value table block with a navy sub-header bar.
// `rows` = [[label, value], ...]. Empty values render as a blank underline cell.
export default function SiteHawkInfoTable({ heading, rows = [] }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {heading && (
        <div className="flex items-stretch rounded overflow-hidden mb-2" style={EXACT}>
          <div style={{ width: 6, background: HAWK.gold }} />
          <div className="flex-1 px-3 py-1 text-white text-[10pt] font-bold uppercase tracking-wide" style={{ background: HAWK.navy }}>
            {heading}
          </div>
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${HAWK.line}` }}>
              <td style={{ padding: "4px 8px", width: "42%", fontSize: "8.5pt", fontWeight: 700, color: HAWK.navy, textTransform: "uppercase", verticalAlign: "top" }}>
                {label}
              </td>
              <td style={{ padding: "4px 8px", fontSize: "10pt", color: HAWK.ink, verticalAlign: "top" }}>
                {value || "\u00A0"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}