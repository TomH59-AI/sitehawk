import { SKYWAVE } from "@/lib/skywave";

// Auto-populated only — a value is "blank" when null/undefined/empty after trim.
const isBlank = (v) => v == null || String(v).trim() === "";

const ROWS = [
  ["flood_zone", "Flood Zone(s)"],
  ["wetland_concerns", "Wetland Concerns?"],
  ["water_management_district", "Water Management District"],
  ["hazardous_waste", "Hazardous Waste Concerns?"],
  ["access_notes", "Access Notes (ROW, driveway, code)"],
  ["local_police", "Local Police (municipality & phone)"],
  ["local_fire", "Local Fire Dept (municipality & phone)"],
];

// Print section — EXISTING CONDITIONS table matching the client spreadsheet.
export default function ScipExistingConditionsPage({ conditions = {} }) {
  return (
    <table className="w-full" style={{ borderCollapse: "collapse", fontSize: "10pt" }}>
      <thead>
        <tr>
          <th
            colSpan={2}
            className="text-left"
            style={{
              padding: "8px 8px", color: "#fff", background: SKYWAVE.blue,
              border: `1px solid ${SKYWAVE.line}`, fontWeight: 700, textTransform: "uppercase",
              printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
            }}
          >
            Existing Conditions
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(([key, label]) => {
          // Skip any row whose condition value is blank.
          if (isBlank(conditions[key])) return null;
          return (
          <tr key={key}>
            <td style={{ padding: "8px", width: "38%", color: SKYWAVE.navy, fontWeight: 700, border: `1px solid ${SKYWAVE.line}`, verticalAlign: "top" }}>
              {label}
            </td>
            <td style={{ padding: "8px", color: SKYWAVE.ink, border: `1px solid ${SKYWAVE.line}`, verticalAlign: "top" }}>
              {conditions[key]}
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}