import { SKYWAVE } from "@/lib/skywave";

const ROWS = [
  ["owner_name", "Owner's Name"],
  ["parcel_address", "Parcel Address"],
  ["apn", "Parcel ID"],
  ["acreage", "Parcel Size (acres)"],
  ["boundaries", "Boundaries"],
  ["zoning_classification", "Zoning Classification"],
  ["mailing_address", "Owner's Mailing Address"],
  ["coordinates", "Coordinates"],
  ["fema_risk_factor", "FEMA Risk Factor"],
];

function cellValue(t, key) {
  if (!t) return "";
  if (key === "coordinates") {
    return t.latitude != null && t.longitude != null ? `${Number(t.latitude).toFixed(5)}, ${Number(t.longitude).toFixed(5)}` : "";
  }
  const v = t[key];
  if (v == null || v === "") return "";
  if (key === "acreage") return Number(v).toFixed(3);
  return String(v);
}

// Print page 3 — the HAWK PARCEL DATA side-by-side table (Target A / B / C).
export default function ScipParcelDataPage({ targets = [], activeIdx = 0 }) {
  if (!targets.length) return null;
  // Ensure 3 columns even if fewer were found.
  const cols = [0, 1, 2].map((i) => targets[i] || { label: ["Target A", "Target B", "Target C"][i] });

  return (
    <table className="w-full" style={{ borderCollapse: "collapse", fontSize: "9pt" }}>
      <thead>
        <tr>
          <th className="text-left" style={{ width: "22%", padding: "8px 6px", color: SKYWAVE.navy, background: "#fff", border: `1px solid ${SKYWAVE.line}`, fontWeight: 700, textTransform: "uppercase" }}>
            Hawk Parcel Data
          </th>
          {cols.map((t, i) => (
            <th
              key={i}
              className="text-center"
              style={{
                width: "26%", padding: "8px 6px", fontWeight: 700,
                color: i === activeIdx ? "#000" : SKYWAVE.navy,
                background: i === activeIdx ? SKYWAVE.yellow : SKYWAVE.blue,
                ...(i !== activeIdx ? { color: "#fff" } : {}),
                border: `1px solid ${SKYWAVE.line}`,
                printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
              }}
            >
              {t.label}{i === activeIdx ? " ★" : ""}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map(([key, label]) => (
          <tr key={key}>
            <td style={{ padding: "7px 6px", color: SKYWAVE.blue, fontWeight: 600, border: `1px solid ${SKYWAVE.line}`, verticalAlign: "top" }}>
              {label}:
            </td>
            {cols.map((t, i) => (
              <td
                key={i}
                style={{
                  padding: "7px 6px", color: SKYWAVE.ink, border: `1px solid ${SKYWAVE.line}`, verticalAlign: "top",
                  background: i === activeIdx ? "rgba(255,199,44,0.10)" : "#fff",
                  printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
                }}
              >
                {cellValue(t, key) || "\u00A0"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}