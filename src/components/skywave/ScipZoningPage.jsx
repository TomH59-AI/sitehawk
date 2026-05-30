import { SKYWAVE } from "@/lib/skywave";

// Print section — HAWK ZONING & PERMITTING table, mirrors the client xlsx 1:1.
// Each cell reads report.<section>.<key> => { value, source, confidence }.
const GROUPS = [
  {
    title: "Zoning Overview",
    section: "zoning_overview",
    rows: [
      ["zoning_jurisdiction", "Zoning Jurisdiction"],
      ["zoning_contact_information", "Zoning Contact Information"],
      ["zoning_process", "Zoning Process"],
      ["zoning_fees", "Zoning Fees"],
      ["zoning_approval_timeframe", "Zoning Approval Timeframe"],
      ["property_zoning_district", "Property Zoning District"],
      ["property_future_land_use", "Property Future Land Use"],
      ["property_current_usage", "Property Current Usage"],
      ["meets_minimum_lot_requirements", "Meets minimum lot requirements?"],
    ],
  },
  {
    title: "Tower Specifics",
    section: "tower_specifics",
    rows: [
      ["ldc_section_reference", "LDC Section Reference(s)"],
      ["maximum_tower_height", "Maximum Tower Height"],
      ["stealth_required", "Stealth Required?"],
      ["required_collocations", "Required Collocations (#)"],
      ["residential_separation", "Residential Separation (ft or %)"],
      ["tower_separation", "Tower Separation (ft or %)"],
      ["measured_from", "Measured from base or center"],
      ["fall_zone_requirements", "Fall Zone Requirements"],
      ["special_tower_landscaping", "Special Tower Landscaping?"],
    ],
  },
  {
    title: "Site Plan Overview",
    section: "site_plan",
    rows: [
      ["site_plan_jurisdiction", "Site Plan Jurisdiction"],
      ["site_plan_contact_information", "Site Plan Contact Information"],
      ["site_plan_fees", "Site Plan Fees"],
      ["timeframe_for_approval", "Timeframe for approval"],
      ["existing_site_plan_to_amend", "Existing Site Plan to Amend?"],
      ["concurrent_to_zoning_or_bp", "Concurrent to Zoning or BP?"],
      ["submittal_deadlines", "Submittal deadlines?"],
      ["submittal_format", "Electronic, hard copy, or both?"],
    ],
  },
  {
    title: "Building Permit Information",
    section: "building_permit",
    rows: [
      ["building_permit_jurisdiction", "Building Permit Jurisdiction"],
      ["building_department_contact_info", "Building Department Contact Info"],
      ["gc_submits", "Does GC have to submit?"],
      ["building_permit_fees", "Building Permit Fees"],
      ["building_permit_timeframe", "Building Permit Timeframe"],
      ["bond_required", "Bond Required?"],
      ["e911_address_assigned", "E911 Address assigned?"],
    ],
  },
];

function cell(report, section, key) {
  const c = report?.[section]?.[key];
  const v = c?.value;
  if (v == null || v === "") return { value: "\u00A0", source: null };
  return { value: String(v), source: c?.source || null };
}

export default function ScipZoningPage({ report = {} }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {GROUPS.map((g) => (
        <table key={g.section} className="w-full" style={{ borderCollapse: "collapse", fontSize: "9pt" }}>
          <thead>
            <tr>
              <th
                colSpan={3}
                className="text-left"
                style={{
                  padding: "6px 8px", color: "#fff", background: SKYWAVE.blue,
                  border: `1px solid ${SKYWAVE.line}`, fontWeight: 700, textTransform: "uppercase",
                  printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
                }}
              >
                {g.title}
              </th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map(([key, label]) => {
              const c = cell(report, g.section, key);
              return (
                <tr key={key}>
                  <td style={{ padding: "5px 8px", width: "34%", color: SKYWAVE.navy, fontWeight: 700, border: `1px solid ${SKYWAVE.line}`, verticalAlign: "top" }}>
                    {label}
                  </td>
                  <td style={{ padding: "5px 8px", color: SKYWAVE.ink, border: `1px solid ${SKYWAVE.line}`, verticalAlign: "top" }}>
                    {c.value}
                  </td>
                  <td style={{ padding: "5px 8px", width: "14%", color: SKYWAVE.muted, border: `1px solid ${SKYWAVE.line}`, verticalAlign: "top", fontSize: "7.5pt" }}>
                    {c.source || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}